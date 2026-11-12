"use client";

import { useEffect, useState } from "react";
import { useSessao } from "./Sessao";
import { ativarAvisos, estadoAvisos, type EstadoAvisos } from "@/lib/push";

/** Cartao que convida a ligar os avisos no celular. Some quando ja esta ativo. */
export default function AtivarAvisos({ motivo }: { motivo: string }) {
  const { perfil } = useSessao();
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    estadoAvisos().then(setEstado);
  }, []);

  if (!perfil || !estado || estado === "ativo" || estado === "indisponivel") return null;

  if (estado === "instalar_iphone")
    return (
      <div className="cartao border-amber-200 bg-amber-50 text-sm text-amber-900">
        <p className="font-semibold">🔔 Receba avisos no iPhone</p>
        <p className="mt-1">
          Toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em <strong>Adicionar à Tela de Início</strong>. Abra o app pelo ícone e ative os avisos.
        </p>
      </div>
    );

  if (estado === "bloqueado")
    return (
      <div className="cartao border-amber-200 bg-amber-50 text-sm text-amber-900">
        <p className="font-semibold">🔕 Avisos bloqueados</p>
        <p className="mt-1">Libere as notificações deste site nas configurações do navegador para saber {motivo}.</p>
      </div>
    );

  return (
    <div className="cartao flex items-center gap-3 border-teal-200 bg-teal-50">
      <span className="text-2xl">🔔</span>
      <p className="flex-1 text-sm text-teal-900">Ative os avisos para saber {motivo}, mesmo com o app fechado.</p>
      <button
        className="botao text-sm"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          setEstado(await ativarAvisos(perfil.id).catch(() => "pode_ativar" as const));
          setOcupado(false);
        }}
      >
        Ativar
      </button>
    </div>
  );
}
