import { supabase } from "./supabase";

const CHAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type EstadoAvisos = "ativo" | "pode_ativar" | "bloqueado" | "instalar_iphone" | "indisponivel";

function base64ParaBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function ehIphoneNoNavegador() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  return ios && !instalado;
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (typeof window === "undefined") return "indisponivel";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !CHAVE)
    return ehIphoneNoNavegador() ? "instalar_iphone" : "indisponivel";
  if (Notification.permission === "denied") return "bloqueado";
  if (Notification.permission !== "granted") return "pode_ativar";
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? "ativo" : "pode_ativar";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function guardar(sub: PushSubscription, _usuarioId: string) {
  const j = sub.toJSON();
  await supabase.rpc("registrar_aparelho", { p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh ?? "", p_auth: j.keys?.auth ?? "" });
}

/** Pede permissao e registra este aparelho para receber avisos com o app fechado. */
export async function ativarAvisos(usuarioId: string): Promise<EstadoAvisos> {
  const estado = await estadoAvisos();
  if (estado === "indisponivel" || estado === "instalar_iphone" || estado === "bloqueado") return estado;
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "pode_ativar";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(CHAVE) }));
  await guardar(sub, usuarioId);
  return "ativo";
}

/** Se ja tinha permissao, garante que este aparelho continua registrado (ex.: depois de trocar de conta). */
export async function renovarAvisos(usuarioId: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !CHAVE) return;
  if (Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(CHAVE) }));
  await guardar(sub, usuarioId);
}
