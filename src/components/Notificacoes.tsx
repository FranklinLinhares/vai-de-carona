"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "./Sessao";
import { supabase } from "@/lib/supabase";
import Icone from "./Icone";
import { ativarAvisos, renovarAvisos } from "@/lib/push";

type Notificacao = { id: string; titulo: string; texto: string; link: string | null; lida: boolean; criado_em: string };

/** Sino com avisos do app. Mostra tambem notificacao do sistema quando o usuario permite. */
export default function Notificacoes() {
  const { perfil } = useSessao();
  const router = useRouter();
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [permissao, setPermissao] = useState<NotificationPermission | "indisponivel">("default");

  const carregar = useCallback(async () => {
    if (!perfil) return;
    const { data } = await supabase.from("notificacoes").select("*").order("criado_em", { ascending: false }).limit(20);
    setLista((data as Notificacao[]) ?? []);
  }, [perfil]);

  // fecha ao tocar fora do quadro ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  useEffect(() => {
    setPermissao(typeof Notification === "undefined" ? "indisponivel" : Notification.permission);
  }, []);

  // aparelho ja autorizado: mantem registrado para avisos com o app fechado
  useEffect(() => {
    if (perfil) renovarAvisos(perfil.id).catch(() => {});
  }, [perfil]);

  useEffect(() => {
    if (!perfil) return;
    carregar();
    const canal = supabase
      .channel("notificacoes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${perfil.id}` }, (e) => {
        const n = e.new as Notificacao;
        setLista((l) => [n, ...l]);
        const temPush = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
        if (!temPush && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const sistema = new Notification(n.titulo, { body: n.texto, icon: "/icone-192.png", tag: n.id });
            sistema.onclick = () => {
              window.focus();
              if (n.link) router.push(n.link);
            };
          } catch {
            /* alguns celulares so permitem pelo service worker */
          }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [perfil, carregar, router]);

  if (!perfil) return null;
  const naoLidas = lista.filter((n) => !n.lida).length;

  async function abrir(n: Notificacao) {
    setAberto(false);
    if (!n.lida) {
      setLista((l) => l.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      await supabase.from("notificacoes").update({ lida: true }).eq("id", n.id);
    }
    if (n.link) router.push(n.link);
  }

  async function marcarTodas() {
    setLista((l) => l.map((x) => ({ ...x, lida: true })));
    await supabase.from("notificacoes").update({ lida: true }).eq("usuario_id", perfil!.id).eq("lida", false);
  }

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => setAberto(!aberto)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--tinta)] hover:bg-slate-100"
        aria-label="Avisos"
      >
        <Icone nome="sino" />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white">{naoLidas}</span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 p-3">
            <p className="font-semibold">Avisos</p>
            {naoLidas > 0 && <button className="text-xs text-[var(--mar)]" onClick={marcarTodas}>Marcar todos como lidos</button>}
          </div>
          {permissao === "default" && (
            <button
              className="block w-full bg-[var(--mar-claro)] p-3 text-left text-sm text-[var(--mar)]"
              onClick={async () => {
                await ativarAvisos(perfil.id).catch(() => {});
                setPermissao(Notification.permission);
              }}
            >
              Ativar avisos no celular
            </button>
          )}
          <ul className="max-h-96 overflow-y-auto">
            {lista.length === 0 && <li className="p-4 text-center text-sm text-slate-500">Nenhum aviso por enquanto.</li>}
            {lista.map((n) => (
              <li key={n.id}>
                <button onClick={() => abrir(n)} className={`block w-full border-b border-slate-50 p-3 text-left ${n.lida ? "" : "bg-amber-50"}`}>
                  <p className="text-sm font-medium">{n.titulo}</p>
                  <p className="text-xs text-slate-600">{n.texto}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{new Date(n.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
