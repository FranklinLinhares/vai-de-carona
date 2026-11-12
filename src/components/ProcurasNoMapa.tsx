"use client";

import { useEffect, useState } from "react";
import Mapa, { type Marcador } from "@/components/Mapa";
import { supabase } from "@/lib/supabase";

type Procura = { origem_lat: number; origem_lng: number; destino_lat: number; destino_lng: number; minutos: number; combina: boolean };

/**
 * Para o motorista: onde ha gente procurando carona agora (ultimas 2 h).
 * Pontos aproximados (~100 m), sem nome. Com uma viagem, destaca quem combina com a sua rota.
 */
export default function ProcurasNoMapa({ viagemId, rota }: { viagemId?: string | null; rota?: [number, number][] | null }) {
  const [lista, setLista] = useState<Procura[] | null>(null);

  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      supabase.rpc("procuras_no_mapa", { p_viagem: viagemId ?? null }).then(({ data }) => vivo && setLista((data as Procura[]) ?? []));
    carregar();
    const t = setInterval(carregar, 60000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [viagemId]);

  if (!lista) return null;
  const combinam = lista.filter((p) => p.combina).length;
  const quando = (m: number) => (m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h`);
  const marcadores: Marcador[] = lista.map((p) => ({
    lat: p.origem_lat,
    lng: p.origem_lng,
    cor: p.combina ? "#0b5d57" : "#64748b",
    icone: p.combina ? "🙋" : "🧍",
    rotulo: `Procurou carona ${quando(p.minutos)}${p.combina ? " · passa na sua rota" : ""}`,
  }));

  return (
    <section className="cartao space-y-2">
      <h2 className="font-semibold">Gente procurando carona agora</h2>
      {lista.length === 0 ? (
        <p className="text-sm text-[var(--cinza)]">Ninguém procurou carona nas últimas 2 horas.</p>
      ) : (
        <>
          <Mapa
            altura={240}
            rotas={[
              ...(rota ? [{ coordenadas: rota, cor: "#0b5d57", peso: 5 }] : []),
              ...lista.map((p) => ({
                coordenadas: [[p.origem_lng, p.origem_lat], [p.destino_lng, p.destino_lat]] as [number, number][],
                cor: p.combina ? "#0b5d57" : "#94a3b8",
                tracejada: true,
                peso: 3,
                opacidade: 0.7,
              })),
            ]}
            marcadores={marcadores}
          />
          <p className="text-sm text-[var(--cinza)]">
            {lista.length} {lista.length === 1 ? "pessoa procurou" : "pessoas procuraram"} carona nas últimas 2 h. A linha tracejada vai de onde a
            pessoa está até para onde quer ir.
            {rota ? (combinam ? ` ${combinam} combinam com a sua próxima viagem (🙋).` : " Nenhuma combina com a sua próxima viagem.") : " Publique uma viagem passando por elas."}
          </p>
        </>
      )}
    </section>
  );
}
