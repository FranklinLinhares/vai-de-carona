-- Mapa de caronas: o passageiro ve todas as caronas do periodo no mapa (mesmo as que nao passam perto),
-- com a distancia ate ele; o motorista ve onde ha gente procurando carona agora.

-- 1) Caronas no mapa (para quem procura)
create or replace function public.caronas_no_mapa(
  a_partir timestamptz default now(), ate timestamptz default now() + interval '12 hours',
  origem_lng double precision default null, origem_lat double precision default null,
  destino_lng double precision default null, destino_lat double precision default null)
returns table (viagem_id uuid, motorista_nome text, status text, partida_em timestamptz, origem_nome text, destino_nome text,
               vagas_livres int, rota_geojson jsonb, carro_lat double precision, carro_lng double precision, carro_ao_vivo boolean,
               dist_origem_m int, dist_destino_m int, mesmo_sentido boolean)
language sql stable security definer set search_path = public, extensions as $$
  with eu as (select p.genero from perfis p where p.id = auth.uid()),
  pts as (select case when origem_lng is null then null else st_setsrid(st_makepoint(origem_lng, origem_lat), 4326) end as o,
                 case when destino_lng is null then null else st_setsrid(st_makepoint(destino_lng, destino_lat), 4326) end as d)
  select v.id, split_part(p.nome, ' ', 1), v.status, v.partida_em, v.origem_nome, v.destino_nome,
         v.vagas - (select count(*) from reservas r where r.viagem_id = v.id and r.status = 'confirmada')::int,
         st_asgeojson(st_simplify(v.rota::geometry, 0.0001))::jsonb,
         -- carro: posicao ao vivo (aproximada em ~100 m) se a viagem ja saiu; senao, o ponto de partida
         round(coalesce(case when pv.atualizado_em > now() - interval '3 minutes' then pv.lat end, st_y(st_startpoint(v.rota::geometry)))::numeric, 3)::float8,
         round(coalesce(case when pv.atualizado_em > now() - interval '3 minutes' then pv.lng end, st_x(st_startpoint(v.rota::geometry)))::numeric, 3)::float8,
         pv.atualizado_em > now() - interval '3 minutes',
         case when pts.o is null then null else st_distance(v.rota, pts.o::geography)::int end,
         case when pts.d is null then null else st_distance(v.rota, pts.d::geography)::int end,
         case when pts.o is null or pts.d is null then null
              else st_linelocatepoint(v.rota::geometry, pts.o) < st_linelocatepoint(v.rota::geometry, pts.d) end
    from viagens v
    join perfis p on p.id = v.motorista_id
    left join posicao_viagem pv on pv.viagem_id = v.id
    cross join pts
    left join eu on true
   where v.status in ('aberta', 'em_andamento')
     and v.partida_em between a_partir - interval '30 minutes' and ate
     and v.motorista_id <> auth.uid()
     and not p.suspenso
     and (not v.so_mulheres or eu.genero = 'feminino')
     and (v.grupo_id is null or exists (select 1 from grupo_membros g where g.grupo_id = v.grupo_id and g.usuario_id = auth.uid()))
   order by v.partida_em
   limit 50;
$$;

-- 2) Procuras: quem buscou carona nas ultimas 2 horas (o motorista ve so pontos aproximados, sem nome)
create table if not exists public.procuras (
  usuario_id uuid primary key, -- quem buscou (so a ultima busca de cada pessoa)
  origem geography(point, 4326) not null,
  destino geography(point, 4326) not null,
  criado_em timestamptz not null default now()
);
alter table public.procuras enable row level security; -- sem politicas: so pelas funcoes abaixo

create or replace function public.registrar_procura(origem_lng double precision, origem_lat double precision,
                                                    destino_lng double precision, destino_lat double precision)
returns void language sql volatile security definer set search_path = public, extensions as $$
  insert into procuras (usuario_id, origem, destino, criado_em)
  select auth.uid(), st_makepoint(origem_lng, origem_lat)::geography, st_makepoint(destino_lng, destino_lat)::geography, now()
   where auth.uid() is not null
  on conflict (usuario_id) do update set origem = excluded.origem, destino = excluded.destino, criado_em = now();
$$;

create or replace function public.procuras_no_mapa(p_viagem uuid default null)
returns table (origem_lat double precision, origem_lng double precision, destino_lat double precision, destino_lng double precision,
               minutos int, combina boolean)
language sql stable security definer set search_path = public, extensions as $$
  select round(st_y(pr.origem::geometry)::numeric, 3)::float8, round(st_x(pr.origem::geometry)::numeric, 3)::float8,
         round(st_y(pr.destino::geometry)::numeric, 3)::float8, round(st_x(pr.destino::geometry)::numeric, 3)::float8,
         (extract(epoch from now() - pr.criado_em) / 60)::int,
         coalesce(st_dwithin(v.rota, pr.origem, 500) and st_dwithin(v.rota, pr.destino, 500)
                  and st_linelocatepoint(v.rota::geometry, pr.origem::geometry) < st_linelocatepoint(v.rota::geometry, pr.destino::geometry), false)
    from procuras pr
    left join viagens v on v.id = p_viagem and v.motorista_id = auth.uid()
   where pr.criado_em > now() - interval '2 hours'
     and pr.usuario_id <> auth.uid()
     and exists (select 1 from perfis_privados pp where pp.id = auth.uid() and coalesce(pp.cnh, '') <> '')
   order by pr.criado_em desc
   limit 100;
$$;
