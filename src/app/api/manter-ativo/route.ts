// Chamado 1x por dia pelo Vercel Cron (vercel.json) para o plano gratis do Supabase nao pausar o banco.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return Response.json({ ok: false, erro: "Supabase não configurado" }, { status: 500 });
  const r = await fetch(`${url}/rest/v1/rpc/ping`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  return Response.json({ ok: r.ok, status: r.status, em: await r.text() }, { status: r.ok ? 200 : 502 });
}
