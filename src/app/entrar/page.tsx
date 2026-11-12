"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, mensagemErro, supabaseConfigurado } from "@/lib/supabase";
import { Marca } from "@/components/Logo";
import Icone from "@/components/Icone";

// Fase de testes: cadastro simples com e-mail e senha, sem codigo de confirmacao.
export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("cadastrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verSenha, setVerSenha] = useState(false);

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

  async function esqueci() {
    setErro("");
    setAviso("");
    if (!email.trim()) return setErro("Digite seu e-mail acima e toque de novo em “Esqueci minha senha”.");
    setOcupado(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/nova-senha` });
    setOcupado(false);
    if (error) return setErro(traduzir(error));
    setAviso("Enviamos um link para o seu e-mail. Abra-o neste celular para criar uma nova senha.");
  }

  if (!supabaseConfigurado) return <p className="p-6">Configure o Supabase no arquivo .env.local.</p>;
  const novo = modo === "cadastrar";

  return (
    <div className="pb-8">
      {/* Abertura com a marca */}
      <section className="relative overflow-hidden bg-[var(--mar)] px-5 pb-20 pt-8 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[var(--sol)]" />
        <div className="pointer-events-none absolute -left-8 bottom-6 h-20 w-20 rounded-full bg-white/10" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
          <Marca className="h-11 w-11" />
        </span>
        <h1 className="relative mt-4 text-[28px] font-extrabold leading-tight">
          {novo ? "Boas-vindas!" : "Que bom te ver de novo"}
        </h1>
        <p className="relative mt-1 max-w-[18rem] text-white/80">
          {novo ? "Carona pelo preço do ônibus, com quem já vai pelo seu caminho." : "Entre para ver as caronas de hoje."}
        </p>
      </section>

      <div className="relative -mt-12 space-y-4 px-4">
        <div className="cartao space-y-4 p-5 shadow-xl">
          <div className="grid grid-cols-2 rounded-xl bg-[var(--fundo)] p-1 text-sm font-semibold">
            {(["cadastrar", "entrar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); setErro(""); setAviso(""); }}
                className={`rounded-lg py-2.5 transition ${modo === m ? "bg-white text-[var(--mar)] shadow-sm" : "text-[var(--cinza)]"}`}
              >
                {m === "cadastrar" ? "Criar conta" : "Já tenho conta"}
              </button>
            ))}
          </div>

          <form onSubmit={enviar} className="space-y-3">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold">E-mail</label>
              <div className="relative">
                <IconeCampo d="M4 6h16v12H4z M4 7l8 6 8-6" />
                <input id="email" className="campo pl-11" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
              </div>
            </div>
            <div>
              <label htmlFor="senha" className="mb-1 block text-sm font-semibold">Senha</label>
              <div className="relative">
                <IconeCampo d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
                <input
                  id="senha"
                  className="campo pl-11 pr-20"
                  type={verSenha ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={novo ? "new-password" : "current-password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={novo ? "Crie uma senha" : "Sua senha"}
                />
                <button type="button" onClick={() => setVerSenha(!verSenha)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--mar)]">
                  {verSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {novo && (
                <p className={`mt-1 text-xs ${senha.length >= 6 ? "text-[var(--mar)]" : "text-[var(--cinza)]"}`}>
                  {senha.length >= 6 ? "✓ Senha com 6 caracteres ou mais" : "Pelo menos 6 caracteres"}
                </p>
              )}
            </div>
            {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
            {aviso && <p className="rounded-xl bg-[var(--sol-claro)] p-3 text-sm text-[#7a5200]">{aviso}</p>}
            <button className="botao w-full py-3.5 text-base" disabled={ocupado}>
              {ocupado ? "Aguarde…" : novo ? "Criar minha conta" : "Entrar"}
            </button>
            {!novo && (
              <button type="button" className="w-full text-center text-sm font-semibold text-[var(--mar)]" onClick={esqueci} disabled={ocupado}>
                Esqueci minha senha
              </button>
            )}
          </form>
        </div>

        {novo && (
          <ul className="space-y-2 px-1">
            {[
              ["rota", "O motorista não sai do caminho dele. Você espera numa rua ou parada da rota."],
              ["pix", "Paga o preço do ônibus no Pix, direto para o motorista."],
              ["escudo", "Perfis com foto, CPF e avaliação depois de cada carona."],
            ].map(([icone, texto]) => (
              <li key={icone} className="flex items-start gap-3 text-sm text-[var(--cinza)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--mar-claro)] text-[var(--mar)]">
                  <Icone nome={icone} className="h-4 w-4" />
                </span>
                <span className="pt-1.5">{texto}</span>
              </li>
            ))}
            <li className="pt-1 text-center text-xs text-[var(--cinza)]">Depois de criar a conta, você completa seu perfil em 1 minuto.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function IconeCampo({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--cinza)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
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
