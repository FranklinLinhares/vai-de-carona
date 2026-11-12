-- Avisos no celular sem guardar segredo no banco:
-- o banco manda so o id do aviso; o app busca os aparelhos com dados_push(id),
-- que so responde uma vez e nos 2 primeiros minutos do aviso (id e um uuid aleatorio).
alter table public.notificacoes add column if not exists push_enviado boolean not null default false;

create or replace function public.enviar_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from push_inscricoes where usuario_id = new.usuario_id) then
    perform net.http_post(
      url := 'https://vai-de-carona.vercel.app/api/push',
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
exception when others then
  return new; -- aviso no celular nunca pode impedir o aviso no app
end $$;

create or replace function public.dados_push(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n notificacoes%rowtype; insc jsonb;
begin
  update notificacoes set push_enviado = true
   where id = p_id and not push_enviado and criado_em > now() - interval '2 minutes'
  returning * into n;
  if not found then return null; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)))
    into insc from push_inscricoes where usuario_id = n.usuario_id;
  return jsonb_build_object('titulo', n.titulo, 'texto', n.texto, 'link', n.link, 'tag', n.id, 'inscricoes', coalesce(insc, '[]'::jsonb));
end $$;

-- Tira aparelhos que nao aceitam mais avisos (so os do dono daquele aviso, logo depois do envio)
create or replace function public.remover_inscricoes_push(p_id uuid, p_endpoints text[])
returns int language plpgsql security definer set search_path = public as $$
declare u uuid; n int;
begin
  select usuario_id into u from notificacoes where id = p_id and criado_em > now() - interval '10 minutes';
  if u is null then return 0; end if;
  with apagados as (delete from push_inscricoes where usuario_id = u and endpoint = any (p_endpoints) returning 1)
  select count(*) into n from apagados;
  return n;
end $$;

-- A versao anterior (com segredo) fica desligada
create or replace function public.remover_inscricoes(p_segredo text, p_endpoints text[])
returns int language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Desativada';
end $$;
