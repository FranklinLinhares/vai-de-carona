-- Etapa 2: viagens recorrentes do motorista e reserva semanal do passageiro (tudo aditivo).

create table public.series_viagem (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references public.perfis (id) on delete cascade,
  dias smallint[] not null check (array_length(dias, 1) between 1 and 7), -- 0 = domingo ... 6 = sabado
  hora time not null,
  origem_nome text not null,
  destino_nome text not null,
  rota extensions.geography(LineString, 4326) not null,
  distancia_m int not null,
  duracao_s int not null,
  vagas int not null check (vagas between 1 and 4),
  tarifa numeric(6,2) not null,
  so_mulheres boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.series_viagem enable row level security;
create policy "motorista ve as proprias series" on public.series_viagem
  for select to authenticated using (motorista_id = auth.uid());

alter table public.viagens add column if not exists serie_id uuid references public.series_viagem (id) on delete set null;
create index if not exists viagens_serie_idx on public.viagens (serie_id, partida_em);

create table public.reservas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null references public.series_viagem (id) on delete cascade,
  passageiro_id uuid not null references public.perfis (id) on delete cascade,
  origem extensions.geography(Point, 4326) not null,
  destino extensions.geography(Point, 4326) not null,
  embarque extensions.geography(Point, 4326),
  embarque_nome text,
  aceita boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index reservas_recorrentes_uma on public.reservas_recorrentes (serie_id, passageiro_id) where ativa;
alter table public.reservas_recorrentes enable row level security;
create policy "passageiro e motorista veem a recorrencia" on public.reservas_recorrentes
  for select to authenticated using (
    passageiro_id = auth.uid()
    or exists (select 1 from public.series_viagem s where s.id = serie_id and s.motorista_id = auth.uid())
  );

alter table public.reservas add column if not exists recorrente_id uuid references public.reservas_recorrentes (id) on delete set null;

-- Reserva interna (usada pela recorrencia): mesmas regras de reservar(), com passageiro explicito
create or replace function public.reservar_interno(
  p_viagem_id uuid, p_passageiro uuid,
  origem_lng double precision, origem_lat double precision,
  destino_lng double precision, destino_lat double precision,
  p_embarque_lng double precision, p_embarque_lat double precision, p_embarque_nome text,
  p_recorrente uuid, p_aprovacao text
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
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
  if not found or v.status <> 'aberta' then raise exception 'Viagem indisponível'; end if;
  if v.motorista_id = p_passageiro then raise exception 'Você é o motorista desta viagem'; end if;
  if exists (select 1 from reservas where viagem_id = v.id and passageiro_id = p_passageiro and status <> 'cancelada') then
    return null; -- ja reservado
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

  insert into reservas (viagem_id, passageiro_id, embarque, desembarque, embarque_nome, embarque_previsto,
                        caminhada_embarque_m, caminhada_desembarque_m, recorrente_id, aprovacao)
  values (v.id, p_passageiro, emb::geography, des::geography, p_embarque_nome,
          v.partida_em + make_interval(secs => v.duracao_s * f_emb),
          st_distance(emb::geography, o::geography)::int, st_distance(des::geography, d::geography)::int,
          p_recorrente, p_aprovacao)
  returning id into nova;
  return nova;
end $$;
revoke execute on function public.reservar_interno from public, anon, authenticated;

-- Gera as viagens da serie para os proximos dias e aplica as reservas semanais
create or replace function public.gerar_viagens_serie(p_serie uuid, p_dias int default 14)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  s series_viagem%rowtype; dia date; partida timestamptz; nova uuid; criadas int := 0; rec reservas_recorrentes%rowtype;
begin
  select * into s from series_viagem where id = p_serie and ativa;
  if not found then return 0; end if;
  perform set_config('vdc.silencio', '1', true);
  for i in 0 .. p_dias - 1 loop
    dia := (now() at time zone 'America/Fortaleza')::date + i;
    continue when not (extract(dow from dia)::smallint = any (s.dias));
    partida := (dia + s.hora) at time zone 'America/Fortaleza';
    continue when partida < now() + interval '10 minutes';
    continue when exists (select 1 from viagens where serie_id = s.id and partida_em = partida);
    begin
      insert into viagens (motorista_id, origem_nome, destino_nome, rota, distancia_m, duracao_s,
                           partida_em, vagas, tarifa, so_mulheres, serie_id)
      values (s.motorista_id, s.origem_nome, s.destino_nome, s.rota, s.distancia_m, s.duracao_s,
              partida, s.vagas, s.tarifa, s.so_mulheres, s.id)
      returning id into nova;
      criadas := criadas + 1;
    exception when others then
      continue; -- ex.: limite de 2 por dia
    end;
    for rec in select * from reservas_recorrentes where serie_id = s.id and ativa loop
      begin
        perform reservar_interno(nova, rec.passageiro_id,
          st_x(rec.origem::geometry), st_y(rec.origem::geometry),
          st_x(rec.destino::geometry), st_y(rec.destino::geometry),
          st_x(rec.embarque::geometry), st_y(rec.embarque::geometry), rec.embarque_nome,
          rec.id, case when rec.aceita then 'aceita' else 'pendente' end);
      exception when others then null;
      end;
    end loop;
  end loop;
  perform set_config('vdc.silencio', '0', true);
  return criadas;
end $$;
revoke execute on function public.gerar_viagens_serie from public, anon, authenticated;

create or replace function public.gerar_todas_series()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; s record;
begin
  for s in select id from series_viagem where ativa loop
    total := total + gerar_viagens_serie(s.id);
  end loop;
  return total;
end $$;
revoke execute on function public.gerar_todas_series from public, anon, authenticated;

-- Motorista cria a serie (gera as viagens das proximas 2 semanas)
create or replace function public.criar_serie(
  p_origem_nome text, p_destino_nome text, p_rota_geojson json,
  p_distancia_m int, p_duracao_s int, p_dias smallint[], p_hora time,
  p_vagas int, p_tarifa numeric, p_so_mulheres boolean default false
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare nova uuid;
begin
  if not pode_dirigir(auth.uid()) then raise exception 'Complete seus dados de motorista'; end if;
  if p_so_mulheres and coalesce((select genero from perfis where id = auth.uid()), '') <> 'feminino' then
    raise exception 'Só motoristas mulheres podem criar viagens só para mulheres';
  end if;
  insert into series_viagem (motorista_id, dias, hora, origem_nome, destino_nome, rota, distancia_m, duracao_s, vagas, tarifa, so_mulheres)
  values (auth.uid(), p_dias, p_hora, p_origem_nome, p_destino_nome,
          st_setsrid(st_geomfromgeojson(p_rota_geojson::text), 4326)::geography,
          p_distancia_m, p_duracao_s, p_vagas, p_tarifa, coalesce(p_so_mulheres, false))
  returning id into nova;
  perform gerar_viagens_serie(nova);
  return nova;
end $$;
revoke execute on function public.criar_serie from anon;

create or replace function public.encerrar_serie(p_serie uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update series_viagem set ativa = false where id = p_serie and motorista_id = auth.uid();
  if not found then raise exception 'Série não encontrada'; end if;
  perform set_config('vdc.silencio', '1', true);
  insert into notificacoes (usuario_id, titulo, texto, link)
  select distinct r.passageiro_id, 'Carona recorrente encerrada',
         (select split_part(nome, ' ', 1) from perfis where id = auth.uid()) || ' encerrou as viagens recorrentes. Busque outra carona.', '/carona'
    from reservas r join viagens v on v.id = r.viagem_id
   where v.serie_id = p_serie and v.status = 'aberta' and v.partida_em > now() and r.status = 'confirmada';
  update viagens set status = 'cancelada' where serie_id = p_serie and status = 'aberta' and partida_em > now();
  update reservas_recorrentes set ativa = false where serie_id = p_serie;
  perform set_config('vdc.silencio', '0', true);
end $$;
revoke execute on function public.encerrar_serie from anon;

-- Passageiro reserva "toda semana": esta viagem e as proximas da serie
create or replace function public.reservar_serie(
  p_viagem_id uuid,
  origem_lng double precision, origem_lat double precision,
  destino_lng double precision, destino_lat double precision,
  p_embarque_lng double precision default null,
  p_embarque_lat double precision default null,
  p_embarque_nome text default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v viagens%rowtype; rec uuid; outra record; primeira uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para reservar'; end if;
  select * into v from viagens where id = p_viagem_id;
  if not found or v.serie_id is null then raise exception 'Esta viagem não se repete'; end if;
  insert into reservas_recorrentes (serie_id, passageiro_id, origem, destino, embarque, embarque_nome)
  values (v.serie_id, auth.uid(),
          st_setsrid(st_makepoint(origem_lng, origem_lat), 4326)::geography,
          st_setsrid(st_makepoint(destino_lng, destino_lat), 4326)::geography,
          case when p_embarque_lng is null then null else st_setsrid(st_makepoint(p_embarque_lng, p_embarque_lat), 4326)::geography end,
          p_embarque_nome)
  returning id into rec;
  -- a primeira precisa dar certo; as outras sao melhor esforco
  primeira := reservar_interno(p_viagem_id, auth.uid(), origem_lng, origem_lat, destino_lng, destino_lat,
                               p_embarque_lng, p_embarque_lat, p_embarque_nome, rec, 'pendente');
  perform set_config('vdc.silencio', '1', true);
  for outra in select id from viagens where serie_id = v.serie_id and id <> v.id and status = 'aberta' and partida_em > now() loop
    begin
      perform reservar_interno(outra.id, auth.uid(), origem_lng, origem_lat, destino_lng, destino_lat,
                               p_embarque_lng, p_embarque_lat, p_embarque_nome, rec, 'pendente');
    exception when others then null;
    end;
  end loop;
  perform set_config('vdc.silencio', '0', true);
  return rec;
end $$;
revoke execute on function public.reservar_serie from anon;

create or replace function public.cancelar_recorrencia(p_recorrente uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update reservas_recorrentes set ativa = false where id = p_recorrente and passageiro_id = auth.uid();
  if not found then raise exception 'Reserva semanal não encontrada'; end if;
  perform set_config('vdc.silencio', '1', true);
  update reservas set status = 'cancelada'
   where recorrente_id = p_recorrente and status = 'confirmada' and embarque_previsto > now();
  perform set_config('vdc.silencio', '0', true);
  insert into notificacoes (usuario_id, titulo, texto, link)
  select s.motorista_id, 'Reserva semanal cancelada',
         (select split_part(nome, ' ', 1) from perfis where id = auth.uid()) || ' não vai mais nas suas viagens recorrentes.', '/motorista'
    from reservas_recorrentes r join series_viagem s on s.id = r.serie_id where r.id = p_recorrente;
end $$;
revoke execute on function public.cancelar_recorrencia from anon;

-- Aceite/recusa de uma reserva semanal vale para todas as viagens dela
create or replace function public.propagar_aprovacao_recorrente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recorrente_id is null or new.aprovacao = old.aprovacao or pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.aprovacao = 'aceita' then
    update reservas_recorrentes set aceita = true where id = new.recorrente_id;
    update reservas set aprovacao = 'aceita'
     where recorrente_id = new.recorrente_id and id <> new.id and aprovacao = 'pendente' and status = 'confirmada';
  elsif new.aprovacao = 'recusada' then
    update reservas_recorrentes set ativa = false where id = new.recorrente_id;
    update reservas set aprovacao = 'recusada', status = 'cancelada'
     where recorrente_id = new.recorrente_id and id <> new.id and aprovacao = 'pendente' and status = 'confirmada';
  end if;
  return new;
end $$;
create trigger reservas_propagar_recorrente after update of aprovacao on public.reservas
  for each row execute function public.propagar_aprovacao_recorrente();

-- Avisos: nao repete aviso para cada viagem de uma serie
create or replace function public.notificar_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
declare v viagens%rowtype; nome_passageiro text; nome_motorista text;
begin
  if current_setting('vdc.silencio', true) = '1' then
    return new; -- operacao em lote que ja avisa uma vez so
  end if;
  if pg_trigger_depth() > 1 and new.recorrente_id is not null then
    return new; -- efeito em cascata de uma reserva semanal
  end if;
  select * into v from viagens where id = new.viagem_id;
  select split_part(nome, ' ', 1) into nome_passageiro from perfis where id = new.passageiro_id;
  select split_part(nome, ' ', 1) into nome_motorista from perfis where id = v.motorista_id;
  if tg_op = 'INSERT' then
    if new.aprovacao = 'aceita' then return new; end if; -- reserva semanal ja aceita
    insert into notificacoes (usuario_id, titulo, texto, link) values
      (v.motorista_id,
       case when new.recorrente_id is null then 'Novo pedido de carona' else 'Novo pedido semanal' end,
       nome_passageiro || ' quer embarcar às ' || to_char(new.embarque_previsto at time zone 'America/Fortaleza', 'HH24:MI')
         || case when new.recorrente_id is null then '' else ', toda semana' end || '. Aceite ou recuse.',
       '/motorista');
  elsif new.aprovacao <> old.aprovacao then
    insert into notificacoes (usuario_id, titulo, texto, link) values
      (new.passageiro_id,
       case when new.aprovacao = 'aceita' then 'Carona confirmada!' else 'Pedido recusado' end,
       case when new.aprovacao = 'aceita'
            then nome_motorista || ' aceitou. Embarque às ' || to_char(new.embarque_previsto at time zone 'America/Fortaleza', 'HH24:MI') || '.'
            else nome_motorista || ' não pode levar você desta vez. Busque outra carona.' end,
       '/minhas-caronas');
  elsif new.status = 'cancelada' and old.status <> 'cancelada' and old.aprovacao <> 'recusada' and new.aprovacao <> 'recusada' then
    insert into notificacoes (usuario_id, titulo, texto, link)
    select case when v.status = 'cancelada' then new.passageiro_id else v.motorista_id end,
           'Carona cancelada',
           case when v.status = 'cancelada' then nome_motorista || ' cancelou a viagem.'
                else nome_passageiro || ' cancelou a reserva.' end,
           case when v.status = 'cancelada' then '/minhas-caronas' else '/motorista' end;
  end if;
  return new;
end $$;

-- Views com as colunas novas no fim
create or replace view public.reservas_detalhe with (security_invoker = true) as
  select r.id, r.viagem_id, r.passageiro_id, r.embarque, r.desembarque, r.embarque_nome,
         r.embarque_previsto, r.caminhada_embarque_m, r.caminhada_desembarque_m, r.status, r.criado_em,
         st_x(r.embarque::geometry) as embarque_lng, st_y(r.embarque::geometry) as embarque_lat,
         st_x(r.desembarque::geometry) as desembarque_lng, st_y(r.desembarque::geometry) as desembarque_lat,
         r.aprovacao, r.recorrente_id
    from public.reservas r;

create or replace view public.viagens_detalhe with (security_invoker = true) as
  select v.id, v.motorista_id, v.origem_nome, v.destino_nome, v.distancia_m, v.duracao_s,
         v.partida_em, v.vagas, v.tarifa, v.status, v.criado_em,
         st_asgeojson(v.rota::geometry)::json as rota_geojson,
         v.so_mulheres, v.serie_id
    from public.viagens v;

-- Todo dia as 6h (UTC) estende as series ativas para as proximas 2 semanas
create extension if not exists pg_cron;
select cron.schedule('gerar-viagens-recorrentes', '0 6 * * *', $$select public.gerar_todas_series()$$);
