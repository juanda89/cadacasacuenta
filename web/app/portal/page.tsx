import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Simbolo, Wordmark } from "@/components/Logo";
import { TomarCaso, Salir } from "./acciones";

export const dynamic = "force-dynamic";

export default async function Portal() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/profesionales");

  const { data: perfil } = await db.from("profesionales").select("*").eq("id", user.id).maybeSingle();
  if (!perfil) redirect("/profesionales");

  const activo = ["pendiente", "verificado"].includes(perfil.estado_verificacion) && !!perfil.evidencia_matricula_path;

  const { data: cola } = activo
    ? await db
        .from("casos_priorizados")
        .select("id, codigo_publico, municipio_nombre, barrio, estado, prioridad, sin_vivienda, es_colectivo, num_familias, hay_necesidad_urgente, asignado_a, descripcion")
        .neq("estado", "cerrado")
        .order("prioridad", { ascending: false })
        .limit(120)
    : { data: [] };

  const mios = (cola ?? []).filter((c) => c.asignado_a === user.id);
  const libres = (cola ?? []).filter((c) => c.asignado_a === null);

  return (
    <>
      <header className="contenedor" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Simbolo size={30} />
          <Wordmark />
        </Link>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className={perfil.estado_verificacion === "verificado" ? "chip ok" : "chip"}>
            {perfil.estado_verificacion === "verificado" ? "✓ Verificado" : "Pendiente de verificación"}
          </span>
          <Salir />
        </div>
      </header>

      <main className="contenedor" style={{ paddingBottom: 60 }}>
        <h1 style={{ fontSize: "1.6rem", margin: "6px 0 4px" }}>Hola, {perfil.nombre.split(" ")[0]}</h1>

        {!activo && (
          <p className="tarjeta" style={{ padding: 16, margin: "12px 0", borderColor: "var(--warn-texto)" }}>
            {perfil.evidencia_matricula_path
              ? "Su cuenta no está habilitada para tomar casos. Si cree que es un error, escríbanos."
              : "Falta la evidencia de su matrícula: súbala desde el registro para poder tomar casos."}
          </p>
        )}

        {mios.length > 0 && (
          <>
            <h2 style={{ fontSize: "1.15rem", margin: "18px 0 8px" }}>Mis casos ({mios.length})</h2>
            <Tabla casos={mios} uid={user.id} />
          </>
        )}

        <h2 style={{ fontSize: "1.15rem", margin: "22px 0 8px" }}>
          Casos esperando profesional ({libres.length}) — ordenados por urgencia
        </h2>
        <p style={{ fontSize: ".85rem", color: "#6B655C", marginBottom: 10 }}>
          El puntaje pondera: familias sin techo, menores, discapacidad, adultos mayores, hacinamiento,
          reportes colectivos y necesidades urgentes.
        </p>
        {activo ? <Tabla casos={libres} uid={user.id} /> : null}
      </main>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Tabla({ casos, uid }: { casos: any[]; uid: string }) {
  if (casos.length === 0) {
    return (
      <div className="tarjeta" style={{ padding: 24, textAlign: "center" }}>
        {/* Estado vacío: la casita del mundo de papel */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/casita.jpg" alt="" width={120} style={{ margin: "0 auto 8px", borderRadius: 8 }} />
        <p style={{ color: "#6B655C" }}>No hay casos aquí por ahora.</p>
      </div>
    );
  }
  return (
    <div className="tarjeta" style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Código</th><th>Municipio</th><th>Señales</th><th style={{ textAlign: "right" }}>Prioridad</th><th></th>
          </tr>
        </thead>
        <tbody>
          {casos.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/portal/caso/${c.id}`} className="codigo" style={{ textDecoration: "none" }}>{c.codigo_publico}</Link></td>
              <td>{[c.barrio, c.municipio_nombre].filter(Boolean).join(", ")}</td>
              <td style={{ fontSize: ".85rem" }}>
                {c.sin_vivienda && "⛺ "}
                {c.es_colectivo && `👥×${c.num_familias} `}
                {c.hay_necesidad_urgente && "‼️ "}
                {(c.descripcion ?? "").slice(0, 60)}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "var(--tinta)" }}>{c.prioridad}</td>
              <td>{c.asignado_a === uid
                ? <Link href={`/portal/caso/${c.id}`} className="chip proceso" style={{ textDecoration: "none" }}>Abrir</Link>
                : <TomarCaso casoId={c.id} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
