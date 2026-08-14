import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
});
const texto = Public_Sans({ subsets: ["latin"], variable: "--font-texto" });

export const metadata: Metadata = {
  title: "Cada Casa Cuenta",
  description:
    "Registro humanitario de vivienda y necesidades del terremoto del Chocó 2026. Reporte por WhatsApp, dictamen de profesionales voluntarios y mapa público en tiempo real. Ninguna familia sin contar.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${display.variable} ${texto.variable}`}>{children}</body>
    </html>
  );
}
