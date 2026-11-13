-- Como um onibus: depois que o motorista sai, quem esta mais a frente na rota ainda pode pedir carona,
-- desde que o carro ainda nao tenha passado pelo ponto de embarque (com folga de 300 m).

-- fracao da rota (0 a 1) onde o carro esta agora, ou null sem posicao recente
create or replace function public.fracao_carro(p_viagem uuid)
returns double precision language sql stable security definer set search_path = public, extensions as $$
  select st_linelocatepoint(v.rota::geometry, st_setsrid(st_makepoint(pv.lng, pv.lat), 4326))
    from viagens v join posicao_viagem pv on pv.viagem_id = v.id
   where v.id = p_viagem and v.status = 'em_andamento' and pv.atualizado_em > now() - interval '3 minutes';
$$;

-- horario previsto do carro no ponto (fracao f da rota): pela posicao ao vivo, se houver; senao pelo horario
create or replace function public.horario_no_ponto(p_viagem uuid, f double precision)
returns timestamptz language sql stable security definer set search_path = public, extensions as $$
  select case
           when fc.pos is not null then now() + make_interval(secs => greatest(horario_no_ponto.f - fc.pos, 0) * v.duracao_s)
           else v.partida_em + make_interval(secs => v.duracao_s * horario_no_ponto.f)
         end
    from viagens v cross join lateral (select public.fracao_carro(v.id) as pos) fc
   where v.id = p_viagem;
$$;

-- ainda da tempo de pegar o carro neste ponto?
create or replace function public.carro_antes_do_ponto(p_viagem uuid, f double precision)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select case
           when v.status = 'aberta' then v.partida_em + make_interval(secs => v.duracao_s * carro_antes_do_ponto.f) >= now()
           when v.status <> 'em_andamento' then false
           when fc.pos is not null then (carro_antes_do_ponto.f - fc.pos) * v.distancia_m > 300
           else v.partida_em + make_interval(secs => v.duracao_s * carro_antes_do_ponto.f) > now() + interval '2 minutes'
         end
    from viagens v cross join lateral (select public.fracao_carro(v.id) as pos) fc
   where v.id = p_viagem;
$$;

