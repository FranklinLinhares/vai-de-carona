-- Registra o aparelho para o usuario logado (se o mesmo celular trocar de conta, passa para a conta nova).
create or replace function public.registrar_aparelho(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  insert into push_inscricoes (endpoint, usuario_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set usuario_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
