"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const itens = [
  { href: "/", rotulo: "Início", icone: "🏠" },
  { href: "/carona", rotulo: "Pegar carona", icone: "🙋" },
  { href: "/motorista", rotulo: "Dirigir", icone: "🚗" },
  { href: "/minhas-caronas", rotulo: "Minhas caronas", icone: "🎫" },
  { href: "/perfil", rotulo: "Perfil", icone: "👤" },
];

export default function Navegacao() {
  const caminho = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg justify-around">
        {itens.map((i) => {
          const ativo = i.href === "/" ? caminho === "/" : caminho.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} className={`flex flex-col items-center px-2 py-2 text-[11px] ${ativo ? "text-teal-700 font-semibold" : "text-slate-500"}`}>
                <span className="text-lg leading-none">{i.icone}</span>
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