create or replace function public.buscar_viagens(origem_lng double precision, origem_lat double precision, destino_lng double precision, destino_lat double precision, a_partir timestamp with time zone DEFAULT now(), ate timestamp with time zone DEFAULT (now() + '12:00:00'::interval), raio_m integer DEFAULT 500)
 RETURNS TABLE(viagem_id uuid, motorista_id uuid, motorista_nome text, motorista_nota numeric, motorista_total_avaliacoes integer, carro text, origem_nome text, destino_nome text, partida_em timestamp with time zone, tarifa numeric, vagas_livres integer, embarque_lng double precision, embarque_lat double precision, desembarque_lng double precision, desembarque_lat double precision, embarque_previsto timestamp with time zone, caminhada_embarque_m integer, caminhada_desembarque_m integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
  with pontos as (
    select st_setsrid(st_makepoint(origem_lng, origem_lat), 4326) as o,
           st_setsrid(st_makepoint(destino_lng, destino_lat), 4326) as d
  ),
  candidatas as (
    select v.*, p.nome, p.nota_media, p.total_avaliacoes,
           concat_ws(' ', p.carro_modelo, p.carro_cor) as carro,
           st_linelocatepoint(v.rota::geometry, pt.o) as f_emb,
           st_linelocatepoint(v.rota::geometry, pt.d) as f_des,
           pt.o, pt.d
      from viagens v
      join perfis p on p.id = v.motorista_id
      cross join pontos pt
     where v.status in ('aberta', 'em_andamento')
       and v.partida_em between a_partir - interval '90 minutes' and ate
       and v.motorista_id <> auth.uid()
       and not p.suspenso
       and st_dwithin(v.rota, pt.o::geography, raio_m)
       and st_dwithin(v.rota, pt.d::geography, raio_m)
  )
  select c.id, c.motorista_id, c.nome, c.nota_media, c.total_avaliacoes, c.carro,
         c.origem_nome, c.destino_nome, c.partida_em, c.tarifa,
         c.vagas - (select count(*) from reservas r
                     where r.viagem_id = c.id and r.status = 'confirmada')::int,
         st_x(e.pt), st_y(e.pt), st_x(s.pt), st_y(s.pt),
         public.horario_no_ponto(c.id, c.f_emb),
         st_distance(e.pt::geography, c.o::geography)::int,
         st_distance(s.pt::geography, c.d::geography)::int
    from candidatas c
    cross join lateral (select st_lineinterpolatepoint(c.rota::geometry, c.f_emb) as pt) e
    cross join lateral (select st_lineinterpolatepoint(c.rota::geometry, c.f_des) as pt) s
   where c.f_emb < c.f_des
     and public.carro_antes_do_ponto(c.id, c.f_emb)
     and c.vagas > (select count(*) from reservas r
                     where r.viagem_id = c.id and r.status = 'confirmada')
   order by 16;
$function$;

create or replace function public.reservar_interno(p_viagem_id uuid, p_passageiro uuid, origem_lng double precision, origem_lat double precision, destino_lng double precision, destino_lat double precision, p_embarque_lng double precision, p_embarque_lat double precision, p_embarque_nome text, p_recorrente uuid, p_aprovacao text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  v viagens%rowtype;
  o geometry := st_setsrid(st_makepoint(origem_lng, origem_lat), 4326);
  d geometry := st_setsrid(st_makepoint(destino_lng, destino_lat), 4326);
  emb geometry; des geometry;
  f_emb double precision; f_des double precision;
  ocupadas int; nova uuid;
begin
  if exists (select 1 from perfis where id = p_passageiro and suspenso) then
    raise exception 'Sua conta está suspensa para revisão';
  end if;
  select * into v from viagens where id = p_viagem_id for update;
  if not found or v.status not in ('aberta', 'em_andamento') then raise exception 'Viagem indisponível'; end if;
  if v.motorista_id = p_passageiro then raise exception 'Você é o motorista desta viagem'; end if;
  if exists (select 1 from reservas where viagem_id = v.id and passageiro_id = p_passageiro and status <> 'cancelada') then
    return null;
  end if;
  select count(*) into ocupadas from reservas where viagem_id = v.id and status = 'confirmada';
  if ocupadas >= v.vagas then raise exception 'Não há vagas livres'; end if;

  if p_embarque_lng is not null then
    emb := st_setsrid(st_makepoint(p_embarque_lng, p_embarque_lat), 4326);
    if not st_dwithin(v.rota, emb::geography, 30) then emb := null; end if;
  end if;
  if emb is null then
    emb := st_closestpoint(v.rota::geometry, o);
    p_embarque_nome := null;
  end if;
  f_emb := st_linelocatepoint(v.rota::geometry, emb);
  f_des := st_linelocatepoint(v.rota::geometry, d);
  des := st_lineinterpolatepoint(v.rota::geometry, f_des);
  if f_emb >= f_des then raise exception 'A viagem vai no sentido contrário'; end if;
  if st_distance(emb::geography, o::geography) > 600 or st_distance(des::geography, d::geography) > 600 then
    raise exception 'A rota não passa perto o bastante';
  end if;
  if not public.carro_antes_do_ponto(v.id, f_emb) then
    raise exception 'O carro já passou por este ponto';
  end if;

  insert into reservas (viagem_id, passageiro_id, embarque, desembarque, embarque_nome, embarque_previsto,
                        caminhada_embarque_m, caminhada_desembarque_m, recorrente_id, aprovacao)
  values (v.id, p_passageiro, emb::geography, des::geography, p_embarque_nome,
          public.horario_no_ponto(v.id, f_emb),
          st_distance(emb::geography, o::geography)::int, st_distance(des::geography, d::geography)::int,
          p_recorrente, p_aprovacao)
  returning id into nova;
  return nova;
end $function$;

create or replace function public.reservar(p_viagem_id uuid, origem_lng double precision, origem_lat double precision, destino_lng double precision, destino_lat double precision, p_embarque_lng double precision DEFAULT NULL::double precision, p_embarque_lat double precision DEFAULT NULL::double precision, p_embarque_nome text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  v viagens%rowtype;
  o geometry := st_setsrid(st_makepoint(origem_lng, origem_lat), 4326);
  d geometry := st_setsrid(st_makepoint(destino_lng, destino_lat), 4326);
  emb geometry; des geometry;
  f_emb double precision; f_des double precision;
  ocupadas int;
  nova uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para reservar'; end if;
  if exists (select 1 from perfis where id = auth.uid() and suspenso) then
    raise exception 'Sua conta está suspensa para revisão';
  end if;

  select * into v from viagens where id = p_viagem_id for update;
  if not found or v.status not in ('aberta', 'em_andamento') then raise exception 'Viagem indisponível'; end if;
  if v.motorista_id = auth.uid() then raise exception 'Você é o motorista desta viagem'; end if;

  select count(*) into ocupadas from reservas
   where viagem_id = v.id and status = 'confirmada';
  if ocupadas >= v.vagas then raise exception 'Não há vagas livres'; end if;

  if p_embarque_lng is not null then
    emb := st_setsrid(st_makepoint(p_embarque_lng, p_embarque_lat), 4326);
    if not st_dwithin(v.rota, emb::geography, 30) then emb := null; end if;
  end if;
  if emb is null then
    emb := st_closestpoint(v.rota::geometry, o);
    p_embarque_nome := null;
  end if;
  f_emb := st_linelocatepoint(v.rota::geometry, emb);
  f_des := st_linelocatepoint(v.rota::geometry, d);
  des := st_lineinterpolatepoint(v.rota::geometry, f_des);

  if f_emb >= f_des then raise exception 'A viagem vai no sentido contrário'; end if;
  if st_distance(emb::geography, o::geography) > 600
     or st_distance(des::geography, d::geography) > 600 then
    raise exception 'A rota não passa perto o bastante';
  end if;
  if not public.carro_antes_do_ponto(v.id, f_emb) then
    raise exception 'O carro já passou por este ponto';
  end if;

  insert into reservas (viagem_id, passageiro_id, embarque, desembarque, embarque_nome,
                        embarque_previsto, caminhada_embarque_m, caminhada_desembarque_m)
  values (v.id, auth.uid(), emb::geography, des::geography, p_embarque_nome,
          public.horario_no_ponto(v.id, f_emb),
          st_distance(emb::geography, o::geography)::int,
          st_distance(des::geography, d::geography)::int)
  returning id into nova;
  return nova;
end $function$;
