-- Posicao do carro em tempo real durante a viagem (so motorista e passageiros aceitos veem).
create table public.posicao_viagem (
  viagem_id uuid primary key references public.viagens (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  atualizado_em timestamptz not null default now()
);
alter table public.posicao_viagem enable row level security;

create policy "participantes veem a posicao" on public.posicao_viagem
  for select to authenticated using (
    exists (select 1 from public.viagens v where v.id = viagem_id and v.motorista_id = auth.uid())
    or exists (select 1 from public.reservas r where r.viagem_id = posicao_viagem.viagem_id
               and r.passageiro_id = auth.uid() and r.status <> 'cancelada' and r.aprovacao = 'aceita')
  );

create or replace function public.atualizar_posicao(p_viagem uuid, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from viagens where id = p_viagem and motorista_id = auth.uid() and status = 'em_andamento') then
    raise exception 'Viagem não está em andamento';
  end if;
  insert into posicao_viagem (viagem_id, lat, lng, atualizado_em) values (p_viagem, p_lat, p_lng, now())
  on conflict (viagem_id) do update set lat = excluded.lat, lng = excluded.lng, atualizado_em = now();
end $$;

alter publication supabase_realtime add table public.posicao_viagem;
