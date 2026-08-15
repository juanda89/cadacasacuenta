import { cookies } from "next/headers";
import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { COOKIE_SEGUIMIENTO, verificaToken } from "@/lib/seguimiento";
import TableroResumen from "@/components/TableroResumen";
import SeguimientoCaso from "./SeguimientoCaso";
import DetalleCaso from "./detalle";

export const dynamic = "force-dynamic";

/**
 * La URL del caso (la que el bot le da a cada familia).
 *
 * Decisión de privacidad (2026-08-15): el detalle individual NO es público.
 * Sin verificación se muestra el tablero agregado del registro (con la lectura
 * de IA de cada 24 h) y el botón "Hacer seguimiento a mi caso": teléfono → OTP
 * por WhatsApp → cookie firmada → detalle. La página es deliberadamente neutra
 * ante códigos inexistentes (anti-enumeración).
 */
export default async function CasoPagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const jar = await cookies();
  const verificado = verificaToken(jar.get(COOKIE_SEGUIMIENTO)?.value, codigo);

  if (verificado) {
    return (
      <>
        <Cabecera conMapa />
        <div style={{ height: 64 }} />
        <DetalleCaso codigo={codigo} />
        <Pie />
      </>
    );
  }

  return (
    <>
      <Cabecera conMapa />
      <div style={{ height: 64 }} />

      <section style={{ background: "var(--bruma)", borderBottom: "1px solid var(--borde-papel)" }}>
        <div className="contenedor" style={{ padding: "40px 24px 34px" }}>
          <a href="/#mapa" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, textDecoration: "none", fontSize: ".88rem", marginBottom: 18 }}>
            ← Volver al mapa
          </a>
          <span className="kicker" style={{ color: "var(--aguacero)" }}>Registro · caso</span>
          <h1 className="codigo" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.2rem, 6vw, 3.4rem)", letterSpacing: ".06em", margin: "10px 0 6px" }}>
            {codigo.toUpperCase()}
          </h1>
          <p style={{ color: "var(--arcilla)", fontSize: ".95rem", maxWidth: "62ch" }}>
            Por la privacidad de cada familia, el detalle individual no es público. Aquí está el estado
            general del registro; si este caso es suyo, verifíquese abajo con su número de WhatsApp.
          </p>
        </div>
      </section>

      <main className="contenedor" style={{ padding: "30px 24px 72px", display: "grid", gap: 26 }}>
        <SeguimientoCaso codigo={codigo.toUpperCase()} />
        <TableroResumen />
        <p style={{ fontSize: ".8rem", color: "var(--arcilla)", maxWidth: "70ch" }}>
          Las cifras de este tablero son agregadas y anonimizadas. Los datos se tratan conforme a la{" "}
          <a href="/datos">política de tratamiento de datos</a> (Ley 1581 de 2012).
        </p>
      </main>
      <Pie />
    </>
  );
}
