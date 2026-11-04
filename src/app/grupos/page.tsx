"use client";

import { useCallback, useEffect, useState } from "react";
import Protegido from "@/components/Protegido";
import { useSessao } from "@/components/Sessao";
import { supabase, mensagemErro } from "@/lib/supabase";

type Grupo = { id: string; nome: string; codigo: string; membros: number };

export default function PaginaGrupos() {
  return (
    <Protegido>
      <Grupos />
    </Protegido>
  );
}

function Grupos() {
  const { perfil } = useSessao();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("grupos").select("id,nome,codigo,grupo_membros(count)").order("nome");
    setGrupos(
      (data ?? []).map((g) => ({
        id: g.id,
        nome: g.nome,
        codigo: g.codigo,
        membros: (g.grupo_membros as unknown as { count: number }[])?.[0]?.count ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    const { data, error } = await supabase.rpc("criar_grupo", { p_nome: nome });
    if (error) return setErro(mensagemErro(error));
    setNome("");
    setMsg(`Grupo criado! Código para convidar: ${data}`);
    carregar();
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    const { data, error } = await supabase.rpc("entrar_grupo", { p_codigo: codigo });
    if (error) return setErro(mensagemErro(error));
    setCodigo("");
    setMsg(`Você entrou no grupo ${data}.`);
    carregar();
  }

  async function sair(g: Grupo) {
    if (!confirm(`Sair do grupo ${g.nome}?`)) return;
    const { error } = await supabase.from("grupo_membros").delete().eq("grupo_id", g.id).eq("usuario_id", perfil!.id);
    if (error) return setErro(mensagemErro(error));
    carregar();
  }

  async function convidar(g: Grupo) {
    const texto = `Entre no grupo "${g.nome}" no Vai de carona para dividir caronas com a gente. Código: ${g.codigo}\n${location.origin}/grupos`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Vai de carona", text: texto });
      } catch {
        /* fechou */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Grupos</h1>
      <p className="text-sm text-slate-600">
        Crie um grupo da sua empresa, faculdade ou condomínio. Caronas marcadas para o grupo só aparecem para quem participa dele.
      </p>

      {grupos.map((g) => (
        <article key={g.id} className="cartao flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold">👥 {g.nome}</p>
            <p className="text-xs text-slate-600">
              {g.membros} {g.membros === 1 ? "membro" : "membros"} · código <strong className="tracking-widest">{g.codigo}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <button className="botao-secundario text-xs" onClick={() => convidar(g)}>Convidar</button>
            <button className="botao-secundario text-xs" onClick={() => sair(g)}>Sair</button>
          </div>
        </article>
      ))}

      <form onSubmit={entrar} className="cartao space-y-2">
        <label className="block text-sm font-medium">Entrar com um código</label>
        <div className="flex gap-2">
          <input className="campo flex-1 uppercase tracking-widest" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ABC123" required />
          <button className="botao">Entrar</button>
        </div>
      </form>

      <form onSubmit={criar} className="cartao space-y-2">
        <label className="block text-sm font-medium">Criar um grupo</label>
        <div className="flex gap-2">
          <input className="campo flex-1" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Funcionários da UFPB" minLength={2} maxLength={60} required />
          <button className="botao">Criar</button>
        </div>
      </form>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {msg && <p className="text-sm text-teal-700">{msg}</p>}
    </div>
  );
}
