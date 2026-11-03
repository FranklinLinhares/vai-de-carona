-- CPF e CNH nao ficam visiveis para outros usuarios
revoke select on public.perfis from authenticated, anon;
grant select (id, nome, telefone, foto_url, carro_modelo, carro_cor, carro_placa, chave_pix,
              nota_media, total_avaliacoes, suspenso, criado_em)
  on public.perfis to authenticated;

-- O proprio usuario le o perfil completo por esta funcao
create or replace function public.meu_perfil()
returns setof public.perfis
language sql stable security definer set search_path = public as $$
  select * from perfis where id = auth.uid();
$$;
revoke execute on function public.meu_perfil from anon;

create or replace function public.pode_dirigir(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis p where p.id = uid and not p.suspenso
                 and p.cnh is not null and p.carro_placa is not null and p.chave_pix is not null);
$$;

drop policy "motorista publica viagem" on public.viagens;
create policy "motorista publica viagem" on public.viagens
  for insert to authenticated with check (motorista_id = auth.uid() and public.pode_dirigir(auth.uid()));

-- Fotos de perfil: leitura publica, cada usuario grava so na propria pasta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "usuario envia a propria foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "usuario atualiza a propria foto" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Atualizacoes em tempo real das reservas e viagens
alter publication supabase_realtime add table public.reservas, public.viagens;
