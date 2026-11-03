"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Protegido from "@/components/Protegido";
import Mapa from "@/components/Mapa";
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
                        <p className="font-medium">{i + 1}. {r.passageiro?.nome}</p>
                        <Nota nota={r.passageiro?.nota_media ?? null} total={r.passageiro?.total_avaliacoes ?? 0} />
                        <p className="text-slate-600">
                          Embarque às {formatarHora(r.embarque_previsto)}
                          {r.embarque_nome ? ` · ${r.embarque_nome}` : ""} ·{" "}
                          <a className="text-teal-700 underline" href={linkMapa(r.embarque_lat, r.embarque_lng)} target="_blank">ver ponto</a>
                        </p>
                      </div>
                      {r.passageiro?.telefone && (
                        <a href={`https://wa.me/55${r.passageiro.telefone.replace(/\D/g, "")}`} target="_blank" className="botao-secundario">WhatsApp</a>
                      )}
                    </div>
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
