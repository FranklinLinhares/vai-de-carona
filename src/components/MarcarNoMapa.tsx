"use client";

export type Modo = "origem" | "destino" | "parada";

/** Botoes para escolher qual ponto o toque no mapa vai marcar. */
export default function MarcarNoMapa({
  marcando,
  onMudar,
  rotulos,
}: {
  marcando: Modo | null;
  onMudar: (m: Modo | null) => void;
  rotulos: Partial<Record<Modo, string>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[var(--cinza)]">Ou toque no mapa:</span>
      {(Object.keys(rotulos) as Modo[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onMudar(marcando === m ? null : m)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${marcando === m ? "bg-[var(--mar)] text-white" : "bg-[var(--mar-claro)] text-[var(--mar)]"}`}
        >
          {rotulos[m]}
        </button>
      ))}
      {marcando && <span className="w-full text-xs text-[var(--mar)]">Toque no mapa onde fica o ponto de {rotulos[marcando]?.toLowerCase()}.</span>}
    </div>
  );
}
