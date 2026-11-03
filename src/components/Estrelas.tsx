"use client";

import { useState } from "react";
import { supabase, mensagemErro } from "@/lib/supabase";

export function Nota({ nota, total }: { nota: number | null; total: number }) {
  if (!total) return <span className="text-xs text-slate-500">Novo no app</span>;
  return (
    <span className="text-xs text-amber-600">
      ★ {Number(nota).toFixed(1)} <span className="text-slate-500">({total})</span>
    </span>
  );
}

/** Formulario de avaliacao de 1 a 5 estrelas, usado pelos dois lados. */
export function Avaliar({
  viagemId,
  avaliadoId,
  nome,
  onFeito,
}: {
  viagemId: string;
  avaliadoId: string;
  nome: string;
  onFeito?: () => void;
}) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState<"" | "enviando" | "ok">("");
  const [erro, setErro] = useState("");

  async function enviar() {
    setEstado("enviando");
    setErro("");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("avaliacoes").insert({
      viagem_id: viagemId,
      autor_id: u.user?.id,
      avaliado_id: avaliadoId,
      nota,
      comentario: comentario || null,
    });
    if (error) {
      setEstado("");
      setErro(error.code === "23505" ? "Você já avaliou." : mensagemErro(error));
      if (error.code === "23505") setEstado("ok");
      return;
    }
    setEstado("ok");
    onFeito?.();
  }

  if (estado === "ok") return <p className="text-sm text-teal-700">Obrigado pela avaliação de {nome}!</p>;

  return (
    <div className="rounded-lg bg-amber-50 p-3">
      <p className="text-sm font-medium">Como foi a viagem com {nome}?</p>
      <div className="my-1 flex gap-1 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setNota(n)} className={n <= nota ? "text-amber-500" : "text-slate-300"} aria-label={`${n} estrelas`}>
            ★
          </button>
        ))}
      </div>
      <input className="campo text-sm" placeholder="Comentário (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
      <button className="botao mt-2 text-sm" disabled={!nota || estado === "enviando"} onClick={enviar}>
        Enviar avaliação
      </button>
    </div>
  );
}
