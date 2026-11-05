-- Guarda de onde o passageiro sai e para onde vai, para mostrar o caminho a pe.
-- So o proprio passageiro ve esses pontos (o motorista nao ve o endereco dele).
alter table public.reservas add column if not exists origem extensions.geography(Point, 4326);
alter table public.reservas add column if not exists destino extensions.geography(Point, 4326);

create or replace function public.guardar_trajeto(p_viagem uuid,
  origem_lng double precision, origem_lat double precision,
  destino_lng double precision, destino_lat double precision)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update reservas
     set origem = st_setsrid(st_makepoint(origem_lng, origem_lat), 4326)::geography,
         destino = st_setsrid(st_makepoint(destino_lng, destino_lat), 4326)::geography
   where viagem_id = p_viagem and passageiro_id = auth.uid() and status <> 'cancelada';
end $$;

create or replace view public.reservas_detalhe with (security_invoker = true) as
  select r.id, r.viagem_id, r.passageiro_id, r.embarque, r.desembarque, r.embarque_nome,
         r.embarque_previsto, r.caminhada_embarque_m, r.caminhada_desembarque_m, r.status, r.criado_em,
         st_x(r.embarque::geometry) as embarque_lng, st_y(r.embarque::geometry) as embarque_lat,
         st_x(r.desembarque::geometry) as desembarque_lng, st_y(r.desembarque::geometry) as desembarque_lat,
         r.aprovacao, r.recorrente_id,
         case when r.passageiro_id = auth.uid() then st_x(coalesce(r.origem, rr.origem)::geometry) end as origem_lng,
         case when r.passageiro_id = auth.uid() then st_y(coalesce(r.origem, rr.origem)::geometry) end as origem_lat,
         case when r.passageiro_id = auth.uid() then st_x(coalesce(r.destino, rr.destino)::geometry) end as destino_lng,
         case when r.passageiro_id = auth.uid() then st_y(coalesce(r.destino, rr.destino)::geometry) end as destino_lat
    from public.reservas r
    left join public.reservas_recorrentes rr on rr.id = r.recorrente_id;
