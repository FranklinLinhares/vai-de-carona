"use client";

import { useEffect, useRef, useState } from "react";
import Mapa, { type Marcador } from "@/components/Mapa";
import { tracarCaminhada, trechoDaRota, comprimentoM, nomeDoLocal, distanciaM, formatarMinutos, type Rota } from "@/lib/geo";

type Ponto = { lat: number; lng: number };

/**
 * Um mapa so, como Uber e 99: mostra voce ao vivo (ponto azul), a linha a pe ate o embarque
 * (recalculada conforme voce anda), o trecho de carona, o carro ao vivo e a caminhada final.
 */
export default function PlanoViagem({
  rota,
  origem,
  destino,
  embarque,
  embarqueNome,
  desembarque,
  carro,
  emViagem: viagemComecou = false,
  altura = 360,
}: {
  rota: [number, number][] | null; // rota inteira do motorista [lng, lat]
  origem?: Ponto | null; // de onde o passageiro disse que sai
  destino?: Ponto | null; // para onde o passageiro vai
  embarque: Ponto;
  embarqueNome?: string | null;
  desembarque: Ponto;
  carro?: (Ponto & { atualizado_em?: string }) | null; // posicao ao vivo do carro
  emViagem?: boolean; // a viagem ja comecou
  altura?: number;
}) {
  const [eu, setEu] = useState<Ponto | null>(null); // localizacao ao vivo do passageiro
  const [ida, setIda] = useState<Rota | null>(null);
  const [volta, setVolta] = useState<Rota | null>(null);
  const [nomeDesce, setNomeDesce] = useState("");
  const calculadoDe = useRef<Ponto | null>(null);
  const [semGps, setSemGps] = useState(false);
  // a viagem comecou e voce esta dentro do carro (seu celular perto do carro); sem GPS, assume que sim
  const emViagem = viagemComecou && (eu && carro ? distanciaM(eu, carro) < 80 : semGps);

  // localizacao ao vivo (pede permissao uma vez)
  useEffect(() => {
    if (!("geolocation" in navigator)) return setSemGps(true);
    const id = navigator.geolocation.watchPosition(
      (p) => setEu({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setSemGps(true),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ponto de partida da caminhada: onde voce esta agora (se estiver perto) ou o endereco informado
  const pertoDaRota = !!eu && distanciaM(eu, embarque) < 3000;
  const partida = pertoDaRota ? eu : origem ?? null;

  // linha a pe ate o embarque; recalcula quando voce anda mais de 30 m
  useEffect(() => {
    if (!partida || emViagem) {
      setIda(null);
      return;
    }
    if (calculadoDe.current && distanciaM(calculadoDe.current, partida) < 30) return;
    calculadoDe.current = partida;
    let vivo = true;
    tracarCaminhada(partida, embarque).then((r) => vivo && setIda(r));
    return () => {
      vivo = false;
    };
  }, [partida?.lat, partida?.lng, embarque.lat, embarque.lng, emViagem]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true;
    if (destino) tracarCaminhada(desembarque, destino).then((r) => vivo && setVolta(r));
    nomeDoLocal(desembarque.lat, desembarque.lng).then((n) => vivo && setNomeDesce(n));
    return () => {
      vivo = false;
    };
  }, [destino?.lat, destino?.lng, desembarque.lat, desembarque.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const trecho = rota ? trechoDaRota(rota, embarque, desembarque) : [];
  const kmCarro = trecho.length > 1 ? comprimentoM(trecho) / 1000 : null;
  const faltaEmbarque = partida ? Math.round(distanciaM(partida, embarque)) : null;
  const noPonto = faltaEmbarque != null && faltaEmbarque < 25;
  const carroAte = carro && !emViagem ? Math.round(distanciaM(carro, embarque)) : null;
  const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

  const marcadores: Marcador[] = [
    { ...embarque, cor: "#2563eb", rotulo: "Embarque" },
    { ...desembarque, cor: "#b91c1c", rotulo: "Desce" },
    ...(destino ? [{ ...destino, cor: "#111827", rotulo: "Destino", icone: "🏁" }] : []),
    ...(!pertoDaRota && origem ? [{ ...origem, cor: "#64748b", rotulo: "Saída", icone: "🧍" }] : []),
    ...(carro ? [{ lat: carro.lat, lng: carro.lng, cor: "#f59e0b", rotulo: "Carro", icone: "🚗" }] : []),
  ];

  // enquadra o momento atual: antes do embarque, voce + ponto (+ carro perto); na viagem, carro ate o destino
  const foco = emViagem
    ? [...(carro ? [carro] : []), desembarque, ...(destino ? [destino] : [])]
    : [...(partida ? [partida] : []), embarque, ...(carro && carroAte != null && carroAte < 3000 ? [carro] : [])];

  // cartao de status, como nos apps de corrida
  let titulo: string;
  let detalhe: string;
  if (emViagem) {
    titulo = `Desça em ${nomeDesce || "no ponto vermelho"}`;
    detalhe = volta && volta.distanciaM >= 25
      ? `Depois são ${volta.distanciaM} m a pé (${formatarMinutos(volta.duracaoS)}) até o destino.`
      : "Fica bem no seu destino.";
  } else if (noPonto) {
    titulo = "Você está no ponto de embarque";
    detalhe = carroAte != null ? `O carro está a ${km(carroAte)}.` : "Espere aqui. O motorista passa por este ponto.";
  } else {
    titulo = `Caminhe até ${embarqueNome || "o ponto de embarque"}`;
    detalhe = ida
      ? `${km(ida.distanciaM)} · ${formatarMinutos(ida.duracaoS)} a pé. Siga a linha azul tracejada.`
      : "Siga até o ponto azul, na rua por onde o carro passa.";
    if (carroAte != null) detalhe += ` O carro está a ${km(carroAte)} do ponto.`;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <Mapa
        altura={altura}
        semBorda
        rotas={[
          ...(rota ? [{ coordenadas: rota, cor: "#94a3b8", peso: 4, opacidade: 0.5 }] : []),
          ...(trecho.length > 1 ? [{ coordenadas: trecho, cor: "#0b5d57", peso: 6, opacidade: 0.95 }] : []),
          ...(ida && !noPonto ? [{ coordenadas: ida.coordenadas, cor: "#2563eb", tracejada: true, peso: 5 }] : []),
          ...(volta ? [{ coordenadas: volta.coordenadas, cor: "#b91c1c", tracejada: true, peso: 5 }] : []),
        ]}
        marcadores={marcadores}
        voce={pertoDaRota ? eu : null}
        enquadrar={foco}
      />
      <div className="space-y-1 bg-white p-3">
        <p className="text-base font-semibold">{titulo}</p>
        <p className="text-sm text-slate-600">{detalhe}</p>
        {!emViagem && kmCarro && (
          <p className="text-xs text-slate-500">
            Depois: {kmCarro.toFixed(1).replace(".", ",")} km de carona pelo trecho verde. Desce em {nomeDesce || "no ponto vermelho"}.
          </p>
        )}
        {semGps && <p className="text-xs text-amber-700">Ative a localização para ver você no mapa enquanto caminha.</p>}
      </div>
    </div>
  );
}
