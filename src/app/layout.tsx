import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SessaoProvider } from "@/components/Sessao";
import Navegacao from "@/components/Navegacao";
import Topo from "@/components/Topo";

const fonte = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cadê a carona",
  description: "Carona na rota de quem já está indo, pelo preço do ônibus.",
  appleWebApp: { capable: true, title: "Cadê a carona", statusBarStyle: "default" },
  icons: { icon: "/icone-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0b5d57", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${fonte.variable} antialiased`}>
        <SessaoProvider>
          <Topo />
          <main className="mx-auto min-h-screen max-w-lg pb-28">{children}</main>
          <Navegacao />
        </SessaoProvider>
      </body>
    </html>
  );
}
