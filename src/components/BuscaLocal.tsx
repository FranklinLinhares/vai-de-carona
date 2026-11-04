"use client";

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

  useEffect(() => {
    setTexto(valor?.nome ?? "");
  }, [valor?.nome]);

  function digitar(t: string) {
    setTexto(t);
    setErro("");
    setSemResultado(false);
    if (valor) onEscolher(null);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await buscarEndereco(t);
        setOpcoes(r);
        setSemResultado(t.trim().length >= 3 && r.length === 0);
      } catch {
        setErro("Busca indisponível no momento");
      } finally {
        setCarregando(false);
      }
    }, 600); // Nominatim pede no maximo 1 requisicao por segundo
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
      <label className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</label>
      <div className="flex gap-2">
        <input
          className="campo flex-1"
          placeholder="Rua, bairro ou lugar"
          value={texto}
          onChange={(e) => digitar(e.target.value)}
        />
        {permitirLocalizacao && (
          <button type="button" onClick={usarLocalizacao} className="botao-secundario whitespace-nowrap" title="Usar minha localização">
            📍 Aqui
          </button>
        )}
      </div>
      {carregando && <p className="mt-1 text-xs text-slate-500">Buscando…</p>}
      {semResultado && !carregando && !valor && (
        <p className="mt-1 text-xs text-amber-700">Nada encontrado. Tente outro nome ou marque o ponto tocando no mapa.</p>
      )}
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
      {opcoes.length > 0 && !valor && (
        <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {opcoes.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
                onClick={() => {
                  onEscolher(o);
                  setOpcoes([]);
                }}
              >
                {o.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
