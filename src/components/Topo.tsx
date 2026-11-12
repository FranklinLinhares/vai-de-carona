"use client";

import Link from "next/link";
import Logo from "./Logo";
import Notificacoes from "./Notificacoes";

/** Barra do topo: marca a esquerda, sino de avisos a direita. */
export default function Topo() {
  return (
    <header className="sticky top-0 z-[1200] border-b border-[var(--linha)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <Link href="/" aria-label="Início">
          <Logo />
        </Link>
        <Notificacoes />
      </div>
    </header>
  );
}
