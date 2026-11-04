-- Etapa 3: paradas definidas pelo motorista e grupos fechados (aditivo).

-- Paradas: lista [{nome, lat, lng}] com pontos sobre a rota ---------------------------
alter table public.viagens add column if not exists paradas jsonb;
alter table public.series_viagem add column if not exists paradas jsonb;

-- Grupos ----------------------------------------------------------------------------
create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(nome) between 2 and 60),
  codigo text not null unique,
  criado_por uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create table public.grupo_membros (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (grupo_id, usuario_id)
);

create or replace function public.membro_do_grupo(p_grupo uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from grupo_membros where grupo_id = p_grupo and usuario_id = uid);
$$;

alter table public.grupos enable row level security;
alter table public.grupo_membros enable row level security;
create policy "membros veem o grupo" on public.grupos
  for select to authenticated using (public.membro_do_grupo(id, auth.uid()));
create policy "membros veem os membros" on public.grupo_membros
  for select to authenticated using (public.membro_do_grupo(grupo_id, auth.uid()));
create policy "usuario sai do grupo" on public.grupo_membros
  for delete to authenticated using (usuario_id = auth.uid());

create or replace function public.criar_grupo(p_nome text)
returns text language plpgsql security definer set search_path = public as $$
declare g uuid; c text;
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  loop
    c := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from grupos where codigo = c);
  end loop;
  insert into grupos (nome, codigo, criado_por) values (trim(p_nome), c, auth.uid()) returning id into g;
  insert into grupo_membros (grupo_id, usuario_id) values (g, auth.uid());
  return c;
end $$;
revoke execute on function public.criar_grupo from anon;

create or replace function public.entrar_grupo(p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare g grupos%rowtype;
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  select * into g from grupos where codigo = upper(trim(p_codigo));
  if not found then raise exception 'Código não encontrado'; end if;
  insert into grupo_membros (grupo_id, usuario_id) values (g.id, auth.uid()) on conflict do nothing;
  return g.nome;
end $$;
revoke execute on function public.entrar_grupo from anon;

alter table public.viagens add column if not exists grupo_id uuid references public.grupos (id) on delete set null;
alter table public.series_viagem add column if not exists grupo_id uuid references public.grupos (id) on delete set null;

-- Motorista so publica para grupo do qual participa; passageiro so reserva se for do grupo
create or replace function public.validar_grupo_viagem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grupo_id is not null and not membro_do_grupo(new.grupo_id, new.motorista_id) then
    raise exception 'Você não participa deste grupo';
  end if;
  return new;
end $$;
create trigger viagens_grupo before insert or update of grupo_id on public.viagens
  for each row execute function public.validar_grupo_viagem();

create or replace function public.validar_grupo_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select grupo_id into g from viagens where id = new.viagem_id;
  if g is not null and not membro_do_grupo(g, new.passageiro_id) then
    raise exception 'Esta carona é só para membros de um grupo';
  end if;
  return new;
end $$;
create trigger reservas_grupo before insert on public.reservas
  for each row execute function public.validar_grupo_reserva();

-- Configura paradas e grupo de uma serie (e das proximas viagens dela)
create or replace function public.configurar_serie(p_serie uuid, p_paradas jsonb, p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_grupo is not null and not membro_do_grupo(p_grupo, auth.uid()) then
    raise exception 'Você não participa deste grupo';
  end if;
  update series_viagem set paradas = p_paradas, grupo_id = p_grupo where id = p_serie and motorista_id = auth.uid();
  if not found then raise exception 'Série não encontrada'; end if;
  update viagens set paradas = p_paradas, grupo_id = p_grupo
   where serie_id = p_serie and status = 'aberta' and partida_em > now();
end $$;
revoke execute on function public.configurar_serie from anon;

-- Novas viagens da serie copiam paradas e grupo
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
                           partida_em, vagas, tarifa, so_mulheres, serie_id, paradas, grupo_id)
      values (s.motorista_id, s.origem_nome, s.destino_nome, s.rota, s.distancia_m, s.duracao_s,
              partida, s.vagas, s.tarifa, s.so_mulheres, s.id, s.paradas, s.grupo_id)
      returning id into nova;
      criadas := criadas + 1;
    exception when others then
      continue;
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

create or replace view public.viagens_detalhe with (security_invoker = true) as
  select v.id, v.motorista_id, v.origem_nome, v.destino_nome, v.distancia_m, v.duracao_s,
         v.partida_em, v.vagas, v.tarifa, v.status, v.criado_em,
         st_asgeojson(v.rota::geometry)::json as rota_geojson,
         v.so_mulheres, v.serie_id, v.paradas, v.grupo_id
    from public.viagens v;
