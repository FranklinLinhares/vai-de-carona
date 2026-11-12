-- Revisao de 2026-11-12 (tudo aditivo).

-- 1) Telefone deixa de ficar visivel para todos: vai para perfis_privados (so o dono le).
alter table public.perfis_privados add column if not exists telefone text;
insert into public.perfis_privados (id, telefone)
  select id, telefone from public.perfis where telefone <> ''
on conflict (id) do update set telefone = excluded.telefone;
update public.perfis set telefone = '' where telefone <> '';
alter table public.perfis add constraint perfis_telefone_privado check (telefone = '');

create or replace function public.meu_perfil()
returns table (
  id uuid, nome text, telefone text, foto_url text, cpf text, cnh text,
  carro_modelo text, carro_cor text, carro_placa text, chave_pix text,
  nota_media numeric, total_avaliacoes int, suspenso boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, pp.telefone, p.foto_url, pp.cpf, pp.cnh,
         p.carro_modelo, p.carro_cor, p.carro_placa, p.chave_pix,
         p.nota_media, p.total_avaliacoes, p.suspenso
    from perfis p left join perfis_privados pp on pp.id = p.id
   where p.id = auth.uid();
$$;

-- 2) Viagem esquecida "em andamento" e concluida sozinha 3 h depois da chegada prevista
--    (libera a avaliacao e para de mostrar o carro).
create or replace function public.concluir_viagens_esquecidas()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update viagens set status = 'concluida'
   where status = 'em_andamento'
     and partida_em + make_interval(secs => duracao_s) + interval '3 hours' < now();
  get diagnostics n = row_count;
  return n;
end $$;
select cron.schedule('concluir-viagens-esquecidas', '15 * * * *', 'select public.concluir_viagens_esquecidas()');

-- 3) Sinal de vida diario (chamado pelo Vercel) para o plano gratis nao pausar o banco.
create or replace function public.ping()
returns timestamptz language sql stable as $$ select now() $$;
