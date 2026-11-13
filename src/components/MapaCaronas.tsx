"use client";

import { useEffect, useState } from "react";
import Mapa, { type Marcador } from "@/components/Mapa";
import { supabase } from "@/lib/supabase";
import { formatarHora } from "@/lib/geo";
import { REGRAS } from "@/lib/config";

export type CaronaNoMapa = {
  viagem_id: string;
  motorista_nome: string;
  status: "aberta" | "em_andamento";
  partida_em: string;
  origem_nome: string;
  destino_nome: string;
  vagas_livres: number;
  rota_geojson: { coordinates: [number, number][] };
  carro_lat: number;
  carro_lng: number;
  carro_ao_vivo: boolean | null;
  dist_origem_m: number | null;
  dist_destino_m: number | null;
  mesmo_sentido: boolean | null;
};

type Ponto = { lat: number; lng: number };

const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

/** Por que esta carona nao serve para voce (ou null se serve). */
export function motivo(c: CaronaNoMapa): string | null {
  if (c.dist_origem_m == null || c.dist_destino_m == null) return null;
  const r = REGRAS.raioCaminhadaM;
  if (c.dist_origem_m > r && c.dist_destino_m > r) return `passa a ${km(c.dist_origem_m)} de você e a ${km(c.dist_destino_m)} do destino`;
  if (c.dist_origem_m > r) return `passa a ${km(c.dist_origem_m)} de você (o limite é ${r} m a pé)`;
  if (c.dist_destino_m > r) return `passa a ${km(c.dist_destino_m)} do seu destino (o limite é ${r} m)`;
  if (c.mesmo_sentido === false) return "vai no sentido contrário ao seu";
  if (c.vagas_livres <= 0) return "está lotada";
  return null;
}

/**
 * Mapa com os carros que vao sair (ou ja estao rodando) no periodo: a rota de cada motorista e o carro.
 * Verde = passa perto de voce e do destino; cinza = nao serve para o seu trajeto.
 */
export default function MapaCaronas({
  horas,
  origem,
  destino,
  altura = 300,
  onCarregar,
  onClique,
}: {
  horas: number;
  origem?: Ponto | null;
  destino?: Ponto | null;
  altura?: number;
  onCarregar?: (lista: CaronaNoMapa[]) => void;
  onClique?: (lat: number, lng: number) => void;
}) {
  const [lista, setLista] = useState<CaronaNoMapa[] | null>(null);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      const { data } = await supabase.rpc("caronas_no_mapa", {
        a_partir: new Date().toISOString(),
        ate: new Date(Date.now() + horas * 3600000).toISOString(),
        origem_lng: origem?.lng ?? null,
        origem_lat: origem?.lat ?? null,
        destino_lng: destino?.lng ?? null,
        destino_lat: destino?.lat ?? null,
      });
      if (!vivo) return;
      const l = (data as CaronaNoMapa[]) ?? [];
      setLista(l);
      onCarregar?.(l);
    };
    carregar();
    const t = setInterval(carregar, 30000); // carros rodando se mexem
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [horas, origem?.lat, origem?.lng, destino?.lat, destino?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const temTrajeto = !!origem && !!destino;
  const marcadores: Marcador[] = [
    ...(lista ?? []).map((c) => ({
      lat: c.carro_lat,
      lng: c.carro_lng,
      cor: "#f59e0b",
      icone: "🚗",
      rotulo: `${c.motorista_nome} · ${c.status === "em_andamento" ? (c.carro_ao_vivo ? "rodando agora" : "já saiu") : `sai às ${formatarHora(c.partida_em)}`} · ${c.vagas_livres} ${c.vagas_livres === 1 ? "lugar" : "lugares"} → ${c.destino_nome}`,
    })),
    ...(origem ? [{ ...origem, cor: "#2563eb", rotulo: "Você" }] : []),
    ...(destino ? [{ ...destino, cor: "#b91c1c", rotulo: "Destino" }] : []),
  ];

  return (
    <div className="space-y-2">
      <Mapa
        altura={altura}
        onClique={onClique}
        rotas={(lista ?? []).map((c) => {
          const serve = temTrajeto && !motivo(c);
          return { coordenadas: c.rota_geojson.coordinates, cor: serve ? "#0b5d57" : temTrajeto ? "#94a3b8" : "#0b5d57", peso: serve ? 6 : 4, opacidade: serve ? 0.95 : 0.6 };
        })}
        marcadores={marcadores}
        enquadrar={temTrajeto ? [origem!, destino!] : undefined /* sem trajeto: mostra todas as rotas */}
      />
      <p className="text-xs text-[var(--cinza)]">
        {lista == null
          ? "Carregando os carros…"
          : lista.length === 0
            ? `Nenhum motorista com carona marcada nas próximas ${horas} h.`
            : `🚗 ${lista.length} ${lista.length === 1 ? "carro" : "carros"} com carona nas próximas ${horas} h. Toque no carro para ver para onde vai.`}
      </p>
    </div>
  );
}
