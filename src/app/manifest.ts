import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cadê a carona",
    short_name: "Cadê a carona",
    description: "Carona na rota de quem já está indo, pelo preço do ônibus.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f6f5",
    theme_color: "#0b5d57",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
