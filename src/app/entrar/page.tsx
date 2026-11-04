"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, mensagemErro, supabaseConfigurado } from "@/lib/supabase";

// Fase de testes: cadastro simples com e-mail e senha, sem codigo de confirmacao.
export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("cadastrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    setAviso("");
    if (modo === "cadastrar") {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
      setOcupado(false);
      if (error) return setErro(traduzir(error));
      if (!data.session) return setAviso("Conta criada, mas o Supabase ainda exige confirmação por e-mail. Desligue \"Confirm email\" no painel para o cadastro simples funcionar.");
      return router.push("/perfil");
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setOcupado(false);
    if (error) return setErro(traduzir(error));
    router.push("/");
  }

  if (!supabaseConfigurado) return <p className="p-6">Configure o Supabase no arquivo .env.local.</p>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">{modo === "cadastrar" ? "Criar conta" : "Entrar"}</h1>
      <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["cadastrar", "entrar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setModo(m); setErro(""); setAviso(""); }}
            className={`rounded-md py-2 ${modo === m ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {m === "cadastrar" ? "Sou novo" : "Já tenho conta"}
          </button>
        ))}
      </div>
      <form onSubmit={enviar} className="cartao space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">E-mail</label>
          <input className="campo" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Senha</label>
          <input className="campo" type="password" required minLength={6} autoComplete={modo === "cadastrar" ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" />
        </div>
        <button className="botao w-full" disabled={ocupado}>
          {ocupado ? "Aguarde…" : modo === "cadastrar" ? "Criar conta" : "Entrar"}
        </button>
      </form>
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      {aviso && <p className="mt-3 text-sm text-amber-700">{aviso}</p>}
    </div>
  );
}

function traduzir(e: unknown) {
  const m = mensagemErro(e);
  if (m.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("already registered")) return "Este e-mail já tem conta. Use \"Já tenho conta\".";
  if (m.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("Email not confirmed")) return "E-mail ainda não confirmado. Desligue \"Confirm email\" no painel do Supabase.";
  if (m.includes("rate limit")) return "Muitas tentativas. Espere alguns minutos.";
  return m;
}
