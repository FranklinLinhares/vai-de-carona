"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";
import { CIDADE } from "@/lib/config";

export type Marcador = { lat: number; lng: number; cor: string; rotulo: string; icone?: string }; // icone: emoji no lugar do circulo

const iconeEmoji = (emoji: string) =>
  L.divIcon({ html: `<span style="font-size:24px;line-height:24px;filter:drop-shadow(0 1px 1px #0006)">${emoji}</span>`, className: "", iconSize: [24, 24], iconAnchor: [12, 20] });

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
  enquadrar: focar,
}: {
  rotas?: { coordenadas: [number, number][]; cor?: string; tracejada?: boolean; peso?: number; opacidade?: number }[]; // [lng, lat]
  marcadores?: Marcador[];
  altura?: number;
  onClique?: (lat: number, lng: number) => void;
  enquadrar?: { lat: number; lng: number }[]; // pontos para dar zoom (padrao: tudo)
}) {
  const linhas = rotas.map((r) => ({ ...r, latlng: r.coordenadas.map(([lng, lat]) => [lat, lng] as [number, number]) }));
  const enquadrar: [number, number][] = focar?.length ? focar.map((p) => [p.lat, p.lng] as [number, number]) : [
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
          <Polyline key={i} positions={l.latlng} pathOptions={{ color: l.cor ?? "#0f766e", weight: l.peso ?? 5, opacity: l.opacidade ?? 0.85, dashArray: l.tracejada ? "2 9" : undefined, lineCap: "round" }} />
        ))}
        {marcadores.map((m, i) =>
          m.icone ? (
            <Marker key={i} position={[m.lat, m.lng]} icon={iconeEmoji(m.icone)} zIndexOffset={1000}>
              <Tooltip direction="top" offset={[0, -18]}>{m.rotulo}</Tooltip>
            </Marker>
          ) : (
          <CircleMarker
            key={i}
            center={[m.lat, m.lng]}
            radius={9}
            pathOptions={{ color: "#fff", weight: 3, fillColor: m.cor, fillOpacity: 1 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>{m.rotulo}</Tooltip>
          </CircleMarker>
          ),
        )}
        <Enquadrar pontos={enquadrar} />
        <Clique onClique={onClique} />
      </MapContainer>
    </div>
  );
}
