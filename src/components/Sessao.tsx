"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigurado, type Perfil } from "@/lib/supabase";

type Ctx = {
  sessao: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  recarregarPerfil: () => Promise<void>;
};

const SessaoCtx = createContext<Ctx>({ sessao: null, perfil: null, carregando: true, recarregarPerfil: async () => {} });

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) return setPerfil(null);
    const { data } = await supabase.rpc("meu_perfil");
    setPerfil(((data as Perfil[] | null) ?? [])[0] ?? null);
  }, []);

  useEffect(() => {
    if (!supabaseConfigurado) return setCarregando(false);
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s);
      carregarPerfil(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [carregarPerfil]);

  return (
    <SessaoCtx.Provider value={{ sessao, perfil, carregando, recarregarPerfil: () => carregarPerfil(sessao) }}>
      {children}
    </SessaoCtx.Provider>
  );
}

export const useSessao = () => useContext(SessaoCtx);
