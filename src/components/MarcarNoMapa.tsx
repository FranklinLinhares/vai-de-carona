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
      <span className="text-slate-600">Tocar no mapa para marcar:</span>
      {(Object.keys(rotulos) as Modo[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onMudar(marcando === m ? null : m)}
          className={marcando === m ? "botao py-1 text-sm" : "botao-secundario py-1"}
        >
          {rotulos[m]}
        </button>
      ))}
      {marcando && <span className="w-full text-xs text-teal-700">Toque no mapa onde fica o ponto de {rotulos[marcando]?.toLowerCase()}.</span>}
    </div>
  );
}
