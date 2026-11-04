import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigurado = Boolean(url && chave);

export const supabase = createClient(url || "http://localhost:54321", chave || "chave-ausente");

export type Perfil = {
  id: string;
  nome: string;
  telefone: string;
  foto_url: string | null;
  cpf: string | null;
  cnh: string | null;
  carro_modelo: string | null;
  carro_cor: string | null;
  carro_placa: string | null;
  chave_pix: string | null;
  nota_media: number | null;
  total_avaliacoes: number;
  suspenso: boolean;
  genero: "feminino" | "masculino" | "outro" | null;
};

export type ViagemDetalhe = {
  id: string;
  motorista_id: string;
  origem_nome: string;
  destino_nome: string;
  distancia_m: number;
  duracao_s: number;
  partida_em: string;
  vagas: number;
  tarifa: number;
  status: "aberta" | "em_andamento" | "concluida" | "cancelada";
  rota_geojson: { type: "LineString"; coordinates: [number, number][] };
  so_mulheres: boolean;
};

export type ReservaDetalhe = {
  id: string;
  viagem_id: string;
  passageiro_id: string;
  embarque_nome: string | null;
  embarque_previsto: string;
  caminhada_embarque_m: number;
  caminhada_desembarque_m: number;
  status: "confirmada" | "cancelada" | "concluida";
  embarque_lng: number;
  embarque_lat: number;
  desembarque_lng: number;
  desembarque_lat: number;
  aprovacao: "pendente" | "aceita" | "recusada";
};

export type Resultado = {
  viagem_id: string;
  motorista_id: string;
  motorista_nome: string;
  motorista_nota: number | null;
  motorista_total_avaliacoes: number;
  carro: string;
  origem_nome: string;
  destino_nome: string;
  partida_em: string;
  tarifa: number;
  vagas_livres: number;
  embarque_lng: number;
  embarque_lat: number;
  desembarque_lng: number;
  desembarque_lat: number;
  embarque_previsto: string;
  caminhada_embarque_m: number;
  caminhada_desembarque_m: number;
};

// Colunas de perfis visiveis para outros usuarios (CPF e CNH ficam ocultos)
export const COLUNAS_PUBLICAS_PERFIL =
  "id,nome,telefone,foto_url,carro_modelo,carro_cor,carro_placa,chave_pix,nota_media,total_avaliacoes,suspenso,genero";

export function mensagemErro(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Algo deu errado. Tente de novo.";
}
