"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Protegido from "@/components/Protegido";
import BuscaLocal from "@/components/BuscaLocal";
import Mapa from "@/components/Mapa";
import { Nota } from "@/components/Estrelas";
import { supabase, mensagemErro, type Resultado, type ViagemDetalhe } from "@/lib/supabase";
import { formatarHora, formatarReais, sugerirParada, nomeDoLocal, type Local, type Parada } from "@/lib/geo";
import MarcarNoMapa from "@/components/MarcarNoMapa";
import { useSessao } from "@/components/Sessao";
import { REGRAS } from "@/lib/config";

type Extra = Resultado & { so_mulheres?: boolean; recorrente?: boolean };

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
  const [marcando, setMarcando] = useState<"origem" | "destino" | null>(null);

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
        supabase.from("viagens").select("id,so_mulheres,serie_id").in("id", lista.map((r) => r.viagem_id)),
      ]);
      const genero = Object.fromEntries((ps ?? []).map((p) => [p.id, p.genero]));
      const soElas = new Set((vs ?? []).filter((v) => v.so_mulheres).map((v) => v.id));
      const recorrentes = new Set((vs ?? []).filter((v) => v.serie_id).map((v) => v.id));
      const souMulher = perfil?.genero === "feminino";
      lista = lista
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
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
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
            {(r as Extra).recorrente && (
              <span className="mr-1 mt-1 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">🔁 Repete toda semana</span>
            )}
            {(r as Extra).so_mulheres && (
              <span className="mt-1 inline-block rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-800">Só mulheres</span>
            )}
          </button>

          {aberto?.viagem_id === r.viagem_id && embarque && (
            <div className="space-y-3 pt-2">
              <Mapa
                altura={260}
                rotas={rota ? [{ coordenadas: rota }] : []}
                marcadores={[
                  ...(origem ? [{ ...origem, cor: "#64748b", rotulo: "Você" }] : []),
                  { ...embarque, cor: "#2563eb", rotulo: parada ? "🚏 Embarque" : "Embarque" },
                  { lat: r.desembarque_lat, lng: r.desembarque_lng, cor: "#b91c1c", rotulo: "Desce" },
                ]}
              />
              <p className="text-sm">
                {parada ? <>Espere na <strong>{parada.nome}</strong>, que fica na rota do motorista.</> : <>Espere na rua marcada no mapa, que fica na rota do motorista.</>}{" "}
                Chegue {REGRAS.folgaChegadaMin} min antes: o motorista espera no máximo {REGRAS.toleranciaEsperaMin} min.
              </p>
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
