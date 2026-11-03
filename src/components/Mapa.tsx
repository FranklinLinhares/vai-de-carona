"use client";

import dynamic from "next/dynamic";

// Leaflet usa window, entao o mapa so carrega no navegador
const Mapa = dynamic(() => import("./MapaBase"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-xl bg-slate-100" />,
});

export default Mapa;
export type { Marcador } from "./MapaBase";
