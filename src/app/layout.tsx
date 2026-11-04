import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessaoProvider } from "@/components/Sessao";
import Navegacao from "@/components/Navegacao";
import Notificacoes from "@/components/Notificacoes";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vai de carona",
  description: "Carona na rota de quem já está indo, pelo preço do ônibus.",
  appleWebApp: { capable: true, title: "Vai de carona", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased`}>
        <SessaoProvider>
          <main className="mx-auto min-h-screen max-w-lg pb-24 pt-12">{children}</main>
          <Notificacoes />
          <Navegacao />
        </SessaoProvider>
      </body>
    </html>
  );
}
