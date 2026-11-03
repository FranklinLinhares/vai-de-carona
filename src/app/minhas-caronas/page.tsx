"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Protegido from "@/components/Protegido";
import Mapa from "@/components/Mapa";
import { Avaliar, Nota } from "@/components/Estrelas";
import { useSessao } from "@/components/Sessao";
import { supabase, mensagemErro, COLUNAS_PUBLICAS_PERFIL, type ReservaDetalhe, type ViagemDetalhe, type Perfil } from "@/lib/supabase";
import { formatarData, formatarHora, formatarReais, linkMapa } from "@/lib/geo";
import { REGRAS } from "@/lib/config";

type Item = ReservaDetalhe & { viagem: ViagemDetalhe; motorista: Perfil };

export default function MinhasCaronas() {
  return (
    <Protegido>
      <Lista />
    </Protegido>
  );
}

function Lista() {
  const { perfil } = useSessao();
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    if (!perfil) return;
    const { data: rs, error } = await supabase
      .from("reservas_detalhe")
      .select("*")
      .eq("passageiro_id", perfil.id)
      .gte("embarque_previsto", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("embarque_previsto", { ascending: false });
    if (error) return setErro(mensagemErro(error));
    const vids = [...new Set((rs ?? []).map((r) => r.viagem_id))];
    const { data: vs } = vids.length ? await supabase.from("viagens_detalhe").select("*").in("id", vids) : { data: [] };
    const mids = [...new Set((vs ?? []).map((v) => v.motorista_id))];
    const { data: ms } = mids.length ? await supabase.from("perfis").select(COLUNAS_PUBLICAS_PERFIL).in("id", mids) : { data: [] };
    const vPor = Object.fromEntries((vs ?? []).map((v) => [v.id, v as ViagemDetalhe]));
    const mPor = Object.fromEntries((ms ?? []).map((m) => [m.id, m as Perfil]));
    setItens(
      (rs ?? [])
        .filter((r) => vPor[r.viagem_id])
        .map((r) => ({ ...(r as ReservaDetalhe), viagem: vPor[r.viagem_id], motorista: mPor[vPor[r.viagem_id].motorista_id] })),
    );
    setCarregando(false);
  }, [perfil]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel("viagens-passageiro")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "viagens" }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar]);

  async function cancelar(id: string) {
    if (!confirm("Cancelar sua reserva?")) return;
    const { error } = await supabase.from("reservas").update({ status: "cancelada" }).eq("id", id);
    if (error) return setErro(mensagemErro(error));
    carregar();
  }

  async function compartilhar(i: Item) {
    const texto =
      `Estou indo de carona pelo Vai de carona.\n` +
      `Motorista: ${i.motorista.nome}\nCarro: ${i.motorista.carro_modelo} ${i.motorista.carro_cor}, placa ${i.motorista.carro_placa}\n` +
      `Embarque às ${formatarHora(i.embarque_previsto)}: ${linkMapa(i.embarque_lat, i.embarque_lng)}\n` +
      `Desembarque: ${linkMapa(i.desembarque_lat, i.desembarque_lng)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Minha carona", text: texto });
      } catch {
        /* usuario fechou */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
    }
  }

  async function copiarPix(chave: string) {
    await navigator.clipboard.writeText(chave);
    setCopiado(chave);
    setTimeout(() => setCopiado(""), 2000);
  }

  const status = (i: Item) => {
    if (i.status === "cancelada") return { texto: "Cancelada", cor: "bg-slate-100 text-slate-600" };
    if (i.viagem.status === "em_andamento") return { texto: "Em andamento", cor: "bg-blue-100 text-blue-800" };
    if (i.status === "concluida") return { texto: "Concluída", cor: "bg-teal-100 text-teal-800" };
    return { texto: "Confirmada", cor: "bg-amber-100 text-amber-800" };
  };

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Minhas caronas</h1>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {carregando && <p className="text-slate-500">Carregando…</p>}
      {!carregando && itens.length === 0 && (
        <div className="cartao text-center text-slate-600">
          Nenhuma carona reservada. <Link href="/carona" className="text-teal-700 underline">Buscar carona</Link>
        </div>
      )}
      {itens.map((i) => {
        const s = status(i);
        const ativa = i.status === "confirmada";
        return (
          <article key={i.id} className="cartao space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">{formatarData(i.embarque_previsto)}</p>
                <p className="text-lg font-semibold">Embarque às {formatarHora(i.embarque_previsto)}</p>
                <p className="text-sm text-slate-600">{i.embarque_nome ?? "Ponto na rota do motorista"}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs ${s.cor}`}>{s.texto}</span>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              {i.motorista.foto_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.motorista.foto_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              )}
              <div className="flex-1 text-sm">
                <p className="font-medium">{i.motorista.nome} <Nota nota={i.motorista.nota_media} total={i.motorista.total_avaliacoes} /></p>
                <p>{i.motorista.carro_modelo} {i.motorista.carro_cor} · <strong>{i.motorista.carro_placa}</strong></p>
              </div>
              {ativa && (
                <a href={`https://wa.me/55${i.motorista.telefone.replace(/\D/g, "")}`} target="_blank" className="botao-secundario">WhatsApp</a>
              )}
            </div>

            {ativa && (
              <>
                <Mapa
                  altura={220}
                  rotas={[{ coordenadas: i.viagem.rota_geojson.coordinates }]}
                  marcadores={[
                    { lat: i.embarque_lat, lng: i.embarque_lng, cor: "#2563eb", rotulo: "Embarque" },
                    { lat: i.desembarque_lat, lng: i.desembarque_lng, cor: "#b91c1c", rotulo: "Desce" },
                  ]}
                />
                <p className="text-sm text-slate-600">
                  Chegue {REGRAS.folgaChegadaMin} min antes. O motorista espera até {REGRAS.toleranciaEsperaMin} min.
                </p>
                {i.motorista.chave_pix && (
                  <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
                    <span>
                      Pix de <strong>{formatarReais(i.viagem.tarifa)}</strong>: {i.motorista.chave_pix}
                    </span>
                    <button className="botao-secundario" onClick={() => copiarPix(i.motorista.chave_pix!)}>
                      {copiado === i.motorista.chave_pix ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="botao-secundario flex-1" onClick={() => compartilhar(i)}>📤 Compartilhar viagem</button>
                  <a href={`tel:${REGRAS.emergencia}`} className="botao-perigo">🚨 {REGRAS.emergencia}</a>
                  {i.viagem.status === "aberta" && (
                    <button className="botao-secundario" onClick={() => cancelar(i.id)}>Cancelar</button>
                  )}
                </div>
              </>
            )}

            {i.status === "concluida" && (
              <Avaliar viagemId={i.viagem_id} avaliadoId={i.motorista.id} nome={i.motorista.nome.split(" ")[0]} />
            )}
          </article>
        );
      })}
    </div>
  );
}
