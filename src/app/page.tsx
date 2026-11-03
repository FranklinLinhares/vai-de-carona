"use client";

import Link from "next/link";
import { useSessao } from "@/components/Sessao";
import { REGRAS, CIDADE } from "@/lib/config";
import { formatarReais } from "@/lib/geo";

export default function Inicio() {
  const { perfil } = useSessao();
  return (
    <div className="p-4">
      <header className="rounded-3xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-white">
        <p className="text-sm opacity-80">{CIDADE.nome}</p>
        <h1 className="text-3xl font-bold">Vai de carona</h1>
        <p className="mt-2 opacity-90">
          {perfil ? `Olá, ${perfil.nome.split(" ")[0]}! ` : ""}Carona na rota de quem já está indo, por{" "}
          <strong>{formatarReais(REGRAS.tarifa)}</strong>, o preço do ônibus.
        </p>
      </header>

      <div className="mt-4 grid gap-3">
        <Link href="/carona" className="cartao flex items-center gap-4 hover:border-teal-600">
          <span className="text-4xl">🙋</span>
          <span>
            <span className="block text-lg font-semibold">Preciso de carona</span>
            <span className="text-sm text-slate-600">Veja quem passa perto de você e vai para o seu destino.</span>
          </span>
        </Link>
        <Link href="/motorista/nova" className="cartao flex items-center gap-4 hover:border-teal-600">
          <span className="text-4xl">🚗</span>
          <span>
            <span className="block text-lg font-semibold">Vou dirigir</span>
            <span className="text-sm text-slate-600">Publique sua rota e leve alguém sem sair do caminho.</span>
          </span>
        </Link>
      </div>

      <section className="cartao mt-4">
        <h2 className="font-semibold">Como funciona</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>O motorista diz para onde vai e o app traça a rota.</li>
          <li>O passageiro diz para onde vai e vê as rotas que passam a até {REGRAS.raioCaminhadaM} m dele.</li>
          <li>O motorista <strong>não sai da rota</strong>: o passageiro espera numa rua da rota ou numa parada de ônibus.</li>
          <li>Chegue {REGRAS.folgaChegadaMin} min antes. O motorista espera no máximo {REGRAS.toleranciaEsperaMin} min.</li>
          <li>Pague {formatarReais(REGRAS.tarifa)} por Pix direto ao motorista e avalie a viagem.</li>
        </ol>
      </section>
    </div>
  );
}
