import { CIDADE, SERVICOS } from "./config";
import { supabase } from "./supabase";

export type Local = { nome: string; lat: number; lng: number };

type FeaturePhoton = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; street?: string; housenumber?: string; district?: string;
    locality?: string; city?: string; osm_key?: string; osm_value?: string;
  };
};

/** Photon: busca tolerante a nomes parciais e bom para lugares (orgaos, lojas, escolas). */
async function buscarPhoton(texto: string, sinal?: AbortSignal): Promise<Local[]> {
  const [o, n, l, s] = CIDADE.viewbox;
  const [lat, lng] = CIDADE.centro;
  const params = new URLSearchParams({
    q: texto, limit: "8", lat: String(lat), lon: String(lng),
    bbox: `${o},${s},${l},${n}`, location_bias_scale: "0.5",
  });
  const r = await fetch(`${SERVICOS.photon}/api/?${params}`, { signal: sinal });
  if (!r.ok) return [];
  const d: { features: FeaturePhoton[] } = await r.json();
  return d.features.map((f) => {
    const p = f.properties;
    const rua = [p.street, p.housenumber].filter(Boolean).join(", ");
    const bairro = p.district ?? p.locality;
    const partes = [p.name, p.name !== p.street ? rua : p.housenumber, bairro].filter(Boolean);
    return { nome: [...new Set(partes)].join(" · "), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  });
}

/** Nominatim: bom para enderecos completos. */
let ultimoNominatim = 0;
async function buscarNominatim(texto: string, sinal?: AbortSignal): Promise<Local[]> {
  // o servidor publico aceita no maximo 1 pedido por segundo: espera a vez (e desiste se o texto mudou)
  const espera = ultimoNominatim + 1100 - Date.now();
  if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
  if (sinal?.aborted) return [];
  ultimoNominatim = Date.now();
  const [o, n, l, s] = CIDADE.viewbox;
  const params = new URLSearchParams({
    q: texto, format: "jsonv2", limit: "6", countrycodes: "br",
    viewbox: `${o},${n},${l},${s}`, bounded: "1", "accept-language": "pt-BR",
  });
  const r = await fetch(`${SERVICOS.nominatim}/search?${params}`, { signal: sinal });
  if (!r.ok) return [];
  const dados: { display_name: string; lat: string; lon: string }[] = await r.json();
  return dados.map((d) => ({
    nome: d.display_name.split(",").slice(0, 3).join(","),
    lat: Number(d.lat),
    lng: Number(d.lon),
  }));
}

function juntar(listas: Local[][]) {
  // remove repetidos (mesmo ponto a menos de ~50 m)
  const unicos: Local[] = [];
  for (const l of listas.flat()) if (!unicos.some((u) => distanciaM(u, l) < 50)) unicos.push(l);
  return unicos.slice(0, 8);
}

const cache = new Map<string, Local[]>();

const TIPOS: Record<string, string> = {
  restaurant: "Restaurante", fast_food: "Lanchonete", cafe: "Café", bar: "Bar", pharmacy: "Farmácia",
  hospital: "Hospital", clinic: "Clínica", school: "Escola", university: "Universidade", college: "Faculdade",
  bank: "Banco", fuel: "Posto", supermarket: "Supermercado", mall: "Shopping", place_of_worship: "Igreja",
  bus_station: "Rodoviária", police: "Polícia", townhall: "Prefeitura", marketplace: "Mercado", bakery: "Padaria",
  suburb: "Bairro", neighbourhood: "Bairro", quarter: "Bairro", platform: "Parada de ônibus", stop_position: "Parada de ônibus",
  government: "Órgão público", public: "Órgão público", park: "Parque", hotel: "Hotel", parking: "Estacionamento",
};

/** Indice proprio no nosso banco (Sao Paulo): ruas, bairros, paradas e lugares de Joao Pessoa. Bem rapido. */
async function buscarNoBanco(texto: string): Promise<Local[]> {
  const { data, error } = await supabase.rpc("buscar_lugares", { p_texto: texto, p_limite: 8 });
  if (error || !data) return [];
  return (data as { nome: string; tipo: string; detalhe: string | null; lat: number; lng: number }[]).map((l) => {
    const rotulo = l.tipo === "rua" ? "Rua" : l.tipo === "parada" ? "Parada de ônibus" : l.tipo === "bairro" ? "Bairro" : TIPOS[l.detalhe ?? ""];
    return { nome: rotulo && !l.nome.toLowerCase().startsWith(rotulo.toLowerCase()) && l.tipo !== "rua" ? `${l.nome} · ${rotulo}` : l.nome, lat: l.lat, lng: l.lng };
  });
}

/**
 * Busca enderecos e lugares dentro de Joao Pessoa.
 * Mostra logo o resultado do Photon (rapido) e completa com o Nominatim quando ele responder.
 */
export async function buscarEndereco(
  texto: string,
  opcoes: { sinal?: AbortSignal; parcial?: (r: Local[]) => void } = {},
): Promise<Local[]> {
  const chave = texto.trim().toLowerCase();
  if (chave.length < 3) return [];
  const guardado = cache.get(chave);
  if (guardado) return guardado;
  const { sinal, parcial } = opcoes;
  // 1) nosso banco responde primeiro; 2) Photon e Nominatim completam (enderecos com numero, lugares novos)
  let banco: Local[] = [];
  let rapido: Local[] = [];
  const mostrar = () => !sinal?.aborted && parcial?.(juntar([banco, rapido]));
  const local = buscarNoBanco(texto).then((r) => {
    banco = r;
    if (r.length) mostrar();
    return r;
  });
  const photon = buscarPhoton(texto, sinal).then((r) => {
    rapido = r;
    if (r.length) mostrar();
    return r;
  });
  // so incomoda o Nominatim (lento) quando o nosso banco achou pouco ou quando parece endereco com numero
  const precisaNominatim = async () => {
    const r = await local.catch(() => []);
    return r.length < 3 || /\d/.test(texto) ? buscarNominatim(texto, sinal) : [];
  };
  const [x, a, b] = await Promise.allSettled([local, photon, precisaNominatim()]);
  if (sinal?.aborted) return [];
  if (x.status === "rejected" && a.status === "rejected" && b.status === "rejected") throw new Error("Busca indisponível");
  const final = juntar([
    x.status === "fulfilled" ? x.value : [],
    a.status === "fulfilled" ? a.value : rapido,
    b.status === "fulfilled" ? b.value : [],
  ]);
  cache.set(chave, final);
  return final;
}

/** Nome legivel para uma coordenada (ex.: localizacao atual). */
export async function nomeDoLocal(lat: number, lng: number): Promise<string> {
  try {
    const params = new URLSearchParams({
      lat: String(lat), lon: String(lng), format: "jsonv2", zoom: "17", "accept-language": "pt-BR",
    });
    const r = await fetch(`${SERVICOS.nominatim}/reverse?${params}`);
    const d = await r.json();
    return String(d.display_name ?? "Minha localização").split(",").slice(0, 2).join(",");
  } catch {
    return "Minha localização";
  }
}

export type Rota = {
  coordenadas: [number, number][]; // [lng, lat], como no GeoJSON
  distanciaM: number;
  duracaoS: number;
};

/** Rota de carro entre dois pontos (OSRM). */
export async function tracarRota(a: Local, b: Local): Promise<Rota> {
  const url = `${SERVICOS.osrm}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Não foi possível traçar a rota");
  const d = await r.json();
  const rota = d.routes?.[0];
  if (!rota) throw new Error("Nenhuma rota encontrada");
  return {
    coordenadas: rota.geometry.coordinates,
    distanciaM: Math.round(rota.distance),
    duracaoS: Math.round(rota.duration),
  };
}

export type Parada = { nome: string; lat: number; lng: number };

/** Paradas de onibus perto de um ponto (Overpass / OpenStreetMap). */
export async function paradasProximas(lat: number, lng: number, raioM = 200): Promise<Parada[]> {
  const q = `[out:json][timeout:10];(node["highway"="bus_stop"](around:${raioM},${lat},${lng});node["public_transport"="platform"]["bus"="yes"](around:${raioM},${lat},${lng}););out;`;
  try {
    const r = await fetch(SERVICOS.overpass, { method: "POST", body: new URLSearchParams({ data: q }) });
    if (!r.ok) return [];
    const d: { elements: { lat: number; lon: number; tags?: { name?: string } }[] } = await r.json();
    return d.elements.map((e) => ({ nome: e.tags?.name ?? "Parada de ônibus", lat: e.lat, lng: e.lon }));
  } catch {
    return [];
  }
}

/** Distancia em metros entre dois pontos (Haversine). */
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distancia de um ponto ate a linha da rota (aproximacao local plana, suficiente na escala de uma cidade). */
export function distanciaAteRota(p: { lat: number; lng: number }, rota: [number, number][]) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  let min = Infinity;
  for (let i = 0; i < rota.length - 1; i++) {
    const ax = (rota[i][0] - p.lng) * kx, ay = (rota[i][1] - p.lat) * ky;
    const bx = (rota[i + 1][0] - p.lng) * kx, by = (rota[i + 1][1] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    min = Math.min(min, Math.hypot(cx, cy));
  }
  return min;
}

/**
 * Sugere uma parada de onibus que fica NA rota (ate 30 m) e perto do ponto calculado.
 * Se nao houver, retorna null e o app usa o ponto da via.
 */
export async function sugerirParada(
  ponto: { lat: number; lng: number },
  passageiro: { lat: number; lng: number },
  rota: [number, number][],
  raioCaminhadaM: number,
): Promise<Parada | null> {
  const paradas = await paradasProximas(ponto.lat, ponto.lng, 250);
  const validas = paradas
    .filter((p) => distanciaAteRota(p, rota) <= 30 && distanciaM(p, passageiro) <= raioCaminhadaM)
    .sort((a, b) => distanciaM(a, passageiro) - distanciaM(b, passageiro));
  return validas[0] ?? null;
}

export function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function formatarReais(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function linkMapa(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

/** Ponto da rota mais proximo de p (para "grudar" paradas na rota). */
export function pontoNaRota(p: { lat: number; lng: number }, rota: [number, number][]) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  let melhor = { lat: p.lat, lng: p.lng, d: Infinity };
  for (let i = 0; i < rota.length - 1; i++) {
    const ax = (rota[i][0] - p.lng) * kx, ay = (rota[i][1] - p.lat) * ky;
    const bx = (rota[i + 1][0] - p.lng) * kx, by = (rota[i + 1][1] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < melhor.d) melhor = { lng: p.lng + cx / kx, lat: p.lat + cy / ky, d };
  }
  return { lat: melhor.lat, lng: melhor.lng, distancia: melhor.d };
}

/** Caminho a pe entre dois pontos. Se o servico falhar, usa a linha reta. */
export async function tracarCaminhada(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<Rota> {
  try {
    const url = `${SERVICOS.osrmPe}/route/v1/foot/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) throw new Error();
    const rota = (await r.json()).routes?.[0];
    if (!rota) throw new Error();
    const distancia = Math.round(rota.distance);
    return { coordenadas: rota.geometry.coordinates, distanciaM: distancia, duracaoS: Math.round(distancia / 1.3) };
  } catch {
    const d = Math.round(distanciaM(a, b) * 1.3); // ruas nao sao linha reta
    return { coordenadas: [[a.lng, a.lat], [b.lng, b.lat]], distanciaM: d, duracaoS: Math.round(d / 1.3) };
  }
}

