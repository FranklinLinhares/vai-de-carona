"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icone from "./Icone";

const itens = [
  { href: "/", rotulo: "Início", icone: "inicio" },
  { href: "/carona", rotulo: "Carona", icone: "carona" },
  { href: "/motorista", rotulo: "Dirigir", icone: "dirigir" },
  { href: "/minhas-caronas", rotulo: "Viagens", icone: "viagens" },
  { href: "/perfil", rotulo: "Perfil", icone: "perfil" },
];

export default function Navegacao() {
  const caminho = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-[var(--linha)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-lg justify-around px-1">
        {itens.map((i) => {
          const ativo = i.href === "/" ? caminho === "/" : caminho.startsWith(i.href);
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${ativo ? "font-bold text-[var(--mar)]" : "font-medium text-[var(--cinza)]"}`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${ativo ? "bg-[var(--mar-claro)]" : ""}`}>
                  <Icone nome={i.icone} className="h-[22px] w-[22px]" />
                </span>
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
