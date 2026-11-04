-- Etapa 1: genero e filtro so mulheres, limite diario, pedido e aceite, notificacoes e chat.
-- Tudo aditivo (nada e removido), para nao exigir confirmacao no painel.

-- Genero no perfil e viagem so para mulheres -----------------------------------
alter table public.perfis add column if not exists genero text
  check (genero in ('feminino', 'masculino', 'outro'));
alter table public.viagens add column if not exists so_mulheres boolean not null default false;

-- Viagem so para mulheres: so motorista mulher pode criar e so passageira pode reservar
create or replace function public.validar_so_mulheres_viagem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.so_mulheres and coalesce((select genero from perfis where id = new.motorista_id), '') <> 'feminino' then
    raise exception 'Só motoristas mulheres podem criar viagens só para mulheres';
  end if;
  return new;
end $$;
create trigger viagens_so_mulheres before insert or update of so_mulheres on public.viagens
  for each row execute function public.validar_so_mulheres_viagem();

create or replace function public.validar_so_mulheres_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select so_mulheres from viagens where id = new.viagem_id)
     and coalesce((select genero from perfis where id = new.passageiro_id), '') <> 'feminino' then
    raise exception 'Esta viagem é só para mulheres';
  end if;
  return new;
end $$;
create trigger reservas_so_mulheres before insert on public.reservas
  for each row execute function public.validar_so_mulheres_reserva();

-- Limite de 2 viagens por dia por motorista (horario de Joao Pessoa) ---------------
create or replace function public.limitar_viagens_por_dia()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from viagens
   where motorista_id = new.motorista_id and status <> 'cancelada' and id <> new.id
     and (partida_em at time zone 'America/Fortaleza')::date = (new.partida_em at time zone 'America/Fortaleza')::date;
  if n >= 2 then
    raise exception 'Limite de 2 caronas por dia: a carona é para dividir custos, não para trabalhar como motorista';
  end if;
  return new;
end $$;
create trigger viagens_limite_diario before insert on public.viagens
  for each row execute function public.limitar_viagens_por_dia();

-- Pedido e aceite -----------------------------------------------------------------
-- Uma reserva nova fica 'pendente' (ja segura a vaga). Recusada vira cancelada e libera a vaga.
alter table public.reservas add column if not exists aprovacao text not null default 'pendente'
  check (aprovacao in ('pendente', 'aceita', 'recusada'));

create or replace function public.responder_reserva(p_reserva_id uuid, p_aceitar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r reservas%rowtype;
begin
  select r2.* into r from reservas r2 join viagens v on v.id = r2.viagem_id
   where r2.id = p_reserva_id and v.motorista_id = auth.uid() for update of r2;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if r.status <> 'confirmada' or r.aprovacao <> 'pendente' then raise exception 'Esta reserva já foi respondida'; end if;
  update reservas
     set aprovacao = case when p_aceitar then 'aceita' else 'recusada' end,
         status = case when p_aceitar then status else 'cancelada' end
   where id = p_reserva_id;
end $$;
revoke execute on function public.responder_reserva from anon;

-- Notificacoes --------------------------------------------------------------------
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  titulo text not null,
  texto text not null,
  link text,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index notificacoes_usuario_idx on public.notificacoes (usuario_id, criado_em desc);
alter table public.notificacoes enable row level security;
create policy "usuario ve as proprias notificacoes" on public.notificacoes
  for select to authenticated using (usuario_id = auth.uid());
create policy "usuario marca como lida" on public.notificacoes
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create or replace function public.notificar_reserva()
returns trigger language plpgsql security definer set search_path = public as $$
declare v viagens%rowtype; nome_passageiro text; nome_motorista text;
begin
  select * into v from viagens where id = new.viagem_id;
  select split_part(nome, ' ', 1) into nome_passageiro from perfis where id = new.passageiro_id;
  select split_part(nome, ' ', 1) into nome_motorista from perfis where id = v.motorista_id;
  if tg_op = 'INSERT' then
    insert into notificacoes (usuario_id, titulo, texto, link) values
      (v.motorista_id, 'Novo pedido de carona',
       nome_passageiro || ' quer embarcar às ' || to_char(new.embarque_previsto at time zone 'America/Fortaleza', 'HH24:MI') || '. Aceite ou recuse.',
       '/motorista');
  elsif new.aprovacao <> old.aprovacao then
    insert into notificacoes (usuario_id, titulo, texto, link) values
      (new.passageiro_id,
       case when new.aprovacao = 'aceita' then 'Carona confirmada!' else 'Pedido recusado' end,
       case when new.aprovacao = 'aceita'
            then nome_motorista || ' aceitou. Embarque às ' || to_char(new.embarque_previsto at time zone 'America/Fortaleza', 'HH24:MI') || '.'
            else nome_motorista || ' não pode levar você desta vez. Busque outra carona.' end,
       '/minhas-caronas');
  elsif new.status = 'cancelada' and old.status <> 'cancelada' and old.aprovacao <> 'recusada' then
    insert into notificacoes (usuario_id, titulo, texto, link)
    select case when v.status = 'cancelada' then new.passageiro_id else v.motorista_id end,
           'Carona cancelada',
           case when v.status = 'cancelada' then nome_motorista || ' cancelou a viagem.'
                else nome_passageiro || ' cancelou a reserva.' end,
           case when v.status = 'cancelada' then '/minhas-caronas' else '/motorista' end;
  end if;
  return new;
end $$;
create trigger reservas_notificar after insert or update on public.reservas
  for each row execute function public.notificar_reserva();

-- Chat ------------------------------------------------------------------------------
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas (id) on delete cascade,
  autor_id uuid not null references public.perfis (id) on delete cascade,
  texto text not null check (length(texto) between 1 and 1000),
  criado_em timestamptz not null default now()
);
create index mensagens_reserva_idx on public.mensagens (reserva_id, criado_em);

