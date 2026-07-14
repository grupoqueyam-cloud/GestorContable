import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control Editorial Sustainability",
  description: "Gestión local cifrada de clientes, contratos, cartera e investigadores.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
