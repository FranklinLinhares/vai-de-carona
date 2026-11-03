"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Protegido from "@/components/Protegido";
import BuscaLocal from "@/components/BuscaLocal";
import Mapa from "@/components/Mapa";
import { tracarRota, formatarReais, type Local, type Rota } from "@/lib/geo";
import { REGRAS } from "@/lib/config";
import { supabase, mensagemErro } from "@/lib/supabase";

function horarioPadrao() {
  const d = new Date(Date.now() + 30 * 60000);
  d.setSeconds(0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function NovaViagem() {
  return (
    <Protegido motorista>
      <Formulario />
    </Protegido>
  );
}

function Formulario() {
  const router = useRouter();
  const [origem, setOrigem] = useState<Local | null>(null);
  const [destino, setDestino] = useState<Local | null>(null);
  const [rota, setRota] = useState<Rota | null>(null);
  const [partida, setPartida] = useState(horarioPadrao());
  const [vagas, setVagas] = useState(3);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function calcular(o: Local | null, d: Local | null) {
    setRota(null);
    setErro("");
    if (!o || !d) return;
    setOcupado(true);
    try {
      setRota(await tracarRota(o, d));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function publicar() {
    if (!origem || !destino || !rota) return;
    const quando = new Date(partida);
    if (quando.getTime() < Date.now() - 5 * 60000) return setErro("O horário de saída já passou.");
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc("publicar_viagem", {
      p_origem_nome: origem.nome,
      p_destino_nome: destino.nome,
      p_rota_geojson: { type: "LineString", coordinates: rota.coordenadas },
      p_distancia_m: rota.distanciaM,
      p_duracao_s: rota.duracaoS,
      p_partida_em: quando.toISOString(),
      p_vagas: vagas,
      p_tarifa: REGRAS.tarifa,
    });
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    router.push("/motorista");
  }

  const marcadores = [
    ...(origem ? [{ ...origem, cor: "#0f766e", rotulo: "Saída" }] : []),
    ...(destino ? [{ ...destino, cor: "#b91c1c", rotulo: "Destino" }] : []),
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Oferecer carona</h1>
      <div className="cartao space-y-3">
        <BuscaLocal rotulo="Saindo de" valor={origem} permitirLocalizacao onEscolher={(l) => { setOrigem(l); calcular(l, destino); }} />
        <BuscaLocal rotulo="Indo para" valor={destino} onEscolher={(l) => { setDestino(l); calcular(origem, l); }} />
      </div>

      <Mapa rotas={rota ? [{ coordenadas: rota.coordenadas }] : []} marcadores={marcadores} />
      {ocupado && !rota && <p className="text-sm text-slate-500">Traçando a rota…</p>}
      {rota && (
        <p className="text-sm text-slate-600">
          {(rota.distanciaM / 1000).toFixed(1)} km · cerca de {Math.round(rota.duracaoS / 60)} min. Você segue esta rota e os passageiros esperam em pontos dela.
        </p>
      )}

      <div className="cartao grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium">Horário de saída</label>
          <input type="datetime-local" className="campo" value={partida} onChange={(e) => setPartida(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Lugares livres</label>
          <select className="campo" value={vagas} onChange={(e) => setVagas(Number(e.target.value))}>
            {Array.from({ length: REGRAS.vagasMax }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Valor por pessoa</label>
          <p className="py-2 font-semibold">{formatarReais(REGRAS.tarifa)}</p>
        </div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <button className="botao w-full py-3 text-lg" disabled={!rota || ocupado} onClick={publicar}>
        Publicar viagem
      </button>
    </div>
  );
}
