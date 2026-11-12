import webpush from "web-push";

// O banco chama esta rota com o id de um aviso novo. Ela busca os aparelhos (uma vez so) e envia o push.
export const dynamic = "force-dynamic";

type Dados = {
  titulo: string;
  texto: string;
  link: string | null;
  tag: string;
  inscricoes: { endpoint: string; keys: { p256dh: string; auth: string } }[];
};

async function rpc(nome: string, corpo: unknown) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });
}

export async function POST(req: Request) {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return Response.json({ ok: false, erro: "VAPID não configurado" }, { status: 500 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false }, { status: 400 });

  const r = await rpc("dados_push", { p_id: id });
  const dados = (await r.json().catch(() => null)) as Dados | null;
  if (!r.ok || !dados) return Response.json({ ok: true, enviados: 0 });

  webpush.setVapidDetails("https://vai-de-carona.vercel.app", publica, privada);
  const carga = JSON.stringify({ titulo: dados.titulo, texto: dados.texto, link: dados.link, tag: dados.tag });
  const mortos: string[] = [];
  let enviados = 0;
  await Promise.all(
    dados.inscricoes.map(async (s) => {
      try {
        await webpush.sendNotification(s, carga, { TTL: 3600, urgency: "high" });
        enviados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) mortos.push(s.endpoint);
      }
    }),
  );
  if (mortos.length) await rpc("remover_inscricoes_push", { p_id: id, p_endpoints: mortos });
  return Response.json({ ok: true, enviados, removidos: mortos.length });
}
