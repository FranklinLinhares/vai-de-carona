"use client";

import { useEffect, useState } from "react";
import Mapa, { type Marcador } from "@/components/Mapa";
import {
  tracarCaminhada, trechoDaRota, comprimentoM, nomeDoLocal, linkCaminhada, formatarMinutos, type Rota,
} from "@/lib/geo";

type Ponto = { lat: number; lng: number };

/**
 * Mostra o passo a passo da carona no mapa:
 * 1) caminhar ate o ponto de embarque, 2) ir de carro no trecho da rota, 3) descer e caminhar ate o destino.
 */
export default function PlanoViagem({
  rota,
  origem,
  destino,
  embarque,
  embarqueNome,
  desembarque,
  carro,
  altura = 280,
}: {
  rota: [number, number][] | null; // rota inteira do motorista [lng, lat]
  origem?: Ponto | null; // onde o passageiro esta
  destino?: Ponto | null; // para onde o passageiro vai
  embarque: Ponto;
  embarqueNome?: string | null;
  desembarque: Ponto;
  carro?: (Ponto & { atualizado_em?: string }) | null; // posicao ao vivo do carro
  altura?: number;
}) {
  const [ida, setIda] = useState<Rota | null>(null);
  const [volta, setVolta] = useState<Rota | null>(null);
  const [nomeDesce, setNomeDesce] = useState<string>("");

  const chave = (p?: Ponto | null) => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : "");

  useEffect(() => {
    let vivo = true;
    setIda(null);
    if (origem) tracarCaminhada(origem, embarque).then((r) => vivo && setIda(r));
    return () => {
      vivo = false;
    };
  }, [chave(origem), chave(embarque)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true;
    setVolta(null);
    if (destino) tracarCaminhada(desembarque, destino).then((r) => vivo && setVolta(r));
    nomeDoLocal(desembarque.lat, desembarque.lng).then((n) => vivo && setNomeDesce(n));
    return () => {
      vivo = false;
    };
  }, [chave(destino), chave(desembarque)]); // eslint-disable-line react-hooks/exhaustive-deps

  const trecho = rota ? trechoDaRota(rota, embarque, desembarque) : [];
  const kmCarro = trecho.length > 1 ? comprimentoM(trecho) / 1000 : null;
  const andou = (m: number) => m < 25; // ja esta praticamente no ponto

  const marcadores: Marcador[] = [
    ...(origem ? [{ ...origem, cor: "#64748b", rotulo: "Você", icone: "🧍" }] : []),
    { ...embarque, cor: "#2563eb", rotulo: "Embarque" },
    { ...desembarque, cor: "#b91c1c", rotulo: "Desce" },
    ...(destino ? [{ ...destino, cor: "#111827", rotulo: "Destino", icone: "🏁" }] : []),
    ...(carro ? [{ lat: carro.lat, lng: carro.lng, cor: "#f59e0b", rotulo: "Carro agora", icone: "🚗" }] : []),
  ];
  // zoom no que importa ao passageiro: caminhadas e o trecho de carro
  const foco = [...(origem ? [origem] : []), embarque, desembarque, ...(destino ? [destino] : [])];

  return (
    <div className="space-y-3">
      <Mapa
        altura={altura}
        rotas={[
          ...(rota ? [{ coordenadas: rota, cor: "#94a3b8", peso: 4, opacidade: 0.6 }] : []),
          ...(trecho.length > 1 ? [{ coordenadas: trecho, cor: "#0f766e", peso: 6, opacidade: 0.95 }] : []),
          ...(ida ? [{ coordenadas: ida.coordenadas, cor: "#2563eb", tracejada: true, peso: 5 }] : []),
          ...(volta ? [{ coordenadas: volta.coordenadas, cor: "#b91c1c", tracejada: true, peso: 5 }] : []),
        ]}
        marcadores={marcadores}
        enquadrar={foco}
      />

      <ol className="space-y-2 text-sm">
        <li className="flex gap-2">
          <span className="text-lg leading-5">🚶</span>
          <div className="flex-1">
            {ida && andou(ida.distanciaM) ? (
              <p>Você já está no ponto de embarque{embarqueNome ? <>: <strong>{embarqueNome}</strong></> : null}.</p>
            ) : (
              <p>
                <strong>Vá a pé até o ponto de embarque</strong>
                {embarqueNome ? <>: {embarqueNome}</> : " (ponto azul, na rua por onde o carro passa)"}.
                {ida && <> São {ida.distanciaM} m, cerca de {formatarMinutos(ida.duracaoS)}.</>}
              </p>
            )}
            {origem && (
              <a className="text-teal-700 underline" href={linkCaminhada(origem, embarque)} target="_blank" rel="noreferrer">
                Abrir caminho a pé no mapa do celular
              </a>
            )}
          </div>
        </li>
        <li className="flex gap-2">
          <span className="text-lg leading-5">🚗</span>
          <p className="flex-1">
            <strong>Vá de carona</strong> pelo trecho verde{kmCarro ? <> ({kmCarro.toFixed(1).replace(".", ",")} km)</> : null}.
            {carro && <> O 🚗 no mapa mostra onde o carro está agora.</>}
          </p>
        </li>
        <li className="flex gap-2">
          <span className="text-lg leading-5">📍</span>
          <div className="flex-1">
            <p>
              <strong>Desça em {nomeDesce || "no ponto vermelho"}</strong>, o ponto da rota mais perto do seu destino.
              {volta && !andou(volta.distanciaM) && <> Depois caminhe {volta.distanciaM} m, cerca de {formatarMinutos(volta.duracaoS)}.</>}
            </p>
            {destino && volta && !andou(volta.distanciaM) && (
              <a className="text-teal-700 underline" href={linkCaminhada(desembarque, destino)} target="_blank" rel="noreferrer">
                Abrir caminho até o destino
              </a>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
