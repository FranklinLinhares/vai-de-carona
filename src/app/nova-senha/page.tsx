"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, mensagemErro } from "@/lib/supabase";

// Aberta pelo link do e-mail "Esqueci minha senha": o Supabase ja entra com a sessao de recuperacao.
export default function NovaSenha() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && setPronto(true));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "PASSWORD_RECOVERY" || s) setPronto(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    const { error } = await supabase.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) return setErro(mensagemErro(error));
    router.push("/");
  }

  return (
    <div className="p-4">
      <h1 className="titulo-pagina mb-4">Nova senha</h1>
      {!pronto ? (
        <p className="cartao text-slate-600">Abrindo o link do e-mail… Se não carregar, peça um novo link em Entrar, “Esqueci minha senha”.</p>
      ) : (
        <form onSubmit={salvar} className="cartao space-y-3">
          <label className="block text-sm font-medium">Digite a nova senha</label>
          <input className="campo" type="password" required minLength={6} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" />
          <button className="botao w-full" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar nova senha"}</button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </form>
      )}
    </div>
  );
}
