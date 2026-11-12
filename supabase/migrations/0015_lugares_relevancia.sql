-- Relevancia na busca: avenidas principais, shoppings, universidades e hospitais aparecem primeiro;
-- "Rua", "Avenida" etc. nao contam na comparacao; nomes repetidos (mesmo lugar) aparecem uma vez so.
alter table public.lugares add column if not exists peso int not null default 0;

create or replace function public.sem_logradouro(t text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(t, '^(rua|avenida|av\.?|travessa|tv\.?|praca|rodovia|alameda|estrada|largo|presidente|pres\.?)\s+', '', 'g');
$$;

create or replace function public.buscar_lugares(p_texto text, p_limite int default 8)
returns table (nome text, tipo text, detalhe text, lat double precision, lng double precision)
language sql stable set search_path = public, extensions as $$
  with q as (select sem_logradouro(normalizar(p_texto)) as t),
  palavras as (select array_agg(w) as ws from q, regexp_split_to_table(q.t, '\s+') w where length(w) >= 2),
  achados as (
    select distinct on (l.nome, l.tipo) l.nome, l.tipo, l.detalhe, l.lat, l.lng,
           (sem_logradouro(sem_logradouro(l.nome_busca)) like q.t || '%')::int * 0.6
           + similarity(sem_logradouro(sem_logradouro(l.nome_busca)), q.t)
           + 0.15 * l.peso
           + (p.ws is not null and l.nome_busca like all (array(select '%' || w || '%' from unnest(p.ws) w)))::int * 0.4 as pontos
      from lugares l, q, palavras p
     where l.nome_busca % q.t
        or (p.ws is not null and l.nome_busca like all (array(select '%' || w || '%' from unnest(p.ws) w)))
     order by l.nome, l.tipo, l.peso desc
  )
  select nome, tipo, detalhe, lat, lng from achados order by pontos desc limit p_limite;
$$;

create or replace function public.importar_lugares(p_resposta bigint)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare dados jsonb; n int;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then raise exception 'Não permitido'; end if;
  select content::jsonb into dados from net._http_response where id = p_resposta and status_code = 200;
  if dados is null then raise exception 'Resposta % nao encontrada ou com erro', p_resposta; end if;

  create temp table _el on commit drop as
  select e->>'type' as t, e->>'id' as id, e->'tags' as tags,
         coalesce((e->>'lat')::float8, (e->'center'->>'lat')::float8) as lat,
         coalesce((e->>'lon')::float8, (e->'center'->>'lon')::float8) as lng
    from jsonb_array_elements(dados->'elements') e
   where e->'tags'->>'name' is not null and not (e->'tags' ? 'route');

  insert into lugares (id, nome, tipo, detalhe, lat, lng, peso)
  select left(t, 1) || id, tags->>'name',
         case when tags ? 'place' then 'bairro'
              when tags->>'highway' = 'bus_stop' or tags ? 'public_transport' then 'parada'
              else 'lugar' end,
         coalesce(tags->>'amenity', tags->>'shop', tags->>'office', tags->>'tourism', tags->>'leisure',
                  tags->>'healthcare', tags->>'building', tags->>'place', tags->>'public_transport'),
         lat, lng,
         case when coalesce(tags->>'shop', '') = 'mall' or tags->>'amenity' in ('university', 'hospital', 'bus_station', 'townhall') then 3
              when tags ? 'place' or tags->>'amenity' in ('college', 'school', 'marketplace', 'clinic') or tags->>'tourism' = 'attraction' then 2
              when tags->>'amenity' = 'camp_site' or tags->>'tourism' = 'camp_site' then -2
              else 0 end
    from _el
   where lat is not null and not (tags ? 'highway' and tags->>'highway' <> 'bus_stop')
  on conflict (id) do update set nome = excluded.nome, tipo = excluded.tipo, detalhe = excluded.detalhe,
                                 lat = excluded.lat, lng = excluded.lng, peso = excluded.peso;

  -- ruas: um ponto por nome (o trecho mais central); peso pela importancia da via
  insert into lugares (id, nome, tipo, detalhe, lat, lng, peso)
  select distinct on (nome) 'rua:' || nome, nome, 'rua', classe, lat, lng, peso
    from (select tags->>'name' as nome, tags->>'highway' as classe, lat, lng,
                 max(case tags->>'highway' when 'trunk' then 4 when 'primary' then 4 when 'secondary' then 3
                     when 'tertiary' then 2 when 'residential' then 1 else 0 end) over (partition by tags->>'name') as peso,
                 avg(lat) over (partition by tags->>'name') as mlat, avg(lng) over (partition by tags->>'name') as mlng
            from _el where tags->>'highway' is not null and tags->>'highway' <> 'bus_stop' and lat is not null) s
   order by nome, (lat - mlat)^2 + (lng - mlng)^2
  on conflict (id) do update set lat = excluded.lat, lng = excluded.lng, detalhe = excluded.detalhe, peso = excluded.peso;

  -- linhas de onibus que entraram por engano em importacoes antigas
  delete from lugares where tipo = 'parada' and nome ~ '^\d{3,4} - ';

  select count(*) into n from lugares;
  return n;
end $$;
