// Marca do Cadê a carona: um alfinete de mapa com a rota passando por dentro.
export function Marca({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 3c-8.8 0-16 7-16 15.7C8 30.5 24 45 24 45s16-14.5 16-26.3C40 10 32.8 3 24 3Z" fill="#0B5D57" />
      <circle cx="24" cy="18.5" r="9" fill="#FFB800" />
      <path d="M19 21c2.8 3 7.2 3 10 0" stroke="#0B5D57" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="20.5" cy="16" r="1.7" fill="#0B5D57" />
      <circle cx="29.5" cy="16" r="1.7" fill="#0B5D57" />
    </svg>
  );
}

export default function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Marca className="h-8 w-8" />
      <span className={`text-lg font-extrabold leading-none tracking-tight ${claro ? "text-white" : "text-[var(--tinta)]"}`}>
        Cadê <span className={claro ? "text-[var(--sol)]" : "text-[var(--mar)]"}>a carona</span>
      </span>
    </span>
  );
}
