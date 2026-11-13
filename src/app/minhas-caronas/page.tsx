"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Protegido from "@/components/Protegido";
import PlanoViagem from "@/components/PlanoViagem";
import AtivarAvisos from "@/components/AtivarAvisos";
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
  const [mapaEscolhido, setMapaEscolhido] = useState<string | null>(null); // so um mapa por vez
  const [posicoes, setPosicoes] = useState<Record<string, { lat: number; lng: number; atualizado_em: string }>>({});

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
    // onde o carro esta agora (so durante a viagem)
    const andamento = (vs ?? []).filter((v) => v.status === "em_andamento").map((v) => v.id);
    if (andamento.length) {
      const { data: ps } = await supabase.from("posicao_viagem").select("*").in("viagem_id", andamento);
      setPosicoes(Object.fromEntries((ps ?? []).map((p) => [p.viagem_id, p])));
    }
  }, [perfil]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel("viagens-passageiro")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "viagens" }, () => carregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "posicao_viagem" }, (e) => {
        const p = e.new as { viagem_id: string; lat: number; lng: number; atualizado_em: string };
        if (p?.viagem_id) setPosicoes((atual) => ({ ...atual, [p.viagem_id]: p }));
      })
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

  async function cancelarSemanal(recorrenteId: string) {
    if (!confirm("Cancelar todas as próximas semanas desta carona?")) return;
    const { error } = await supabase.rpc("cancelar_recorrencia", { p_recorrente: recorrenteId });
    if (error) return setErro(mensagemErro(error));
    carregar();
  }

  async function compartilhar(i: Item) {
    const texto =
      `Estou indo de carona pelo Cadê a carona.\n` +
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
    if (i.aprovacao === "recusada") return { texto: "Recusada", cor: "bg-red-100 text-red-700" };
    if (i.status === "cancelada") return { texto: "Cancelada", cor: "bg-slate-100 text-slate-600" };
    if (i.viagem.status === "em_andamento") return { texto: "Em andamento", cor: "bg-blue-100 text-blue-800" };
    if (i.status === "concluida") return { texto: "Concluída", cor: "bg-[var(--mar-claro)] text-[var(--mar)]" };
    if (i.aprovacao === "pendente") return { texto: "Aguardando o motorista", cor: "bg-slate-100 text-slate-700" };
    return { texto: "Confirmada", cor: "bg-amber-100 text-amber-800" };
  };

  // mapa aberto: o que voce escolheu; senao a viagem em andamento; senao a proxima carona
  const comMapa = itens.filter((i) => i.status === "confirmada" && i.aprovacao !== "recusada");
  const proxima =
    comMapa.find((i) => i.viagem.status === "em_andamento") ??
    [...comMapa].reverse().find((i) => new Date(i.embarque_previsto).getTime() > Date.now() - 3600000);
  const mapaAberto = mapaEscolhido ?? proxima?.id ?? null;

  return (
    <div className="space-y-4 p-4">
      <h1 className="titulo-pagina">Minhas caronas</h1>
      <AtivarAvisos motivo="quando o motorista aceitar, mandar mensagem e sair para buscar você" />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {carregando && <p className="text-slate-500">Carregando…</p>}
      {!carregando && itens.length === 0 && (
        <div className="cartao text-center text-slate-600">
          Nenhuma carona reservada. <Link href="/carona" className="text-[var(--mar)] underline">Buscar carona</Link>
        </div>
      )}
      {itens.map((i) => {
        const s = status(i);
        const ativa = i.status === "confirmada" && i.aprovacao === "aceita";
        const pendente = i.status === "confirmada" && i.aprovacao === "pendente";
        return (
          <article key={i.id} className="cartao space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">{formatarData(i.embarque_previsto)}</p>
                <p className="text-lg font-semibold">Embarque às {formatarHora(i.embarque_previsto)}</p>
                <p className="text-sm text-slate-600">{i.embarque_nome ?? "Ponto na rota do motorista"}</p>
                {i.recorrente_id && <p className="text-xs text-[var(--mar)]">🔁 Reserva semanal</p>}
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
              {(ativa || pendente) && (
                <Link href={`/chat/${i.id}`} className="botao-secundario">💬 Chat</Link>
              )}
            </div>

            {(ativa || pendente) && mapaAberto !== i.id && (
              <button className="botao-secundario w-full" onClick={() => setMapaEscolhido(i.id)}>
                🗺️ Ver no mapa onde embarcar e descer
              </button>
            )}
            {(ativa || pendente) && mapaAberto === i.id && (
              <PlanoViagem
                altura={240}
                rota={i.viagem.rota_geojson.coordinates}
                origem={i.origem_lat != null && i.origem_lng != null ? { lat: i.origem_lat, lng: i.origem_lng } : null}
                destino={i.destino_lat != null && i.destino_lng != null ? { lat: i.destino_lat, lng: i.destino_lng } : null}
                embarque={{ lat: i.embarque_lat, lng: i.embarque_lng }}
                embarqueNome={i.embarque_nome}
                desembarque={{ lat: i.desembarque_lat, lng: i.desembarque_lng }}
                carro={i.viagem.status === "em_andamento" ? posicoes[i.viagem_id] : null}
                emViagem={i.viagem.status === "em_andamento"}
              />
            )}

            {ativa && (
              <>
                {i.viagem.status === "em_andamento" && !posicoes[i.viagem_id] && (
                  <p className="text-sm text-slate-600">A viagem começou. A posição do carro aparece quando o motorista compartilhar a localização.</p>
                )}
                {i.viagem.status === "aberta" && (
                  <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                    Esteja no ponto às <strong>{formatarHora(new Date(new Date(i.embarque_previsto).getTime() - REGRAS.folgaChegadaMin * 60000).toISOString())}</strong>.
                    O motorista espera no máximo {REGRAS.toleranciaEsperaMin} min.
                  </p>
                )}
                {i.motorista.chave_pix && (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--mar-claro)] bg-[var(--mar-claro)] p-3 text-sm">
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
                    <button className="botao-secundario" onClick={() => cancelar(i.id)}>{i.recorrente_id ? "Cancelar só este dia" : "Cancelar"}</button>
                  )}
                  {i.recorrente_id && (
                    <button className="botao-secundario" onClick={() => cancelarSemanal(i.recorrente_id!)}>Cancelar todas as semanas</button>
                  )}
                </div>
              </>
            )}

            {pendente && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-slate-600">Pedido enviado. Você será avisado quando o motorista responder.</p>
                <button className="botao-secundario" onClick={() => cancelar(i.id)}>Cancelar</button>
              </div>
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
