import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Simbolo, Wordmark } from "@/components/Logo";
import { Sello, type Dictamen } from "@/components/Sello";
import { FormEvaluacion, VerContacto, LiberarCaso } from "./cliente";

export const dynamic = "force-dynamic";

export default async function CasoPortal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/profesionales");

  const { data: caso } = await db.from("casos").select("*").eq("id", id).maybeSingle();
  if (!caso) notFound();

  const esMio = caso.asignado_a === user.id;
  const [{ data: necesidades }, { data: evaluaciones }, { data: eventos }, { data: evidencias }] = await Promise.all([
    db.from("necesidades").select("*").eq("caso_id", id).order("created_at"),
    db.from("evaluaciones").select("*").eq("caso_id", id).order("created_at", { ascending: false }),
    esMio ? db.from("caso_eventos").select("*").eq("caso_id", id).order("created_at") : Promise.resolve({ data: [] }),
    esMio ? db.from("evidencias").select("*").eq("caso_id", id).order("created_at") : Promise.resolve({ data: [] }),
  ]);

  // URLs firmadas de la evidencia (bucket privado): solo el asignado llega aquí
  const fotos: { path: string; url: string; tipo: string; transcripcion: string | null }[] = [];
  for (const ev of evidencias ?? []) {
    const { data: firma } = await db.storage.from("evidencias").createSignedUrl(ev.storage_path, 3600);
    if (firma?.signedUrl) fotos.push({ path: ev.storage_path, url: firma.signedUrl, tipo: ev.tipo, transcripcion: ev.transcripcion });
  }

  const ultima = evaluaciones?.[0];

  return (
    <>
      <header className="contenedor" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Simbolo size={30} /><Wordmark />
        </Link>
        <Link href="/portal" style={{ fontWeight: 600, textDecoration: "none" }}>← Volver al portal</Link>
      </header>

      <main className="contenedor" style={{ maxWidth: 860, paddingBottom: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h1 className="codigo" style={{ fontFamily: "var(--font-texto)", fontSize: "1.8rem" }}>{caso.codigo_publico}</h1>
          <span className="chip proceso">{caso.estado}</span>
        </div>
        <p style={{ color: "#6B655C" }}>
          {[caso.direccion, caso.barrio, caso.municipio_nombre].filter(Boolean).join(" · ") || "Sin dirección registrada"}
        </p>

        <section className="tarjeta" style={{ padding: 20, margin: "16px 0", display: "grid", gap: 8 }}>
          <div className="etiqueta">El hogar</div>
          <p style={{ fontSize: ".95rem" }}>
            {caso.num_habitantes ?? "?"} personas
            {caso.num_menores ? ` · ${caso.num_menores} menores` : ""}
            {caso.num_adultos_mayores ? ` · ${caso.num_adultos_mayores} adultos mayores` : ""}
            {caso.hay_discapacidad ? " · hay discapacidad" : ""}
            {caso.sin_vivienda ? " · ⛺ SIN VIVIENDA" : ""}
            {caso.es_colectivo ? ` · 👥 colectivo (${caso.num_familias} familias)` : ""}
          </p>
          {caso.descripcion && <p style={{ fontSize: ".95rem", color: "#4A5568" }}>“{caso.descripcion}”</p>}
          {(necesidades ?? []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(necesidades ?? []).map((n) => (
                <span key={n.id} className="chip" style={n.urgente ? { outline: "2px solid var(--bad)" } : undefined}>
                  {n.tipo}{n.urgente ? " ‼️" : ""}{n.estado !== "abierta" ? ` (${n.estado})` : ""}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            {esMio && <VerContacto casoId={id} />}
            {esMio && <LiberarCaso casoId={id} />}
            {caso.ubicacion && esMio && (
              <a className="boton secundario" style={{ padding: "6px 16px", fontSize: ".85rem" }} href={`https://maps.google.com/?q=${encodeURIComponent(caso.direccion ?? caso.codigo_publico)}`} target="_blank" rel="noreferrer">
                Abrir en Maps
              </a>
            )}
          </div>
          {!esMio && <p style={{ fontSize: ".85rem", color: "#6B655C" }}>El contacto y la evidencia solo son visibles para el profesional asignado — cada consulta queda en bitácora.</p>}
        </section>

        {fotos.length > 0 && (
          <section className="tarjeta" style={{ padding: 20, margin: "16px 0" }}>
            <div className="etiqueta" style={{ marginBottom: 10 }}>Evidencia de la familia (sin filtros: es prueba)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {fotos.map((f) =>
                f.tipo === "foto" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.path} src={f.url} alt="Evidencia del caso" style={{ borderRadius: 8, aspectRatio: "1", objectFit: "cover" }} />
                ) : (
                  <div key={f.path} style={{ background: "var(--bruma)", borderRadius: 8, padding: 10, fontSize: ".8rem" }}>
                    <audio controls src={f.url} style={{ width: "100%" }} />
                    {f.transcripcion && <p style={{ marginTop: 6, fontStyle: "italic" }}>“{f.transcripcion.slice(0, 160)}…”</p>}
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {ultima ? (
          <section className="tarjeta" style={{ padding: 20, margin: "16px 0", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <Sello dictamen={ultima.dictamen as Dictamen} fecha={ultima.created_at} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="etiqueta">Dictamen vigente</div>
              <p style={{ fontSize: ".95rem" }}>{ultima.recomendacion ?? "Sin recomendación registrada"}</p>
              {ultima.observaciones && <p style={{ fontSize: ".85rem", color: "#6B655C" }}>{ultima.observaciones}</p>}
            </div>
          </section>
        ) : null}

        {esMio && (
          <section className="tarjeta" style={{ padding: 20, margin: "16px 0" }}>
            <div className="etiqueta" style={{ marginBottom: 10 }}>{ultima ? "Nueva evaluación (corrige la anterior)" : "Registrar evaluación de la visita"}</div>
            <FormEvaluacion casoId={id} />
          </section>
        )}

        {(eventos ?? []).length > 0 && (
          <section style={{ margin: "16px 0" }}>
            <div className="etiqueta" style={{ marginBottom: 8 }}>Bitácora</div>
            <ul style={{ listStyle: "none", display: "grid", gap: 4, fontSize: ".85rem", color: "#4A5568" }}>
              {(eventos ?? []).map((e) => (
                <li key={e.id}>
                  <span className="codigo" style={{ letterSpacing: 0, fontWeight: 600 }}>
                    {new Date(e.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>{" — "}{e.accion.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
