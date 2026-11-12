"use client";

import Link from "next/link";
import { useSessao } from "@/components/Sessao";
import Icone from "@/components/Icone";
import { REGRAS, CIDADE } from "@/lib/config";
import { formatarReais } from "@/lib/geo";

const passos = [
  { icone: "rota", titulo: "O motorista publica a rota", texto: "Ele não sai do caminho dele." },
  { icone: "carona", titulo: "Você espera na rota", texto: `Numa rua ou parada a até ${REGRAS.raioCaminhadaM} m de você.` },
  { icone: "pix", titulo: `Paga ${formatarReais(REGRAS.tarifa)} no Pix`, texto: "O preço do ônibus, direto ao motorista." },
];

export default function Inicio() {
  const { perfil } = useSessao();
  const primeiroNome = perfil?.nome.split(" ")[0];

  return (
    <div className="space-y-5 p-4">
      {/* Saudacao e busca principal, como nos apps de corrida */}
      <section className="relative overflow-hidden rounded-3xl bg-[var(--mar)] p-5 text-white">
        <div className="pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full bg-[var(--sol)]" />
        <div className="pointer-events-none absolute right-6 top-14 h-10 w-10 rounded-full bg-white/10" />
        <p className="relative text-sm font-medium text-white/80">{CIDADE.nome}</p>
        <h1 className="relative mt-1 max-w-[16rem] text-[26px] font-extrabold leading-tight">
          {primeiroNome ? `Oi, ${primeiroNome}! Para onde vamos?` : "Carona pelo preço do ônibus"}
        </h1>
        <Link
          href="/carona"
          className="relative mt-5 flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-[var(--tinta)] shadow-lg"
        >
          <Icone nome="busca" className="h-5 w-5 text-[var(--mar)]" />
          <span className="flex-1 font-semibold text-[var(--cinza)]">Para onde você vai?</span>
          <span className="selo bg-[var(--sol)] text-[var(--tinta)]">{formatarReais(REGRAS.tarifa)}</span>
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/carona" className="cartao flex flex-col gap-3 transition hover:border-[var(--mar)]">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--mar-claro)] text-[var(--mar)]">
            <Icone nome="carona" />
          </span>
          <span>
            <span className="block font-bold">Pegar carona</span>
            <span className="text-sm leading-snug text-[var(--cinza)]">Veja quem passa perto de você.</span>
          </span>
        </Link>
        <Link href="/motorista/nova" className="cartao flex flex-col gap-3 transition hover:border-[var(--mar)]">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--sol-claro)] text-[#8a5a00]">
            <Icone nome="dirigir" />
          </span>
          <span>
            <span className="block font-bold">Oferecer carona</span>
            <span className="text-sm leading-snug text-[var(--cinza)]">Leve alguém no seu caminho.</span>
          </span>
        </Link>
      </div>

      <Link href="/grupos" className="cartao flex items-center gap-3 transition hover:border-[var(--mar)]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
          <Icone nome="grupos" />
        </span>
        <span className="flex-1">
          <span className="block font-bold">Grupos</span>
          <span className="text-sm text-[var(--cinza)]">Carona só entre colegas da empresa, faculdade ou condomínio.</span>
        </span>
        <Icone nome="seta" className="h-5 w-5 text-[var(--cinza)]" />
      </Link>

      <section>
        <h2 className="mb-3 px-1 text-lg font-extrabold">Como funciona</h2>
        <ol className="space-y-2">
          {passos.map((p, i) => (
            <li key={p.titulo} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--linha)]">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mar-claro)] text-[var(--mar)]">
                <Icone nome={p.icone} className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sol)] text-[11px] font-extrabold text-[var(--tinta)]">
                  {i + 1}
                </span>
              </span>
              <span>
                <span className="block text-sm font-bold">{p.titulo}</span>
                <span className="text-sm text-[var(--cinza)]">{p.texto}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 flex items-start gap-2 px-1 text-xs text-[var(--cinza)]">
          <Icone nome="escudo" className="h-4 w-4 shrink-0" />
          Chegue {REGRAS.folgaChegadaMin} min antes: o motorista espera no máximo {REGRAS.toleranciaEsperaMin} min. Em emergência, ligue {REGRAS.emergencia}.
        </p>
      </section>
    </div>
  );
}
