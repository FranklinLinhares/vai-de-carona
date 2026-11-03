"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";
import { CIDADE } from "@/lib/config";

export type Marcador = { lat: number; lng: number; cor: string; rotulo: string };

function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const mapa = useMap();
  useEffect(() => {
    if (pontos.length === 1) mapa.setView(pontos[0], 16);
    else if (pontos.length > 1) mapa.fitBounds(L.latLngBounds(pontos), { padding: [30, 30] });
  }, [mapa, JSON.stringify(pontos)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Clique({ onClique }: { onClique?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClique?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function MapaBase({
  rotas = [],
  marcadores = [],
  altura = 320,
  onClique,
}: {
  rotas?: { coordenadas: [number, number][]; cor?: string }[]; // [lng, lat]
  marcadores?: Marcador[];
  altura?: number;
  onClique?: (lat: number, lng: number) => void;
}) {
  const linhas = rotas.map((r) => ({ ...r, latlng: r.coordenadas.map(([lng, lat]) => [lat, lng] as [number, number]) }));
  const enquadrar: [number, number][] = [
    ...linhas.flatMap((l) => l.latlng),
    ...marcadores.map((m) => [m.lat, m.lng] as [number, number]),
  ];
  return (
    <div style={{ height: altura }} className="w-full overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={CIDADE.centro} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {linhas.map((l, i) => (
          <Polyline key={i} positions={l.latlng} pathOptions={{ color: l.cor ?? "#0f766e", weight: 5, opacity: 0.85 }} />
        ))}
        {marcadores.map((m, i) => (
          <CircleMarker
            key={i}
            center={[m.lat, m.lng]}
            radius={9}
            pathOptions={{ color: "#fff", weight: 3, fillColor: m.cor, fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>{m.rotulo}</Tooltip>
          </CircleMarker>
        ))}
        <Enquadrar pontos={enquadrar} />
        <Clique onClique={onClique} />
      </MapContainer>
    </div>
  );
}
