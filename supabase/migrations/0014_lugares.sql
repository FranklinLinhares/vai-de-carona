-- Indice proprio de ruas, bairros, paradas e estabelecimentos de Joao Pessoa (dados do OpenStreetMap).
-- Fica no banco (Sao Paulo), entao a busca responde em milissegundos, sem depender de servidores na Europa.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.normalizar(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')));
$$;

create table public.lugares (
  id text primary key,            -- tipo/id do OpenStreetMap (ex.: n123, w456) ou "rua:<nome>"
  nome text not null,
  tipo text not null,             -- rua, bairro, parada, lugar
  detalhe text,                   -- categoria ou bairro, para mostrar abaixo do nome
  lat double precision not null,
  lng double precision not null,
  nome_busca text generated always as (public.normalizar(nome)) stored
);
create index lugares_busca_trgm on public.lugares using gin (nome_busca extensions.gin_trgm_ops);
alter table public.lugares enable row level security;
create policy "lugares sao publicos" on public.lugares for select to anon, authenticated using (true);

-- Busca: todas as palavras precisam aparecer (em qualquer ordem, sem acento); ordena por parecido
create or replace function public.buscar_lugares(p_texto text, p_limite int default 8)
returns table (nome text, tipo text, detalhe text, lat double precision, lng double precision)
language sql stable set search_path = public, extensions as $$
  with q as (select normalizar(p_texto) as t),
  palavras as (select array_agg(w) as ws from q, regexp_split_to_table(q.t, '\s+') w where length(w) >= 2)
  select l.nome, l.tipo, l.detalhe, l.lat, l.lng
    from lugares l, q, palavras p
   where l.nome_busca % q.t or (p.ws is not null and l.nome_busca like all (array(select '%' || w || '%' from unnest(p.ws) w)))
   order by (l.nome_busca like q.t || '%') desc, similarity(l.nome_busca, q.t) desc,
            case l.tipo when 'lugar' then 0 when 'rua' then 1 when 'bairro' then 2 else 3 end
   limit p_limite;
$$;

-- Importacao (rodar pelo painel/MCP quando quiser atualizar):
--   select net.http_get(...overpass...)  -> depois  select public.importar_lugares(<id da resposta>);
create or replace function public.importar_lugares(p_resposta bigint)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare dados jsonb; n int;
begin
  -- so pelo painel/administracao, nunca pela API do app
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then raise exception 'Não permitido'; end if;
  select content::jsonb into dados from net._http_response where id = p_resposta and status_code = 200;
  if dados is null then raise exception 'Resposta % nao encontrada ou com erro', p_resposta; end if;

  create temp table _el on commit drop as
  select e->>'type' as t, e->>'id' as id, e->'tags' as tags,
         coalesce((e->>'lat')::float8, (e->'center'->>'lat')::float8) as lat,
         coalesce((e->>'lon')::float8, (e->'center'->>'lon')::float8) as lng
    from jsonb_array_elements(dados->'elements') e
   where e->'tags'->>'name' is not null;

  insert into lugares (id, nome, tipo, detalhe, lat, lng)
  select left(t, 1) || id, tags->>'name',
         case when tags ? 'place' then 'bairro'
              when tags->>'highway' = 'bus_stop' or tags ? 'public_transport' then 'parada'
              else 'lugar' end,
         coalesce(tags->>'amenity', tags->>'shop', tags->>'office', tags->>'tourism', tags->>'leisure',
                  tags->>'healthcare', tags->>'building', tags->>'place', tags->>'public_transport'),
         lat, lng
    from _el
   where lat is not null and not (tags ? 'highway' and tags->>'highway' <> 'bus_stop')
  on conflict (id) do update set nome = excluded.nome, tipo = excluded.tipo, detalhe = excluded.detalhe,
                                 lat = excluded.lat, lng = excluded.lng;

  -- ruas: um ponto por nome (o trecho mais central da rua)
  insert into lugares (id, nome, tipo, detalhe, lat, lng)
  select distinct on (tags->>'name') 'rua:' || (tags->>'name'), tags->>'name', 'rua', null, lat, lng
    from (select *, avg(lat) over (partition by tags->>'name') as mlat, avg(lng) over (partition by tags->>'name') as mlng
            from _el where tags->>'highway' is not null and tags->>'highway' <> 'bus_stop' and lat is not null) s
   order by tags->>'name', (lat - mlat)^2 + (lng - mlng)^2
  on conflict (id) do update set lat = excluded.lat, lng = excluded.lng;

  select count(*) into n from lugares;
  return n;
end $$;
