# Vai de carona

Carona urbana que funciona como linha de ônibus, começando por João Pessoa. O motorista publica a rota que já vai fazer, e o passageiro embarca num ponto dessa rota (uma rua ou parada de ônibus) pagando o preço da passagem.

## Regras do MVP

- O motorista não sai da rota. O passageiro anda até **500 m** para embarcar e desembarcar.
- O app sugere uma parada de ônibus que fica na rota, quando há uma.
- O passageiro chega 3 min antes, e o motorista espera no máximo 2 min.
- A tarifa é fixa (R$ 5 por padrão, `NEXT_PUBLIC_TARIFA`) e o pagamento é por Pix direto ao motorista.
- Segurança: cadastro com foto, CPF e celular, motorista com CNH e placa, avaliação mútua (suspensão automática com média abaixo de 3 após 3 avaliações), compartilhar a viagem e botão 190.

## Tecnologia

- Next.js 15 (App Router), instalável no celular como PWA
- Supabase: cadastro com e-mail e senha (fase de testes, sem confirmação), Postgres + PostGIS para cruzar rotas e pontos, Storage para fotos, Realtime
- Mapa: Leaflet + OpenStreetMap. Rotas pelo OSRM, endereços pelo Nominatim e paradas pelo Overpass. Os servidores públicos servem para testes. Em produção, use servidores próprios ou pagos (variáveis em `.env.example`).

## Rodar localmente

```bash
cp .env.example .env.local   # preencha URL e chave do Supabase
npm install
npm run dev
```

O banco fica em `supabase/migrations/`. As funções principais são `buscar_viagens` (rotas que passam perto da origem e do destino, no sentido certo), `reservar` (recalcula o ponto no servidor e controla as vagas) e `publicar_viagem`.

## Telas

| Rota | O que faz |
| --- | --- |
| `/` | Início e como funciona |
| `/entrar` | Cadastro e login com e-mail e senha |
| `/perfil` | Cadastro do passageiro e, opcionalmente, do motorista |
| `/motorista/nova` | Publicar viagem: origem, destino, rota, horário e vagas |
| `/motorista` | Viagens do motorista, passageiros e pontos de embarque, iniciar e concluir |
| `/carona` | Buscar caronas que passam perto, ver o ponto de embarque e reservar |
| `/minhas-caronas` | Reservas, Pix, compartilhar viagem, 190 e avaliação |
