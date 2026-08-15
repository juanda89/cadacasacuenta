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
    "Registro humanitario del terremoto de Colombia 2026 (Chocó, Caldas, Valle del Cauca, Risaralda y Quindío). Casas, edificios, locales y sedes comunitarias: reporte por WhatsApp, acompañamiento de profesionales voluntarios y mapa público en tiempo real. Ninguna familia sin contar.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Marca que el JS está vivo: los reveals solo ocultan contenido si esto corrió */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className={`${display.variable} ${texto.variable}`}>{children}</body>
    </html>
  );
}
