"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, mensagemErro, supabaseConfigurado, type Perfil } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { Nota } from "@/components/Estrelas";

type Form = Pick<Perfil, "nome" | "telefone" | "foto_url" | "cpf" | "cnh" | "carro_modelo" | "carro_cor" | "carro_placa" | "chave_pix"> & { genero: string };

const vazio: Form = { genero: "", nome: "", telefone: "", foto_url: "", cpf: "", cnh: "", carro_modelo: "", carro_cor: "", carro_placa: "", chave_pix: "" };

export default function PaginaPerfil() {
  const { sessao, perfil, carregando, recarregarPerfil } = useSessao();
  const [form, setForm] = useState<Form>(vazio);
  const [motorista, setMotorista] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);

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
    await recarregarPerfil();
    setMsg("Perfil salvo!");
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meu perfil</h1>
        {perfil && <Nota nota={perfil.nota_media} total={perfil.total_avaliacoes} />}
      </div>
      <form onSubmit={salvar} className="space-y-4">
        <section className="cartao space-y-3">
          <div className="flex items-center gap-3">
            {form.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.foto_url} alt="Sua foto" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl">👤</div>
            )}
            <label className="botao-secundario cursor-pointer">
              {enviandoFoto ? "Enviando…" : "Escolher foto"}
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={enviarFoto} />
            </label>
          </div>
          <Campo rotulo="Nome completo" valor={form.nome} onChange={set("nome")} obrigatorio />
          <Campo rotulo="Celular (com DDD)" valor={form.telefone} onChange={set("telefone")} obrigatorio tipo="tel" placeholder="83 99999-0000" />
          <Campo rotulo="CPF" valor={form.cpf ?? ""} onChange={set("cpf")} obrigatorio placeholder="000.000.000-00" />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Gênero</label>
            <select className="campo" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}>
              <option value="">Prefiro não informar</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Usado no filtro &quot;só mulheres&quot;, para motoristas e passageiras.</p>
          </div>
          <p className="text-xs text-slate-500">E-mail: {sessao.user.email}</p>
        </section>

        <section className="cartao space-y-3">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={motorista} onChange={(e) => setMotorista(e.target.checked)} className="h-5 w-5 accent-teal-700" />
            Também quero oferecer caronas
          </label>
          {motorista && (
            <>
              <Campo rotulo="Número da CNH" valor={form.cnh ?? ""} onChange={set("cnh")} obrigatorio />
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Modelo do carro" valor={form.carro_modelo ?? ""} onChange={set("carro_modelo")} obrigatorio placeholder="Onix" />
                <Campo rotulo="Cor" valor={form.carro_cor ?? ""} onChange={set("carro_cor")} obrigatorio placeholder="Prata" />
              </div>
              <Campo rotulo="Placa" valor={form.carro_placa ?? ""} onChange={set("carro_placa")} obrigatorio placeholder="ABC1D23" />
              <Campo rotulo="Chave Pix (para receber)" valor={form.chave_pix ?? ""} onChange={set("chave_pix")} obrigatorio />
            </>
          )}
        </section>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {msg && <p className="text-sm text-teal-700">{msg}</p>}
        <button className="botao w-full">Salvar</button>
        <Link href="/grupos" className="botao-secundario block w-full text-center">👥 Meus grupos</Link>
        <button type="button" className="botao-secundario w-full" onClick={() => supabase.auth.signOut()}>
          Sair da conta
        </button>
      </form>
    </div>
  );
}

function Campo({ rotulo, valor, onChange, obrigatorio, tipo = "text", placeholder }: {
  rotulo: string; valor: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  obrigatorio?: boolean; tipo?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</label>
      <input className="campo" type={tipo} value={valor} onChange={onChange} required={obrigatorio} placeholder={placeholder} />
    </div>
  );
}
