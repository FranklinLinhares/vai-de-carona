-- Avisos no celular com o app fechado (Web Push).
-- O segredo para chamar o app fica no Vault (nome 'push_segredo'), criado fora deste arquivo.
create extension if not exists pg_net;

create table public.push_inscricoes (
  endpoint text primary key,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
create index push_inscricoes_usuario_idx on public.push_inscricoes (usuario_id);
alter table public.push_inscricoes enable row level security;
create policy "usuario ve os proprios aparelhos" on public.push_inscricoes
  for select to authenticated using (usuario_id = auth.uid());
create policy "usuario registra o proprio aparelho" on public.push_inscricoes
  for insert to authenticated with check (usuario_id = auth.uid());
create policy "usuario atualiza o proprio aparelho" on public.push_inscricoes
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "usuario remove o proprio aparelho" on public.push_inscricoes
  for delete to authenticated using (usuario_id = auth.uid());

-- A cada aviso novo, manda para os aparelhos do usuario via /api/push (assincrono, nao trava nada)
create or replace function public.enviar_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare insc jsonb; segredo text;
begin
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)))
    into insc from push_inscricoes where usuario_id = new.usuario_id;
  if insc is null then return new; end if;
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'push_segredo';
  if segredo is null then return new; end if;
  perform net.http_post(
    url := 'https://vai-de-carona.vercel.app/api/push',
    body := jsonb_build_object('titulo', new.titulo, 'texto', new.texto, 'link', new.link, 'tag', new.id, 'inscricoes', insc),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', segredo),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  return new; -- aviso no celular nunca pode impedir o aviso no app
end $$;
create trigger notificacoes_push after insert on public.notificacoes
  for each row execute function public.enviar_push();

-- O app chama isto para tirar aparelhos que nao aceitam mais avisos
create or replace function public.remover_inscricoes(p_segredo text, p_endpoints text[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_segredo is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_segredo') then
    raise exception 'Não autorizado';
  end if;
  with apagados as (delete from push_inscricoes where endpoint = any (p_endpoints) returning 1)
  select count(*) into n from apagados;
  return n;
end $$;
