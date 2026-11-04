-- CPF e CNH ficam numa tabela que so o dono le
create table public.perfis_privados (
  id uuid primary key references public.perfis (id) on delete cascade,
  cpf text,
  cnh text,
  atualizado_em timestamptz not null default now()
);
alter table public.perfis_privados enable row level security;
create policy "dono le dados privados" on public.perfis_privados
  for select to authenticated using (id = auth.uid());
create policy "dono cria dados privados" on public.perfis_privados
  for insert to authenticated with check (id = auth.uid());
create policy "dono edita dados privados" on public.perfis_privados
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- As colunas antigas de perfis nao guardam mais dados privados
alter table public.perfis add constraint perfis_sem_dados_privados check (cpf is null and cnh is null);

-- Perfil completo do proprio usuario
create or replace function public.meu_perfil()
returns table (
  id uuid, nome text, telefone text, foto_url text, cpf text, cnh text,
  carro_modelo text, carro_cor text, carro_placa text, chave_pix text,
  nota_media numeric, total_avaliacoes int, suspenso boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.telefone, p.foto_url, pp.cpf, pp.cnh,
         p.carro_modelo, p.carro_cor, p.carro_placa, p.chave_pix,
         p.nota_media, p.total_avaliacoes, p.suspenso
    from perfis p left join perfis_privados pp on pp.id = p.id
   where p.id = auth.uid();
$$;

create or replace function public.pode_dirigir(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis p join perfis_privados pp on pp.id = p.id
                 where p.id = uid and not p.suspenso and pp.cnh is not null
                   and p.carro_placa is not null and p.chave_pix is not null);
$$;

-- Politicas permissivas se somam: a antiga deixa de valer porque perfis.cnh fica sempre vazio
create policy "motorista habilitado publica viagem" on public.viagens
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

-- Atualizacoes em tempo real
alter publication supabase_realtime add table public.reservas, public.viagens;
