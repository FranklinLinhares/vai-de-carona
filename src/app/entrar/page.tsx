"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, mensagemErro, supabaseConfigurado } from "@/lib/supabase";

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    setEtapa("codigo");
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: "email" });
    setOcupado(false);
    if (error) return setErro("Código inválido ou expirado");
    router.push("/perfil");
  }

  if (!supabaseConfigurado) return <p className="p-6">Configure o Supabase no arquivo .env.local.</p>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Entrar</h1>
      {etapa === "email" ? (
        <form onSubmit={enviarCodigo} className="cartao space-y-3">
          <label className="block text-sm font-medium">Seu e-mail</label>
          <input className="campo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
          <button className="botao w-full" disabled={ocupado}>Receber código</button>
          <p className="text-xs text-slate-500">Enviamos um código de acesso para o seu e-mail. Não precisa de senha.</p>
        </form>
      ) : (
        <form onSubmit={confirmar} className="cartao space-y-3">
          <p className="text-sm">Digite o código enviado para <strong>{email}</strong>.</p>
          <input className="campo text-center text-2xl tracking-widest" inputMode="numeric" maxLength={8} required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <button className="botao w-full" disabled={ocupado}>Entrar</button>
          <button type="button" className="botao-secundario w-full" onClick={() => setEtapa("email")}>Usar outro e-mail</button>
        </form>
      )}
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