/** Indice do trecho da rota mais proximo de p, e a posicao projetada nele. */
function projetarNaRota(p: { lat: number; lng: number }, rota: [number, number][]) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  let melhor = { i: 0, d: Infinity, ponto: rota[0] };
  for (let i = 0; i < rota.length - 1; i++) {
    const ax = (rota[i][0] - p.lng) * kx, ay = (rota[i][1] - p.lat) * ky;
    const bx = (rota[i + 1][0] - p.lng) * kx, by = (rota[i + 1][1] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < melhor.d) melhor = { i, d, ponto: [p.lng + cx / kx, p.lat + cy / ky] };
  }
  return melhor;
}

/** Trecho da rota entre o embarque e o desembarque (o pedaco que o passageiro vai junto). */
export function trechoDaRota(rota: [number, number][], de: { lat: number; lng: number }, ate: { lat: number; lng: number }) {
  if (rota.length < 2) return rota;
  const a = projetarNaRota(de, rota);
  const b = projetarNaRota(ate, rota);
  if (b.i < a.i) return [];
  return [a.ponto, ...rota.slice(a.i + 1, b.i + 1), b.ponto];
}

export function comprimentoM(coords: [number, number][]) {
  let t = 0;
  for (let i = 1; i < coords.length; i++)
    t += distanciaM({ lng: coords[i - 1][0], lat: coords[i - 1][1] }, { lng: coords[i][0], lat: coords[i][1] });
  return t;
}

/** Abre o caminho a pe no app de mapas do celular. */
export function linkCaminhada(de: { lat: number; lng: number }, ate: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&origin=${de.lat},${de.lng}&destination=${ate.lat},${ate.lng}&travelmode=walking`;
}

export function formatarMinutos(s: number) {
  return `${Math.max(1, Math.round(s / 60))} min`;
}
