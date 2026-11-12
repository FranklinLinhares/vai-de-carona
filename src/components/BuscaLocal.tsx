"use client";

import Icone from "./Icone";
import { useEffect, useRef, useState } from "react";
import { buscarEndereco, nomeDoLocal, type Local } from "@/lib/geo";

export default function BuscaLocal({
  rotulo,
  valor,
  onEscolher,
  permitirLocalizacao = false,
}: {
  rotulo: string;
  valor: Local | null;
  onEscolher: (l: Local | null) => void;
  permitirLocalizacao?: boolean;
}) {
  const [texto, setTexto] = useState(valor?.nome ?? "");
  const [opcoes, setOpcoes] = useState<Local[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [semResultado, setSemResultado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busca = useRef<AbortController | null>(null);

  useEffect(() => {
    setTexto(valor?.nome ?? "");
  }, [valor?.nome]);

  function digitar(t: string) {
    setTexto(t);
    setErro("");
    setSemResultado(false);
    if (valor) onEscolher(null);
    if (temporizador.current) clearTimeout(temporizador.current);
    busca.current?.abort(); // descarta a busca anterior: so vale a do texto atual
    if (t.trim().length < 3) {
      setOpcoes([]);
      setCarregando(false);
      return;
    }
    temporizador.current = setTimeout(async () => {
      const controle = new AbortController();
      busca.current = controle;
      setCarregando(true);
      try {
        const r = await buscarEndereco(t, { sinal: controle.signal, parcial: setOpcoes });
        if (controle.signal.aborted) return;
        setOpcoes(r);
        setSemResultado(r.length === 0);
      } catch {
        if (!controle.signal.aborted) setErro("Busca indisponível no momento");
      } finally {
        if (!controle.signal.aborted) setCarregando(false);
      }
    }, 350);
  }

  function usarLocalizacao() {
    if (!navigator.geolocation) return setErro("Seu aparelho não informa a localização");
    setCarregando(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const nome = await nomeDoLocal(lat, lng);
        onEscolher({ nome, lat, lng });
        setOpcoes([]);
        setCarregando(false);
      },
      () => {
        setErro("Permita o acesso à localização para usar esta opção");
        setCarregando(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-semibold text-[var(--tinta)]">{rotulo}</label>
      <div className="flex gap-2">
        <input
          className="campo flex-1"
          placeholder="Rua, bairro ou lugar"
          value={texto}
          onChange={(e) => digitar(e.target.value)}
        />
        {permitirLocalizacao && (
          <button type="button" onClick={usarLocalizacao} className="botao-secundario whitespace-nowrap px-3 text-[var(--mar)]" title="Usar minha localização">
            <Icone nome="local" className="h-5 w-5" /> Aqui
          </button>
        )}
      </div>
      {carregando && <p className="mt-1 text-xs text-slate-500">Buscando…</p>}
      {semResultado && !carregando && !valor && (
        <p className="mt-1 text-xs text-amber-700">Nada encontrado. Tente outro nome ou marque o ponto tocando no mapa.</p>
      )}
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
      {opcoes.length > 0 && !valor && (
        <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-xl border border-[var(--linha)] bg-white shadow-xl">
          {opcoes.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-center gap-2 border-b border-[var(--linha)] px-3 py-3 text-left text-sm last:border-0 hover:bg-[var(--mar-claro)]"
                onClick={() => {
                  onEscolher(o);
                  setOpcoes([]);
                }}
              >
                <Icone nome="carona" className="h-4 w-4 shrink-0 text-[var(--cinza)]" />
                {o.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