create or replace function public.participa_da_reserva(p_reserva_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reservas r join viagens v on v.id = r.viagem_id
     where r.id = p_reserva_id and (r.passageiro_id = uid or v.motorista_id = uid)
  );
$$;

alter table public.mensagens enable row level security;
create policy "participantes leem o chat" on public.mensagens
  for select to authenticated using (public.participa_da_reserva(reserva_id, auth.uid()));
create policy "participantes escrevem no chat" on public.mensagens
  for insert to authenticated with check (autor_id = auth.uid() and public.participa_da_reserva(reserva_id, auth.uid()));

create or replace function public.notificar_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare destino uuid; autor text;
begin
  select case when r.passageiro_id = new.autor_id then v.motorista_id else r.passageiro_id end
    into destino from reservas r join viagens v on v.id = r.viagem_id where r.id = new.reserva_id;
  select split_part(nome, ' ', 1) into autor from perfis where id = new.autor_id;
  insert into notificacoes (usuario_id, titulo, texto, link)
  values (destino, 'Mensagem de ' || autor, left(new.texto, 120), '/chat/' || new.reserva_id);
  return new;
end $$;
create trigger mensagens_notificar after insert on public.mensagens
  for each row execute function public.notificar_mensagem();

alter publication supabase_realtime add table public.notificacoes, public.mensagens;

-- Views com as colunas novas no fim (mantem a ordem das antigas)
create or replace view public.reservas_detalhe with (security_invoker = true) as
  select r.id, r.viagem_id, r.passageiro_id, r.embarque, r.desembarque, r.embarque_nome,
         r.embarque_previsto, r.caminhada_embarque_m, r.caminhada_desembarque_m, r.status, r.criado_em,
         st_x(r.embarque::geometry) as embarque_lng, st_y(r.embarque::geometry) as embarque_lat,
         st_x(r.desembarque::geometry) as desembarque_lng, st_y(r.desembarque::geometry) as desembarque_lat,
         r.aprovacao
    from public.reservas r;

create or replace view public.viagens_detalhe with (security_invoker = true) as
  select v.id, v.motorista_id, v.origem_nome, v.destino_nome, v.distancia_m, v.duracao_s,
         v.partida_em, v.vagas, v.tarifa, v.status, v.criado_em,
         st_asgeojson(v.rota::geometry)::json as rota_geojson,
         v.so_mulheres
    from public.viagens v;
