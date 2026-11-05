"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Durante a viagem, envia a posicao do carro para os passageiros aceitos (a cada ~8 s). */
export default function CompartilharPosicao({ viagemId }: { viagemId: string }) {
  const [estado, setEstado] = useState<"iniciando" | "ok" | "negado" | "sem_gps">("iniciando");
  const ultimo = useRef(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setEstado("sem_gps");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const agora = Date.now();
        if (agora - ultimo.current < 8000) return;
        ultimo.current = agora;
        const { error } = await supabase.rpc("atualizar_posicao", {
          p_viagem: viagemId, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude,
        });
        if (!error) setEstado("ok");
      },
      () => setEstado("negado"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [viagemId]);

  const texto = {
    iniciando: "📍 Ligando a localização para os passageiros verem o carro…",
    ok: "📍 Passageiros estão vendo onde o carro está. Deixe esta tela aberta.",
    negado: "📍 Permita o acesso à localização para os passageiros verem o carro.",
    sem_gps: "📍 Este aparelho não compartilha localização.",
  }[estado];
  return <p className={`w-full text-sm ${estado === "ok" ? "text-teal-700" : "text-amber-700"}`}>{texto}</p>;
}
