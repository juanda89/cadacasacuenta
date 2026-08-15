import Link from "next/link";
/* eslint-disable @next/next/no-img-element */

const WA = `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "+573137821926").replace("+", "")}?text=${encodeURIComponent("Hola, quiero reportar")}`;

/**
 * Cabecera de vidrio compartida. Fija, translúcida (Apple por fuera,
 * papel por dentro). Cada página que la use debe dejar el hueco con
 * <div style={{ height: 64 }} /> salvo que el hero pase por debajo.
 */
export function Cabecera({ conMapa = false }: { conMapa?: boolean }) {
  return (
    <header className="cabecera">
      <div className="cabecera-fila">
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }} aria-label="Cada Casa Cuenta — inicio">
          <img src="/ilustraciones/logo-papel.webp" alt="Cada Casa Cuenta" className="logo-cabecera" />
        </Link>
        <nav>
          {/* Ruta absoluta: desde cualquier página lleva a la portada y baja
              al mapa; en la portada se comporta como el ancla de siempre. */}
          {conMapa && (
            <a href="/#mapa" className="oculta-movil">
              El mapa
            </a>
          )}
          <Link href="/profesionales" className="oculta-movil">
            Soy profesional
          </Link>
          <a href={WA} className="boton-nav">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5 13.9c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.5c-2.6-1.1-4.3-3.7-4.4-3.9-.1-.2-1-1.4-1-2.7s.6-1.9.9-2.1c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c0 .2.1.3 0 .5l-.3.5-.4.5c-.2.1-.3.3-.1.6.1.3.7 1.1 1.4 1.8 1 .9 1.8 1.1 2 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.1.1.5-.1 1Z" />
            </svg>
            Reportar
          </a>
        </nav>
      </div>
    </header>
  );
}

export const WHATSAPP_URL = WA;
