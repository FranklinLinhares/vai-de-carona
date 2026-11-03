// Configuracoes do MVP. Ajuste aqui as regras de negocio.
export const CIDADE = {
  nome: "João Pessoa",
  centro: [-7.1195, -34.845] as [number, number], // [lat, lng]
  // caixa usada para limitar a busca de enderecos (oeste, norte, leste, sul)
  viewbox: [-35.02, -7.03, -34.79, -7.26] as [number, number, number, number],
};

export const REGRAS = {
  tarifa: Number(process.env.NEXT_PUBLIC_TARIFA ?? "5"), // R$ por viagem
  raioCaminhadaM: 500, // distancia maxima a pe ate a rota
  folgaChegadaMin: 3, // passageiro chega antes do horario previsto
  toleranciaEsperaMin: 2, // motorista espera no maximo
  vagasMax: 4,
  emergencia: "190",
};

export const SERVICOS = {
  // Servidores publicos de demonstracao. Em producao, use servidores proprios ou pagos.
  osrm: process.env.NEXT_PUBLIC_OSRM_URL ?? "https://router.project-osrm.org",
  nominatim: process.env.NEXT_PUBLIC_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org",
  overpass: process.env.NEXT_PUBLIC_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
};
