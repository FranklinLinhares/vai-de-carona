"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Protegido from "@/components/Protegido";
import BuscaLocal from "@/components/BuscaLocal";
import Mapa from "@/components/Mapa";
import PlanoViagem from "@/components/PlanoViagem";
import { Nota } from "@/components/Estrelas";
import { supabase, mensagemErro, type Resultado, type ViagemDetalhe } from "@/lib/supabase";
import { formatarHora, formatarReais, sugerirParada, nomeDoLocal, distanciaM, type Local, type Parada } from "@/lib/geo";
import MarcarNoMapa, { type Modo } from "@/components/MarcarNoMapa";
import { useSessao } from "@/components/Sessao";
import { REGRAS } from "@/lib/config";

type ParadaViagem = { nome: string; lat: number; lng: number };
type Extra = Resultado & {
  so_mulheres?: boolean;
  recorrente?: boolean;
  grupo_nome?: string | null;
  paradas_ok?: (ParadaViagem & { caminhada: number })[]; // paradas do motorista ao alcance, mais perto primeiro
};

export default function PegarCarona() {
  return (
    <Protegido>
      <Busca />
    </Protegido>
  );
}

function Busca() {
  const router = useRouter();
  const { perfil } = useSessao();
  const [soMulheres, setSoMulheres] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [semanal, setSemanal] = useState(false);
  const [origem, setOrigem] = useState<Local | null>(null);
  const [destino, setDestino] = useState<Local | null>(null);
  const [janela, setJanela] = useState(2);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [aberto, setAberto] = useState<Resultado | null>(null);
  const [rota, setRota] = useState<[number, number][] | null>(null);
  const [parada, setParada] = useState<Parada | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [marcando, setMarcando] = useState<Modo | null>(null);
  const [meusGrupos, setMeusGrupos] = useState<{ id: string; nome: string }[]>([]);
  const [filtroGrupo, setFiltroGrupo] = useState("");

  useEffect(() => {
    supabase.from("grupos").select("id,nome").order("nome").then(({ data }) => setMeusGrupos(data ?? []));
  }, []);

  async function tocarMapa(lat: number, lng: number) {
    if (!marcando) return;
    const qual = marcando;
    setMarcando(null);
    const local = { nome: await nomeDoLocal(lat, lng), lat, lng };
    if (qual === "origem") setOrigem(local);
    else setDestino(local);
  }

  async function buscar() {
    if (!origem || !destino) return;
    setOcupado(true);
    setErro("");
    setAberto(null);
    const { data, error } = await supabase.rpc("buscar_viagens", {
      origem_lng: origem.lng,
      origem_lat: origem.lat,
      destino_lng: destino.lng,
      destino_lat: destino.lat,
      a_partir: new Date().toISOString(),
      ate: new Date(Date.now() + janela * 3600000).toISOString(),
      raio_m: REGRAS.raioCaminhadaM,
    });
    if (error) {
      setOcupado(false);
      return setErro(mensagemErro(error));
    }
    let lista = (data as Resultado[]) ?? [];
    if (lista.length) {
      // genero das motoristas e viagens so para mulheres
      const [{ data: ps }, { data: vs }] = await Promise.all([
        supabase.from("perfis").select("id,genero").in("id", [...new Set(lista.map((r) => r.motorista_id))]),
        supabase.from("viagens").select("id,so_mulheres,serie_id,grupo_id,paradas").in("id", lista.map((r) => r.viagem_id)),
      ]);
      const genero = Object.fromEntries((ps ?? []).map((p) => [p.id, p.genero]));
      const soElas = new Set((vs ?? []).filter((v) => v.so_mulheres).map((v) => v.id));
      const recorrentes = new Set((vs ?? []).filter((v) => v.serie_id).map((v) => v.id));
      const souMulher = perfil?.genero === "feminino";
      const infoViagem = Object.fromEntries((vs ?? []).map((v) => [v.id, v]));
      const nomeGrupo = Object.fromEntries(meusGrupos.map((g) => [g.id, g.nome]));
      lista = lista
        // caronas de grupo: so para membros; filtro opcional por um grupo
        .filter((r) => !infoViagem[r.viagem_id]?.grupo_id || nomeGrupo[infoViagem[r.viagem_id].grupo_id])
        .filter((r) => !filtroGrupo || infoViagem[r.viagem_id]?.grupo_id === filtroGrupo)
        // paradas do motorista: precisa haver uma ao alcance a pe
        .map((r) => {
          const ps = (infoViagem[r.viagem_id]?.paradas as ParadaViagem[] | null) ?? null;
          if (!ps?.length) return r;
          const ok = ps
            .map((p) => ({ ...p, caminhada: Math.round(distanciaM(p, origem)) }))
            .filter((p) => p.caminhada <= REGRAS.raioCaminhadaM)
            .sort((a, b) => a.caminhada - b.caminhada);
          return { ...r, paradas_ok: ok, caminhada_embarque_m: ok[0]?.caminhada ?? Infinity } as Extra;
        })
        .filter((r) => (r as Extra).paradas_ok === undefined || (r as Extra).paradas_ok!.length > 0)
        .map((r) => ({ ...r, grupo_nome: nomeGrupo[infoViagem[r.viagem_id]?.grupo_id] ?? null }))
        .filter((r) => souMulher || !soElas.has(r.viagem_id))
        .filter((r) => !soMulheres || genero[r.motorista_id] === "feminino")
        .map((r) => ({ ...r, so_mulheres: soElas.has(r.viagem_id), recorrente: recorrentes.has(r.viagem_id) }));
    }
    setOcupado(false);
    setResultados(lista);
  }

  async function abrir(r: Resultado) {
    setAberto(r);
    setRota(null);
    setParada(null);
    const { data } = await supabase.from("viagens_detalhe").select("rota_geojson").eq("id", r.viagem_id).single();
    const coords = (data as Pick<ViagemDetalhe, "rota_geojson"> | null)?.rota_geojson.coordinates ?? null;
    setRota(coords);
    const ps = (r as Extra).paradas_ok;
    if (ps?.length) {
      setParada(ps[0]);
      return;
    }
    if (coords && origem) {
      setParada(await sugerirParada({ lat: r.embarque_lat, lng: r.embarque_lng }, origem, coords, REGRAS.raioCaminhadaM));
    }
  }

  async function reservar(r: Resultado) {
    if (!origem || !destino) return;
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc(semanal && (r as Extra).recorrente ? "reservar_serie" : "reservar", {
      p_viagem_id: r.viagem_id,
      origem_lng: origem.lng,
      origem_lat: origem.lat,
      destino_lng: destino.lng,
      destino_lat: destino.lat,
      p_embarque_lng: parada?.lng ?? null,
      p_embarque_lat: parada?.lat ?? null,
      p_embarque_nome: parada?.nome ?? null,
    });
    if (error) {
      setOcupado(false);
      return setErro(mensagemErro(error));
    }
    // guarda de onde voce sai e para onde vai, para mostrar o caminho a pe em Minhas caronas
    await supabase.rpc("guardar_trajeto", {
      p_viagem: r.viagem_id, origem_lng: origem.lng, origem_lat: origem.lat, destino_lng: destino.lng, destino_lat: destino.lat,
    });
    setOcupado(false);
    setEnviado(true);
    setTimeout(() => router.push("/minhas-caronas"), 1800);
  }

  const embarque = aberto ? (parada ?? { lat: aberto.embarque_lat, lng: aberto.embarque_lng, nome: "Ponto na via" }) : null;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Pegar carona</h1>
      <div className="cartao space-y-3">
        <BuscaLocal rotulo="Estou em" valor={origem} permitirLocalizacao onEscolher={setOrigem} />
        <BuscaLocal rotulo="Quero ir para" valor={destino} onEscolher={setDestino} />
        <MarcarNoMapa marcando={marcando} onMudar={setMarcando} rotulos={{ origem: "Onde estou", destino: "Destino" }} />
        {(marcando || (!resultados && (origem || destino))) && (
          <Mapa
            altura={240}
            onClique={tocarMapa}
            marcadores={[
              ...(origem ? [{ ...origem, cor: "#64748b", rotulo: "Você" }] : []),
              ...(destino ? [{ ...destino, cor: "#b91c1c", rotulo: "Destino" }] : []),
            ]}
          />
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Saindo nas próximas</label>
          <select className="campo" value={janela} onChange={(e) => setJanela(Number(e.target.value))}>
            <option value={1}>1 hora</option>
            <option value={2}>2 horas</option>
            <option value={6}>6 horas</option>
            <option value={12}>12 horas</option>
          </select>
        </div>
        {meusGrupos.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium">Mostrar caronas</label>
            <select className="campo" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}>
              <option value="">De todos</option>
              {meusGrupos.map((g) => (
                <option key={g.id} value={g.id}>Só do grupo {g.nome}</option>
              ))}
            </select>
          </div>
        )}
        {perfil?.genero === "feminino" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={soMulheres} onChange={(e) => setSoMulheres(e.target.checked)} />
            Só motoristas mulheres
          </label>
        )}
        <button className="botao w-full" disabled={!origem || !destino || ocupado} onClick={buscar}>
          {ocupado ? "Buscando…" : "Buscar caronas"}
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {resultados && resultados.length === 0 && (
        <div className="cartao text-center text-slate-600">
          Nenhuma rota passa a até {REGRAS.raioCaminhadaM} m de você nesse horário. Tente um período maior.
        </div>
      )}

      {resultados?.map((r) => (
        <article key={r.viagem_id} className={`cartao space-y-2 ${aberto?.viagem_id === r.viagem_id ? "border-teal-600" : ""}`}>
          <button className="block w-full text-left" onClick={() => abrir(r)}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold">Embarque às {formatarHora(r.embarque_previsto)}</p>
                <p className="text-sm text-slate-600">
                  🚶 {r.caminhada_embarque_m} m até a rota · desce a {r.caminhada_desembarque_m} m do destino
                </p>
              </div>
              <p className="font-semibold text-teal-700">{formatarReais(r.tarifa)}</p>
            </div>
            <p className="mt-1 text-sm">
              {r.motorista_nome.split(" ")[0]} <Nota nota={r.motorista_nota} total={r.motorista_total_avaliacoes} /> · {r.carro} ·{" "}
              {r.vagas_livres} {r.vagas_livres === 1 ? "lugar" : "lugares"}
            </p>
            <p className="text-xs text-slate-500">Rota: {r.origem_nome} → {r.destino_nome}</p>
            {aberto?.viagem_id !== r.viagem_id && (
              <p className="mt-1 text-sm font-medium text-teal-700">Ver onde embarcar e descer ›</p>
            )}
            {(r as Extra).grupo_nome && (
              <span className="mr-1 mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800">👥 {(r as Extra).grupo_nome}</span>
            )}
            {(r as Extra).paradas_ok && (
              <span className="mr-1 mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">🚏 Paradas do motorista</span>
            )}
            {(r as Extra).recorrente && (
              <span className="mr-1 mt-1 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">🔁 Repete toda semana</span>
            )}
            {(r as Extra).so_mulheres && (
              <span className="mt-1 inline-block rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-800">Só mulheres</span>
            )}
          </button>

          {aberto?.viagem_id === r.viagem_id && embarque && (
            <div className="space-y-3 pt-2">
              <PlanoViagem
                rota={rota}
                origem={origem}
                destino={destino}
                embarque={embarque}
                embarqueNome={parada?.nome}
                desembarque={{ lat: r.desembarque_lat, lng: r.desembarque_lng }}
              />
              <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                Esteja no ponto às <strong>{formatarHora(new Date(new Date(r.embarque_previsto).getTime() - REGRAS.folgaChegadaMin * 60000).toISOString())}</strong>.
                O motorista passa por volta das {formatarHora(r.embarque_previsto)} e espera no máximo {REGRAS.toleranciaEsperaMin} min.
              </p>
              {((r as Extra).paradas_ok?.length ?? 0) > 1 && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Escolha onde embarcar:</p>
                  {(r as Extra).paradas_ok!.map((p) => (
                    <label key={`${p.lat},${p.lng}`} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`parada-${r.viagem_id}`}
                        className="accent-teal-700"
                        checked={parada?.lat === p.lat && parada?.lng === p.lng}
                        onChange={() => setParada(p)}
                      />
                      🚏 {p.nome} <span className="text-xs text-slate-500">({p.caminhada} m a pé)</span>
                    </label>
                  ))}
                </div>
              )}
              {(r as Extra).recorrente && !enviado && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={semanal} onChange={(e) => setSemanal(e.target.checked)} />
                  Reservar toda semana (todas as próximas viagens deste motorista)
                </label>
              )}
              {enviado ? (
                <p className="rounded-lg bg-teal-50 p-3 text-center text-sm text-teal-800">Pedido enviado! Você será avisado quando o motorista aceitar.</p>
              ) : (
                <button className="botao w-full py-3" disabled={ocupado} onClick={() => reservar(r)}>
                  Pedir carona por {formatarReais(r.tarifa)}
                </button>
              )}
              <p className="text-center text-xs text-slate-500">O motorista confirma o pedido. O pagamento é por Pix direto a ele.</p>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
