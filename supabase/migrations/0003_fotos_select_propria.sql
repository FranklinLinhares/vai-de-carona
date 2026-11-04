-- O envio com upsert precisa ler o proprio arquivo (RETURNING), entao o dono precisa de SELECT
create policy "usuario le as proprias fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
