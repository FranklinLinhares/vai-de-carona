// Icones de linha simples (24x24), no lugar dos emojis da navegacao e dos botoes.
const caminhos: Record<string, React.ReactNode> = {
  inicio: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>,
  carona: <><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /></>,
  dirigir: <><path d="M5 16h14l-1.6-5.2A2 2 0 0 0 15.5 9.4h-7a2 2 0 0 0-1.9 1.4L5 16Z" /><path d="M4 16h16v3H4z" /><circle cx="7.5" cy="19" r="1.2" /><circle cx="16.5" cy="19" r="1.2" /></>,
  viagens: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M15 6v12" strokeDasharray="2 2" /><path d="M7 10h4M7 14h3" /></>,
  perfil: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  sino: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  local: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></>,
  busca: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  grupos: <><circle cx="9" cy="9" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="8" r="2.5" /><path d="M16 14.6c2.8.2 5 2.1 5 5" /></>,
  seta: <path d="m9 5 7 7-7 7" />,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  rota: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 5h7a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h7" /></>,
  pix: <><path d="m12 3 9 9-9 9-9-9 9-9Z" /><path d="m8 12 4-4 4 4-4 4-4-4Z" /></>,
  escudo: <><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
};

export default function Icone({ nome, className = "h-6 w-6" }: { nome: keyof typeof caminhos | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {caminhos[nome]}
    </svg>
  );
}
