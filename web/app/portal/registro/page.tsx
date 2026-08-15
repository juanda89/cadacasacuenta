import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { casosPublicos } from "@/lib/casos-publicos";
import { Simbolo, Wordmark } from "@/components/Logo";
import ListaRegistro from "@/components/ListaRegistro";
import { Salir } from "../acciones";

export const dynamic = "force-dynamic";

/**
 * El registro como lista: SOLO para profesionales y admins con sesión
 * (decisión de producto 2026-08-15: el listado en bloque no es público;
 * el mapa anonimizado sí). El middleware ya protege /portal/*.
 */
export default async function RegistroPortal() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/profesionales");

  const { todos } = await casosPublicos();

  return (
    <>
      <header className="cabecera">
        <div className="cabecera-fila">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Simbolo size={28} />
            <Wordmark />
          </Link>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Link href="/portal" style={{ fontWeight: 600, textDecoration: "none" }}>← Portal</Link>
            <Salir />
          </div>
        </div>
      </header>
      <div style={{ height: 64 }} />
      <main className="contenedor" style={{ padding: "36px 24px 72px" }}>
        <span className="kicker" style={{ color: "var(--aguacero)" }}>El registro, caso por caso</span>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", margin: "12px 0 6px", maxWidth: "24ch" }}>
          Lo que el mapa muestra, aquí se puede leer.
        </h1>
        <p style={{ maxWidth: "62ch", color: "var(--arcilla)", marginBottom: 8 }}>
          Cada fila es una edificación reportada, con personas afectadas, estado y necesidades.
          Los exportes (CSV, GeoJSON y Shapefile en MAGNA-SIRGAS EPSG:3116) descargan el registro
          completo — por eso esta vista es solo para profesionales y autoridades con sesión.
        </p>
        <ListaRegistro casos={todos} />
      </main>
    </>
  );
}
