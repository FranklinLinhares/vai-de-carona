"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Protegido from "@/components/Protegido";
import { useSessao } from "@/components/Sessao";
import { supabase, mensagemErro, COLUNAS_PUBLICAS_PERFIL, type Perfil } from "@/lib/supabase";
import { formatarHora } from "@/lib/geo";

type Mensagem = { id: string; reserva_id: string; autor_id: string; texto: string; criado_em: string };

export default function PaginaChat() {
  return (
    <Protegido>
      <Chat />
    </Protegido>
  );
}

function Chat() {
  const { id } = useParams<{ id: string }>();
  const { perfil } = useSessao();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [outro, setOutro] = useState<Perfil | null>(null);
  const [souMotorista, setSouMotorista] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("mensagens").select("*").eq("reserva_id", id).order("criado_em");
    if (error) return setErro(mensagemErro(error));
    setMensagens((data as Mensagem[]) ?? []);
  }, [id]);

  useEffect(() => {
    if (!perfil) return;
    (async () => {
      const { data: r } = await supabase.from("reservas").select("passageiro_id, viagem_id").eq("id", id).maybeSingle();
      if (!r) return setErro("Conversa não encontrada");
      const { data: v } = await supabase.from("viagens").select("motorista_id").eq("id", r.viagem_id).single();
      const motorista = v?.motorista_id === perfil.id;
      setSouMotorista(motorista);
      const outroId = motorista ? r.passageiro_id : v?.motorista_id;
      const { data: p } = await supabase.from("perfis").select(COLUNAS_PUBLICAS_PERFIL).eq("id", outroId).single();
      setOutro((p as unknown as Perfil) ?? null);
    })();
    carregar();
    const canal = supabase
      .channel(`chat-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens", filter: `reserva_id=eq.${id}` }, (e) =>
        setMensagens((m) => (m.some((x) => x.id === e.new.id) ? m : [...m, e.new as Mensagem])),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id, perfil, carregar]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !perfil) return;
    setTexto("");
    const { data, error } = await supabase.from("mensagens").insert({ reserva_id: id, autor_id: perfil.id, texto: t }).select().single();
    if (error) {
      setTexto(t);
      return setErro(mensagemErro(error));
    }
    setMensagens((m) => (m.some((x) => x.id === data.id) ? m : [...m, data as Mensagem]));
  }

  const rapidas = souMotorista
    ? ["Estou chegando", "Cheguei no ponto", "Vou atrasar 2 min"]
    : ["Já estou no ponto", "Estou chegando", "Qual a cor do carro?"];

  return (
    <div className="-mt-12 flex h-[calc(100vh-5rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white p-3 pr-16">
        <Link href={souMotorista ? "/motorista" : "/minhas-caronas"} className="text-xl" aria-label="Voltar">←</Link>
        {outro?.foto_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={outro.foto_url} alt="" className="h-9 w-9 rounded-full object-cover" />
        )}
        <div>
          <p className="font-semibold">{outro?.nome ?? "Conversa"}</p>
          <p className="text-xs text-slate-500">{souMotorista ? "Passageiro" : "Motorista"}</p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {mensagens.length === 0 && <p className="mt-6 text-center text-sm text-slate-500">Combine os detalhes do embarque por aqui.</p>}
        {mensagens.map((m) => {
          const minha = m.autor_id === perfil?.id;
          return (
            <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${minha ? "bg-[var(--mar)] text-white" : "bg-white text-slate-800 shadow-sm"}`}>
                <p className="whitespace-pre-wrap">{m.texto}</p>
                <p className={`mt-0.5 text-right text-[10px] ${minha ? "text-white/70" : "text-slate-400"}`}>{formatarHora(m.criado_em)}</p>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>

      {erro && <p className="px-3 text-sm text-red-600">{erro}</p>}
      <div className="flex gap-2 overflow-x-auto px-3 pb-2">
        {rapidas.map((r) => (
          <button key={r} type="button" className="botao-secundario whitespace-nowrap py-1 text-xs" onClick={() => setTexto(r)}>{r}</button>
        ))}
      </div>
      <form onSubmit={enviar} className="flex gap-2 border-t border-slate-200 bg-white p-3">
        <input className="campo flex-1" placeholder="Escreva uma mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} />
        <button className="botao" disabled={!texto.trim()}>Enviar</button>
      </form>
    </div>
  );
}
