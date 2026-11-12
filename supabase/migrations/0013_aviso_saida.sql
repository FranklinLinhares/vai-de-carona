-- Quando o motorista inicia a viagem, avisa os passageiros aceitos.
create or replace function public.avisar_saida()
returns trigger language plpgsql security definer set search_path = public as $$
declare nome_motorista text;
begin
  if new.status = 'em_andamento' and old.status = 'aberta' then
    select split_part(nome, ' ', 1) into nome_motorista from perfis where id = new.motorista_id;
    insert into notificacoes (usuario_id, titulo, texto, link)
    select r.passageiro_id, 'O motorista saiu!',
           nome_motorista || ' começou a viagem. Vá para o ponto: ' || coalesce(r.embarque_nome, 'veja o mapa')
             || ', embarque por volta das ' || to_char(r.embarque_previsto at time zone 'America/Fortaleza', 'HH24:MI') || '.',
           '/minhas-caronas'
      from reservas r
     where r.viagem_id = new.id and r.status = 'confirmada' and r.aprovacao = 'aceita';
  end if;
  return new;
end $$;
create trigger viagens_avisar_saida after update of status on public.viagens
  for each row execute function public.avisar_saida();
