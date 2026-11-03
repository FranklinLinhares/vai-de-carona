-- Vai de carona: esquema inicial do MVP
create extension if not exists postgis with schema extensions;

-- Perfis -------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  telefone text not null,
  foto_url text,
  cpf text,
  -- motorista
  cnh text,
  carro_modelo text,
  carro_cor text,
  carro_placa text,
  chave_pix text,
  nota_media numeric(3,2),
  total_avaliacoes int not null default 0,
  suspenso boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;
create policy "perfis visiveis para usuarios logados" on public.perfis
  for select to authenticated using (true);
create policy "usuario cria o proprio perfil" on public.perfis
  for insert to authenticated with check (id = auth.uid());
create policy "usuario edita o proprio perfil" on public.perfis
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid());

-- Campos controlados pelo sistema nao podem ser alterados pelo usuario
create or replace function public.proteger_campos_perfil()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.nota_media := null;
      new.total_avaliacoes := 0;
      new.suspenso := false;
    else
      new.nota_media := old.nota_media;
      new.total_avaliacoes := old.total_avaliacoes;
      new.suspenso := old.suspenso;
    end if;
  end if;
  return new;
end $$;
create trigger perfis_proteger before insert or update on public.perfis
  for each row execute function public.proteger_campos_perfil();

-- Viagens (publicadas pelo motorista) ---------------------------------------
create table public.viagens (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references public.perfis (id) on delete cascade,
  origem_nome text not null,
  destino_nome text not null,
  rota extensions.geography(LineString, 4326) not null,
  distancia_m int not null,
  duracao_s int not null,
  partida_em timestamptz not null,
  vagas int not null check (vagas between 1 and 4),
  tarifa numeric(6,2) not null check (tarifa >= 0),
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'concluida', 'cancelada')),
  criado_em timestamptz not null default now()
);
create index viagens_rota_idx on public.viagens using gist (rota);
create index viagens_partida_idx on public.viagens (partida_em);

alter table public.viagens enable row level security;
create policy "viagens visiveis para usuarios logados" on public.viagens
  for select to authenticated using (true);
create policy "motorista publica viagem" on public.viagens
  for insert to authenticated with check (
    motorista_id = auth.uid()
    and exists (
      select 1 from public.perfis p
      where p.id = auth.uid() and not p.suspenso
        and p.cnh is not null and p.carro_placa is not null
    )
  );
create policy "motorista atualiza a propria viagem" on public.viagens
  for update to authenticated using (motorista_id = auth.uid())
  with check (motorista_id = auth.uid());

-- Reservas (passageiro numa viagem) -----------------------------------------
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  viagem_id uuid not null references public.viagens (id) on delete cascade,
  passageiro_id uuid not null references public.perfis (id) on delete cascade,
  embarque extensions.geography(Point, 4326) not null,
  desembarque extensions.geography(Point, 4326) not null,
  embarque_nome text,
  embarque_previsto timestamptz not null,
  caminhada_embarque_m int not null,
  caminhada_desembarque_m int not null,
  status text not null default 'confirmada'
    check (status in ('confirmada', 'cancelada', 'concluida')),
  criado_em timestamptz not null default now()
);
create unique index reservas_uma_por_viagem
  on public.reservas (viagem_id, passageiro_id) where status <> 'cancelada';

alter table public.reservas enable row level security;
create policy "passageiro e motorista veem a reserva" on public.reservas
  for select to authenticated using (
    passageiro_id = auth.uid()
    or exists (select 1 from public.viagens v
               where v.id = viagem_id and v.motorista_id = auth.uid())
  );
-- Inserir somente via funcao reservar(); passageiro so pode cancelar
create policy "passageiro cancela a propria reserva" on public.reservas
  for update to authenticated using (passageiro_id = auth.uid())
  with check (passageiro_id = auth.uid() and status = 'cancelada');

-- Avaliacoes ----------------------------------------------------------------
create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  viagem_id uuid not null references public.viagens (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  avaliado_id uuid not null references public.perfis (id) on delete cascade,
  nota int not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamptz not null default now(),
  unique (viagem_id, autor_id, avaliado_id),
  check (autor_id <> avaliado_id)
);

alter table public.avaliacoes enable row level security;
create policy "avaliacoes visiveis" on public.avaliacoes
  for select to authenticated using (true);
-- So avalia quem participou da mesma viagem concluida
create policy "participante avalia" on public.avaliacoes
  for insert to authenticated with check (
    autor_id = auth.uid()
    and exists (
      select 1 from public.viagens v
      where v.id = viagem_id and v.status = 'concluida'
        and (
          (v.motorista_id = auth.uid() and exists (
             select 1 from public.reservas r where r.viagem_id = v.id
               and r.passageiro_id = avaliado_id and r.status <> 'cancelada'))
          or
          (v.motorista_id = avaliado_id and exists (
             select 1 from public.reservas r where r.viagem_id = v.id
               and r.passageiro_id = auth.uid() and r.status <> 'cancelada'))
        )
    )
  );

-- Atualiza media e suspende quem fica com nota baixa (>= 3 avaliacoes, media < 3)
create or replace function public.atualizar_nota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m numeric; t int;
begin
  select avg(nota), count(*) into m, t from avaliacoes where avaliado_id = new.avaliado_id;
  update perfis set nota_media = round(m, 2), total_avaliacoes = t,
         suspenso = (t >= 3 and m < 3)
   where id = new.avaliado_id;
  return new;
end $$;
create trigger avaliacoes_nota after insert on public.avaliacoes
  for each row execute function public.atualizar_nota();

