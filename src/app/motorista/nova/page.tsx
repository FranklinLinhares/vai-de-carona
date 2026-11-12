"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Protegido from "@/components/Protegido";
import BuscaLocal from "@/components/BuscaLocal";
import Mapa from "@/components/Mapa";
import { tracarRota, formatarReais, nomeDoLocal, pontoNaRota, type Local, type Rota } from "@/lib/geo";
import MarcarNoMapa, { type Modo } from "@/components/MarcarNoMapa";
import { REGRAS } from "@/lib/config";
import { supabase, mensagemErro } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";

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
  const { perfil } = useSessao();
  const [soMulheres, setSoMulheres] = useState(false);
  const [repetir, setRepetir] = useState(false);
  const [paradas, setParadas] = useState<Local[]>([]);
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[]>([]);
  const [grupoId, setGrupoId] = useState("");

  useEffect(() => {
    supabase.from("grupos").select("id,nome").order("nome").then(({ data }) => setGrupos(data ?? []));
  }, []);
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [origem, setOrigem] = useState<Local | null>(null);
  const [destino, setDestino] = useState<Local | null>(null);
  const [rota, setRota] = useState<Rota | null>(null);
  const [partida, setPartida] = useState(horarioPadrao());
  const [vagas, setVagas] = useState(3);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [marcando, setMarcando] = useState<Modo | null>(null);

  async function tocarMapa(lat: number, lng: number) {
    if (!marcando) return;
    const qual = marcando;
    if (qual === "parada") {
      if (!rota) return;
      if (paradas.length >= 5) return setErro("No máximo 5 paradas.");
      const p = pontoNaRota({ lat, lng }, rota.coordenadas);
      if (p.distancia > 150) return setErro("Toque mais perto da rota para marcar a parada.");
      setErro("");
      const nome = await nomeDoLocal(p.lat, p.lng);
      setParadas((ps) => [...ps, { nome, lat: p.lat, lng: p.lng }]);
      return; // continua no modo parada para marcar outras
    }
    setMarcando(null);
    const local = { nome: await nomeDoLocal(lat, lng), lat, lng };
    if (qual === "origem") { setOrigem(local); calcular(local, destino); }
    else { setDestino(local); calcular(origem, local); }
  }

  async function calcular(o: Local | null, d: Local | null) {
    setRota(null);
    setParadas([]);
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
    if (!repetir && quando.getTime() < Date.now() - 5 * 60000) return setErro("O horário de saída já passou.");
    setOcupado(true);
    setErro("");
    if (repetir) {
      if (!dias.length) {
        setOcupado(false);
        return setErro("Escolha pelo menos um dia da semana.");
      }
      const { data: serieId, error: erroSerie } = await supabase.rpc("criar_serie", {
        p_origem_nome: origem.nome,
        p_destino_nome: destino.nome,
        p_rota_geojson: { type: "LineString", coordinates: rota.coordenadas },
        p_distancia_m: rota.distanciaM,
        p_duracao_s: rota.duracaoS,
        p_dias: dias,
        p_hora: partida.slice(11, 16),
        p_vagas: vagas,
        p_tarifa: REGRAS.tarifa,
        p_so_mulheres: soMulheres,
      });
      if (!erroSerie && (paradas.length || grupoId)) {
        const { error: e3 } = await supabase.rpc("configurar_serie", { p_serie: serieId, p_paradas: paradas.length ? paradas : null, p_grupo: grupoId || null });
        if (e3) {
          await supabase.rpc("encerrar_serie", { p_serie: serieId });
          setOcupado(false);
          return setErro(mensagemErro(e3));
        }
      }
      setOcupado(false);
      if (erroSerie) return setErro(mensagemErro(erroSerie));
      return router.push("/motorista");
    }
    const { data: novaId, error } = await supabase.rpc("publicar_viagem", {
      p_origem_nome: origem.nome,
      p_destino_nome: destino.nome,
      p_rota_geojson: { type: "LineString", coordinates: rota.coordenadas },
      p_distancia_m: rota.distanciaM,
      p_duracao_s: rota.duracaoS,
      p_partida_em: quando.toISOString(),
      p_vagas: vagas,
      p_tarifa: REGRAS.tarifa,
    });
    if (!error && (soMulheres || paradas.length || grupoId)) {
      const { error: e2 } = await supabase
        .from("viagens")
        .update({ so_mulheres: soMulheres, paradas: paradas.length ? paradas : null, grupo_id: grupoId || null })
        .eq("id", novaId as string);
      if (e2) {
        // nao deixa a viagem publicada sem as restricoes escolhidas
        await supabase.from("viagens").update({ status: "cancelada" }).eq("id", novaId as string);
        setOcupado(false);
        return setErro(mensagemErro(e2));
      }
    }
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    router.push("/motorista");
  }

  const marcadores = [
    ...paradas.map((p, i) => ({ ...p, cor: "#2563eb", rotulo: `🚏 ${i + 1}` })),
    ...(origem ? [{ ...origem, cor: "#0b5d57", rotulo: "Saída" }] : []),
    ...(destino ? [{ ...destino, cor: "#b91c1c", rotulo: "Destino" }] : []),
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="titulo-pagina">Oferecer carona</h1>
      <div className="cartao space-y-3">
        <BuscaLocal rotulo="Saindo de" valor={origem} permitirLocalizacao onEscolher={(l) => { setOrigem(l); calcular(l, destino); }} />
        <BuscaLocal rotulo="Indo para" valor={destino} onEscolher={(l) => { setDestino(l); calcular(origem, l); }} />
      </div>

      <MarcarNoMapa
        marcando={marcando}
        onMudar={setMarcando}
        rotulos={rota ? { origem: "Saída", destino: "Destino", parada: "+ Parada" } : { origem: "Saída", destino: "Destino" }}
      />
      <Mapa rotas={rota ? [{ coordenadas: rota.coordenadas }] : []} marcadores={marcadores} onClique={tocarMapa} />
      {ocupado && !rota && <p className="text-sm text-slate-500">Traçando a rota…</p>}
      {rota && (
        <p className="text-sm text-slate-600">
          {(rota.distanciaM / 1000).toFixed(1)} km · cerca de {Math.round(rota.duracaoS / 60)} min. Você segue esta rota e os passageiros esperam em pontos dela.
        </p>
      )}

      <div className="cartao grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-[var(--mar)]" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
            🔁 Repetir toda semana
          </label>
        </div>
        {repetir ? (
          <>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Dias</label>
              <div className="flex gap-1">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((l, d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort())}
                    className={`h-10 flex-1 rounded-lg text-sm font-semibold ${dias.includes(d) ? "bg-[var(--mar)] text-white" : "border border-slate-300 bg-white text-slate-600"}`}
                    aria-label={["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d]}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Horário de saída</label>
              <input
                type="time"
                className="campo"
                value={partida.slice(11, 16)}
                onChange={(e) => setPartida(partida.slice(0, 11) + e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">O app publica as viagens das próximas 2 semanas e renova sozinho todo dia.</p>
            </div>
          </>
        ) : (
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium">Horário de saída</label>
            <input type="datetime-local" className="campo" value={partida} onChange={(e) => setPartida(e.target.value)} />
          </div>
        )}
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

      {rota && (
        <div className="cartao space-y-2 text-sm">
          <p className="font-medium">🚏 Paradas (opcional)</p>
          <p className="text-xs text-slate-600">
            Marque de 2 a 5 pontos na rota onde você pode parar, como paradas de ônibus. Os passageiros escolhem um deles. Sem paradas, o
            app sugere o ponto da rota mais perto de cada passageiro.
          </p>
          {paradas.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
              <span>{i + 1}. {p.nome}</span>
              <button className="text-xs text-red-600" onClick={() => setParadas(paradas.filter((_, j) => j !== i))}>Remover</button>
            </div>
          ))}
          <button type="button" className="botao-secundario" onClick={() => setMarcando(marcando === "parada" ? null : "parada")}>
            {marcando === "parada" ? "Concluir paradas" : "Marcar paradas no mapa"}
          </button>
        </div>
      )}
      {grupos.length > 0 && (
        <div className="cartao text-sm">
          <label className="mb-1 block font-medium">Quem pode ver esta carona</label>
          <select className="campo" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>Só o grupo {g.nome}</option>
            ))}
          </select>
        </div>
      )}
      {perfil?.genero === "feminino" && (
        <label className="cartao flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--mar)]" checked={soMulheres} onChange={(e) => setSoMulheres(e.target.checked)} />
          Levar só passageiras mulheres
        </label>
      )}
      <p className="text-xs text-slate-500">Limite de 2 caronas por dia: a carona serve para dividir custos, não para trabalhar como motorista.</p>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <button className="botao w-full py-3 text-lg" disabled={!rota || ocupado} onClick={publicar}>
        Publicar viagem
      </button>
    </div>
  );
}
