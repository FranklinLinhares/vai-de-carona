"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, mensagemErro, supabaseConfigurado, type Perfil } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { Nota } from "@/components/Estrelas";
import Icone from "@/components/Icone";
import { useRouter } from "next/navigation";

type Form = Pick<Perfil, "nome" | "telefone" | "foto_url" | "cpf" | "cnh" | "carro_modelo" | "carro_cor" | "carro_placa" | "chave_pix"> & { genero: string };

const vazio: Form = { genero: "", nome: "", telefone: "", foto_url: "", cpf: "", cnh: "", carro_modelo: "", carro_cor: "", carro_placa: "", chave_pix: "" };

export default function PaginaPerfil() {
  const { sessao, perfil, carregando, recarregarPerfil } = useSessao();
  const [form, setForm] = useState<Form>(vazio);
  const [motorista, setMotorista] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (perfil) {
      const f = { ...vazio };
      (Object.keys(vazio) as (keyof Form)[]).forEach((k) => (f[k] = (perfil[k] as string) ?? ""));
      setForm(f);
      setMotorista(Boolean(perfil.cnh));
    }
  }, [perfil]);

  if (!supabaseConfigurado) return <p className="p-6">Configure o Supabase no arquivo .env.local.</p>;
  if (carregando) return <p className="p-6 text-slate-500">Carregando…</p>;
  if (!sessao)
    return (
      <div className="cartao m-4 text-center">
        <p>Entre para ver seu perfil.</p>
        <Link href="/entrar" className="botao mt-3 inline-block">Entrar</Link>
      </div>
    );

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const mascarar = (k: keyof Form, f: (v: string) => string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: f(e.target.value) });

  async function enviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo || !sessao) return;
    setEnviandoFoto(true);
    const caminho = `${sessao.user.id}/perfil-${Date.now()}`;
    const { error } = await supabase.storage.from("fotos").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || "image/jpeg" });
    setEnviandoFoto(false);
    if (error) return setErro(mensagemErro(error));
    const { data } = supabase.storage.from("fotos").getPublicUrl(caminho);
    setForm({ ...form, foto_url: data.publicUrl });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    if (!form.foto_url) return setErro("Adicione uma foto de rosto. Ela aparece para quem viaja com você.");
    if (motorista && !(form.cnh && form.carro_modelo && form.carro_cor && form.carro_placa && form.chave_pix))
      return setErro("Para dirigir, preencha CNH, carro, cor, placa e chave Pix.");
    const limpo = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v?.trim() ? v.trim() : null]));
    if (!motorista) Object.assign(limpo, { cnh: null, carro_modelo: null, carro_cor: null, carro_placa: null, chave_pix: null });
    if (limpo.carro_placa) limpo.carro_placa = String(limpo.carro_placa).toUpperCase();
    const { cpf, cnh, telefone, ...publico } = limpo;
    const { error } = await supabase.from("perfis").upsert({ id: sessao!.user.id, ...publico, telefone: "" });
    if (error) return setErro(mensagemErro(error));
    // CPF, CNH e telefone ficam numa tabela que so voce consegue ler
    const { error: erroPrivado } = await supabase.from("perfis_privados").upsert({ id: sessao!.user.id, cpf, cnh, telefone });
    if (erroPrivado) return setErro(mensagemErro(erroPrivado));
    const eraNovo = !perfil;
    await recarregarPerfil();
    setMsg("Perfil salvo!");
    if (eraNovo) router.push("/"); // cadastro concluido: vai para o inicio
  }

  const novo = !perfil;
  const feitos = [!!form.foto_url, !!form.nome.trim(), !!form.telefone.trim(), !!(form.cpf ?? "").trim()].filter(Boolean).length;
  const inicial = (form.nome.trim()[0] ?? sessao.user.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="pb-8">
      {/* Topo com foto */}
      <section className="relative overflow-hidden bg-[var(--mar)] px-5 pb-16 pt-6 text-white">
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[var(--sol)]" />
        <p className="relative text-sm font-medium text-white/80">{novo ? "Falta pouco" : "Meu perfil"}</p>
        <h1 className="relative text-[26px] font-extrabold leading-tight">{novo ? "Complete seu perfil" : form.nome.split(" ")[0] || "Seu perfil"}</h1>
        {novo ? (
          <p className="relative mt-1 max-w-[17rem] text-sm text-white/80">Quem viaja com você vê sua foto e seu nome. É rapidinho.</p>
        ) : (
          <div className="relative mt-1 text-sm text-white/90">
            <Nota nota={perfil.nota_media} total={perfil.total_avaliacoes} />
          </div>
        )}
      </section>

      <form onSubmit={salvar} className="relative -mt-12 space-y-4 px-4">
        <section className="cartao space-y-4 p-5 shadow-xl">
          <div className="flex items-center gap-4">
            <label className="relative shrink-0 cursor-pointer" aria-label="Escolher foto">
              {form.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.foto_url} alt="Sua foto" className="h-20 w-20 rounded-full object-cover ring-4 ring-[var(--mar-claro)]" />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--mar-claro)] text-3xl font-extrabold text-[var(--mar)] ring-4 ring-white">
                  {inicial}
                </span>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sol)] text-[var(--tinta)] shadow ring-2 ring-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={enviarFoto} />
            </label>
            <div className="min-w-0">
              <p className="font-bold">{enviandoFoto ? "Enviando foto…" : form.foto_url ? "Foto pronta" : "Adicione uma foto de rosto"}</p>
              <p className="text-sm text-[var(--cinza)]">Toque na foto para {form.foto_url ? "trocar" : "tirar ou escolher"}.</p>
              <p className="truncate text-xs text-[var(--cinza)]">{sessao.user.email}</p>
            </div>
          </div>
          {novo && (
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-[var(--cinza)]">
                <span>Seu perfil</span>
                <span>{feitos} de 4</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--fundo)]">
                <div className="h-full rounded-full bg-[var(--sol)] transition-all" style={{ width: `${(feitos / 4) * 100}%` }} />
              </div>
            </div>
          )}
        </section>

        <section className="cartao space-y-3">
          <h2 className="flex items-center gap-2 font-extrabold">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mar-claro)] text-[var(--mar)]"><Icone nome="perfil" className="h-4 w-4" /></span>
            Seus dados
          </h2>
          <Campo rotulo="Nome completo" valor={form.nome} onChange={set("nome")} obrigatorio placeholder="Como está no documento" auto="name" />
          <Campo rotulo="Celular com DDD" valor={form.telefone} onChange={mascarar("telefone", celular)} obrigatorio tipo="tel" placeholder="(83) 99999-0000" auto="tel" />
          <Campo rotulo="CPF" valor={form.cpf ?? ""} onChange={mascarar("cpf", cpf)} obrigatorio placeholder="000.000.000-00" modo="numeric" />
          <div>
            <label className="mb-1 block text-sm font-semibold">Gênero</label>
            <div className="grid grid-cols-2 gap-2">
              {[["feminino", "Feminino"], ["masculino", "Masculino"], ["outro", "Outro"], ["", "Prefiro não dizer"]].map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm({ ...form, genero: v })}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${form.genero === v ? "border-[var(--mar)] bg-[var(--mar-claro)] text-[var(--mar)]" : "border-[var(--linha)] bg-white text-[var(--cinza)]"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--cinza)]">Usado no filtro &quot;só mulheres&quot;.</p>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-[var(--fundo)] p-3 text-xs text-[var(--cinza)]">
            <Icone nome="escudo" className="h-4 w-4 shrink-0" />
            CPF, CNH e celular ficam guardados só para você. Os outros veem apenas sua foto, seu primeiro nome e sua nota.
          </p>
        </section>

        <section className={`cartao space-y-3 transition ${motorista ? "border-[var(--mar)]" : ""}`}>
          <button type="button" onClick={() => setMotorista(!motorista)} className="flex w-full items-center gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sol-claro)] text-[#8a5a00]"><Icone nome="dirigir" className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block font-extrabold">Também quero oferecer caronas</span>
              <span className="text-sm text-[var(--cinza)]">Leve gente no seu caminho e divida o custo.</span>
            </span>
            <span role="switch" aria-checked={motorista} className={`relative h-7 w-12 shrink-0 rounded-full transition ${motorista ? "bg-[var(--mar)]" : "bg-slate-300"}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${motorista ? "left-6" : "left-1"}`} />
            </span>
          </button>
          {motorista && (
            <div className="space-y-3 border-t border-[var(--linha)] pt-3">
              <Campo rotulo="Número da CNH" valor={form.cnh ?? ""} onChange={set("cnh")} obrigatorio modo="numeric" />
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Modelo do carro" valor={form.carro_modelo ?? ""} onChange={set("carro_modelo")} obrigatorio placeholder="Onix" />
                <Campo rotulo="Cor" valor={form.carro_cor ?? ""} onChange={set("carro_cor")} obrigatorio placeholder="Prata" />
              </div>
              <Campo rotulo="Placa" valor={form.carro_placa ?? ""} onChange={mascarar("carro_placa", placa)} obrigatorio placeholder="ABC1D23" />
              <Campo rotulo="Chave Pix (para receber)" valor={form.chave_pix ?? ""} onChange={set("chave_pix")} obrigatorio placeholder="Celular, e-mail, CPF ou chave aleatória" />
            </div>
          )}
        </section>

        {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        {msg && <p className="rounded-xl bg-[var(--mar-claro)] p-3 text-sm font-semibold text-[var(--mar)]">✓ {msg}</p>}
        <button className="botao w-full py-3.5 text-base">{novo ? "Concluir cadastro" : "Salvar alterações"}</button>
        {!novo && (
          <div className="grid grid-cols-2 gap-2">
            <Link href="/grupos" className="botao-secundario flex items-center justify-center gap-2"><Icone nome="grupos" className="h-4 w-4" /> Meus grupos</Link>
            <button type="button" className="botao-secundario" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
          </div>
        )}
      </form>
    </div>
  );
}

const so = (v: string) => v.replace(/\D/g, "");
function celular(v: string) {
  const d = so(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}
function cpf(v: string) {
  const d = so(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function placa(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function Campo({ rotulo, valor, onChange, obrigatorio, tipo = "text", placeholder, auto, modo }: {
  rotulo: string; valor: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  obrigatorio?: boolean; tipo?: string; placeholder?: string; auto?: string; modo?: "numeric" | "text";
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold">{rotulo}</label>
      <input className="campo" type={tipo} value={valor} onChange={onChange} required={obrigatorio} placeholder={placeholder} autoComplete={auto} inputMode={modo} />
    </div>
  );
}
