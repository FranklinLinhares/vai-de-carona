"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Protegido from "@/components/Protegido";
import Mapa from "@/components/Mapa";
import CompartilharPosicao from "@/components/CompartilharPosicao";
import { Avaliar, Nota } from "@/components/Estrelas";
import { useSessao } from "@/components/Sessao";
import { supabase, mensagemErro, COLUNAS_PUBLICAS_PERFIL, type ViagemDetalhe, type ReservaDetalhe, type Perfil } from "@/lib/supabase";
import { formatarData, formatarHora, formatarReais, linkMapa } from "@/lib/geo";

type ReservaComPassageiro = ReservaDetalhe & { passageiro?: Perfil };

const rotuloStatus: Record<ViagemDetalhe["status"], string> = {
  aberta: "Aguardando saída",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export default function MinhasViagens() {
  return (
    <Protegido motorista>
      <Lista />
    </Protegido>
  );
}

function Lista() {
  const { perfil } = useSessao();
  const [viagens, setViagens] = useState<ViagemDetalhe[]>([]);
  const [reservas, setReservas] = useState<Record<string, ReservaComPassageiro[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [series, setSeries] = useState<{ id: string; dias: number[]; hora: string; origem_nome: string; destino_nome: string }[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!perfil) return;
    const { data: vs, error } = await supabase
      .from("viagens_detalhe")
      .select("*")
      .eq("motorista_id", perfil.id)
      .gte("partida_em", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("partida_em", { ascending: false });
    if (error) return setErro(mensagemErro(error));
    setViagens((vs as ViagemDetalhe[]) ?? []);
    const { data: ss } = await supabase.from("series_viagem").select("id,dias,hora,origem_nome,destino_nome").eq("ativa", true);
    setSeries(ss ?? []);
    const ids = (vs ?? []).map((v) => v.id);
    if (ids.length) {
      const { data: rs } = await supabase.from("reservas_detalhe").select("*").in("viagem_id", ids).neq("status", "cancelada");
      const pids = [...new Set((rs ?? []).map((r) => r.passageiro_id))];
      const { data: ps } = pids.length ? await supabase.from("perfis").select(COLUNAS_PUBLICAS_PERFIL).in("id", pids) : { data: [] };
      const porId = Object.fromEntries((ps ?? []).map((p) => [p.id, p as Perfil]));
      const agrupado: Record<string, ReservaComPassageiro[]> = {};
      (rs ?? []).forEach((r) => {
        (agrupado[r.viagem_id] ??= []).push({ ...(r as ReservaDetalhe), passageiro: porId[r.passageiro_id] });
      });
      Object.values(agrupado).forEach((l) => l.sort((a, b) => a.embarque_previsto.localeCompare(b.embarque_previsto)));
      setReservas(agrupado);
    }
    setCarregando(false);
  }, [perfil]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel("reservas-motorista")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  async function responder(id: string, aceitar: boolean) {
    const { error } = await supabase.rpc("responder_reserva", { p_reserva_id: id, p_aceitar: aceitar });
    if (error) return setErro(mensagemErro(error));
    carregar();
  }

  async function encerrarSerie(id: string) {
    if (!confirm("Encerrar esta carona recorrente? As próximas viagens serão canceladas e os passageiros avisados.")) return;
    const { error } = await supabase.rpc("encerrar_serie", { p_serie: id });
    if (error) return setErro(mensagemErro(error));
    carregar();
  }

  async function mudarStatus(id: string, status: ViagemDetalhe["status"]) {
    if (status === "cancelada" && !confirm("Cancelar esta viagem? Os passageiros serão avisados.")) return;
    const { error } = await supabase.from("viagens").update({ status }).eq("id", id);
    if (error) return setErro(mensagemErro(error));
    carregar();
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minhas viagens</h1>
        <Link href="/motorista/nova" className="botao text-sm">+ Nova viagem</Link>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {series.length > 0 && (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">🔁 Caronas recorrentes</h2>
          {series.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
              <div>
                <p className="font-medium">
                  {s.dias.map((d) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]).join(", ")} às {s.hora.slice(0, 5)}
                </p>
                <p className="text-xs text-slate-600">{s.origem_nome} → {s.destino_nome}</p>
              </div>
              <button className="botao-secundario text-xs" onClick={() => encerrarSerie(s.id)}>Encerrar</button>
            </div>
          ))}
        </section>
      )}
      {carregando && <p className="text-slate-500">Carregando…</p>}
      {!carregando && viagens.length === 0 && (
        <div className="cartao text-center text-slate-600">Você ainda não publicou viagens.</div>
      )}
      {viagens.map((v) => {
        const rs = reservas[v.id] ?? [];
        return (
          <article key={v.id} className="cartao space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase text-slate-500">{formatarData(v.partida_em)} · saída {formatarHora(v.partida_em)}</p>
                <p className="font-semibold">{v.origem_nome}</p>
                <p className="text-sm text-slate-600">→ {v.destino_nome}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{rotuloStatus[v.status]}</span>
            </div>
            <Mapa
              altura={200}
              rotas={[{ coordenadas: v.rota_geojson.coordinates }]}
              marcadores={rs.map((r, i) => ({ lat: r.embarque_lat, lng: r.embarque_lng, cor: "#2563eb", rotulo: `${i + 1}. ${r.passageiro?.nome.split(" ")[0] ?? ""} ${formatarHora(r.embarque_previsto)}` }))}
            />
            <p className="text-sm">
              {rs.length} de {v.vagas} lugares reservados · {formatarReais(v.tarifa)} por pessoa
              {v.serie_id && <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">🔁 Recorrente</span>}
              {v.so_mulheres && <span className="ml-2 rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-800">Só mulheres</span>}
            </p>
            {rs.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {rs.map((r, i) => (
                  <li key={r.id} className="space-y-2 p-3 text-sm">
                    <div className="flex items-center gap-3">
                      {r.passageiro?.foto_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.passageiro.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">
                          {i + 1}. {r.passageiro?.nome}
                          {r.recorrente_id && <span className="ml-1 text-xs text-teal-700">🔁 toda semana</span>}
                        </p>
                        <Nota nota={r.passageiro?.nota_media ?? null} total={r.passageiro?.total_avaliacoes ?? 0} />
                        <p className="text-slate-600">
                          Embarque às {formatarHora(r.embarque_previsto)}
                          {r.embarque_nome ? ` · ${r.embarque_nome}` : ""} ·{" "}
                          <a className="text-teal-700 underline" href={linkMapa(r.embarque_lat, r.embarque_lng)} target="_blank">ver ponto</a>
                        </p>
                      </div>
                      <Link href={`/chat/${r.id}`} className="botao-secundario">💬 Chat</Link>
                    </div>
                    {r.aprovacao === "pendente" && v.status === "aberta" && (
                      <div className="flex gap-2">
                        <button className="botao flex-1 py-1.5 text-sm" onClick={() => responder(r.id, true)}>Aceitar</button>
                        <button className="botao-secundario flex-1" onClick={() => responder(r.id, false)}>Recusar</button>
                      </div>
                    )}
                    {r.aprovacao === "pendente" && <p className="text-xs font-medium text-amber-700">Aguardando sua resposta</p>}
                    {v.status === "concluida" && r.passageiro && (
                      <Avaliar viagemId={v.id} avaliadoId={r.passageiro_id} nome={r.passageiro.nome.split(" ")[0]} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {v.status === "aberta" && (
                <>
                  <button className="botao flex-1" onClick={() => mudarStatus(v.id, "em_andamento")}>Iniciar viagem</button>
                  <button className="botao-secundario" onClick={() => mudarStatus(v.id, "cancelada")}>Cancelar</button>
                </>
              )}
              {v.status === "em_andamento" && (
                <>
                  <CompartilharPosicao viagemId={v.id} />
                  <button className="botao flex-1" onClick={() => mudarStatus(v.id, "concluida")}>Concluir viagem</button>
                  <a href="tel:190" className="botao-perigo">🚨 190</a>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