-- Ao concluir a viagem, conclui as reservas
create or replace function public.concluir_reservas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluida' and old.status <> 'concluida' then
    update reservas set status = 'concluida'
     where viagem_id = new.id and status = 'confirmada';
  elsif new.status = 'cancelada' and old.status <> 'cancelada' then
    update reservas set status = 'cancelada'
     where viagem_id = new.id and status = 'confirmada';
  end if;
  return new;
end $$;
create trigger viagens_status after update of status on public.viagens
  for each row execute function public.concluir_reservas();

-- Busca: viagens cuja rota passa perto da origem E do destino, na direcao certa
create or replace function public.buscar_viagens(
  origem_lng double precision, origem_lat double precision,
  destino_lng double precision, destino_lat double precision,
  a_partir timestamptz default now(),
  ate timestamptz default now() + interval '12 hours',
  raio_m int default 500
)
returns table (
  viagem_id uuid,
  motorista_id uuid,
  motorista_nome text,
  motorista_nota numeric,
  motorista_total_avaliacoes int,
  carro text,
  origem_nome text,
  destino_nome text,
  partida_em timestamptz,
  tarifa numeric,
  vagas_livres int,
  embarque_lng double precision,
  embarque_lat double precision,
  desembarque_lng double precision,
  desembarque_lat double precision,
  embarque_previsto timestamptz,
  caminhada_embarque_m int,
  caminhada_desembarque_m int
)
language sql stable security definer set search_path = public, extensions as $$
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
     where v.status = 'aberta'
       and v.partida_em between a_partir - interval '30 minutes' and ate
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
         c.partida_em + make_interval(secs => c.duracao_s * c.f_emb),
         st_distance(e.pt::geography, c.o::geography)::int,
         st_distance(s.pt::geography, c.d::geography)::int
    from candidatas c
    cross join lateral (select st_lineinterpolatepoint(c.rota::geometry, c.f_emb) as pt) e
    cross join lateral (select st_lineinterpolatepoint(c.rota::geometry, c.f_des) as pt) s
   where c.f_emb < c.f_des
     and c.partida_em + make_interval(secs => c.duracao_s * c.f_emb) >= now()
     and c.vagas > (select count(*) from reservas r
                     where r.viagem_id = c.id and r.status = 'confirmada')
   order by c.partida_em + make_interval(secs => c.duracao_s * c.f_emb);
$$;

-- Reserva: recalcula os pontos no servidor e garante vaga
create or replace function public.reservar(
  p_viagem_id uuid,
  origem_lng double precision, origem_lat double precision,
  destino_lng double precision, destino_lat double precision,
  p_embarque_lng double precision default null,
  p_embarque_lat double precision default null,
  p_embarque_nome text default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
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
  if not found or v.status <> 'aberta' then raise exception 'Viagem indisponível'; end if;
  if v.motorista_id = auth.uid() then raise exception 'Você é o motorista desta viagem'; end if;

  select count(*) into ocupadas from reservas
   where viagem_id = v.id and status = 'confirmada';
  if ocupadas >= v.vagas then raise exception 'Não há vagas livres'; end if;

  -- ponto sugerido (ex.: parada de onibus) so vale se estiver na rota (ate 30 m)
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

  insert into reservas (viagem_id, passageiro_id, embarque, desembarque, embarque_nome,
                        embarque_previsto, caminhada_embarque_m, caminhada_desembarque_m)
  values (v.id, auth.uid(), emb::geography, des::geography, p_embarque_nome,
          v.partida_em + make_interval(secs => v.duracao_s * f_emb),
          st_distance(emb::geography, o::geography)::int,
          st_distance(des::geography, d::geography)::int)
  returning id into nova;
  return nova;
end $$;

-- Leitura das coordenadas para o app (geography nao vira JSON legivel)
create or replace view public.reservas_detalhe with (security_invoker = true) as
  select r.*,
         st_x(r.embarque::geometry) as embarque_lng, st_y(r.embarque::geometry) as embarque_lat,
         st_x(r.desembarque::geometry) as desembarque_lng, st_y(r.desembarque::geometry) as desembarque_lat
    from public.reservas r;

create or replace view public.viagens_detalhe with (security_invoker = true) as
  select v.id, v.motorista_id, v.origem_nome, v.destino_nome, v.distancia_m, v.duracao_s,
         v.partida_em, v.vagas, v.tarifa, v.status, v.criado_em,
         st_asgeojson(v.rota::geometry)::json as rota_geojson
    from public.viagens v;

-- Publicar viagem recebendo GeoJSON da rota
create or replace function public.publicar_viagem(
  p_origem_nome text, p_destino_nome text, p_rota_geojson json,
  p_distancia_m int, p_duracao_s int, p_partida_em timestamptz,
  p_vagas int, p_tarifa numeric
)
returns uuid
language plpgsql security invoker set search_path = public, extensions as $$
declare nova uuid;
begin
  insert into viagens (motorista_id, origem_nome, destino_nome, rota, distancia_m,
                       duracao_s, partida_em, vagas, tarifa)
  values (auth.uid(), p_origem_nome, p_destino_nome,
          st_setsrid(st_geomfromgeojson(p_rota_geojson::text), 4326)::geography,
          p_distancia_m, p_duracao_s, p_partida_em, p_vagas, p_tarifa)
  returning id into nova;
  return nova;
end $$;

revoke execute on function public.buscar_viagens from anon;
revoke execute on function public.reservar from anon;
revoke execute on function public.publicar_viagem from anon;
