"use client";

import Link from "next/link";
import { useSessao } from "./Sessao";
import { supabaseConfigurado } from "@/lib/supabase";

/** Exige login e perfil completo. Com `motorista`, exige tambem dados do carro. */
export default function Protegido({ children, motorista = false }: { children: React.ReactNode; motorista?: boolean }) {
  const { sessao, perfil, carregando } = useSessao();

  if (!supabaseConfigurado)
    return <Aviso titulo="Banco de dados não configurado" texto="Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local." />;
  if (carregando) return <p className="p-6 text-slate-500">Carregando…</p>;
  if (!sessao) return <Aviso titulo="Entre para continuar" texto="Crie sua conta com e-mail e senha." link={{ href: "/entrar", texto: "Entrar" }} />;
  if (!perfil) return <Aviso titulo="Complete seu cadastro" texto="Precisamos do seu nome e telefone." link={{ href: "/perfil", texto: "Completar cadastro" }} />;
  if (perfil.suspenso)
    return <Aviso titulo="Conta em revisão" texto="Sua conta foi suspensa por avaliações baixas. Fale com o suporte." />;
  if (motorista && !(perfil.cnh && perfil.carro_placa && perfil.chave_pix))
    return <Aviso titulo="Cadastre-se como motorista" texto="Informe CNH, dados do carro e chave Pix para oferecer caronas." link={{ href: "/perfil", texto: "Completar dados de motorista" }} />;
  return <>{children}</>;
}

function Aviso({ titulo, texto, link }: { titulo: string; texto: string; link?: { href: string; texto: string } }) {
  return (
    <div className="cartao m-4 text-center">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="mt-1 text-slate-600">{texto}</p>
      {link && (
        <Link href={link.href} className="botao mt-4 inline-block">
          {link.texto}
        </Link>
      )}
    </div>
  );
}
