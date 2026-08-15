import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { Sello, type Dictamen } from "@/components/Sello";

export const revalidate = 60;

const NOMBRE_NECESIDAD: Record<string, string> = {
  albergue: "Albergue",
  agua: "Agua",
  alimentos: "Alimentos",
  salud: "Salud",
  medicamentos: "Medicamentos",
  psicosocial: "Atención psicosocial",
  proteccion: "Protección",
  otra: "Otra necesidad",
};

export default async function CasoPublico({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: caso } = await db
    .from("caso_publico")
    .select("*")
    .eq("codigo_publico", codigo.toUpperCase())
    .maybeSingle();

  if (!caso) notFound();

  const estadoTexto: Record<string, string> = {
    reportado: "Reportado — esperando profesional",
    asignado: "Un profesional tomó este caso",
    visitado: "Visitado",
    evaluado: "Evaluado",
    cerrado: "Cerrado",
  };

  return (
    <>
      <Cabecera />
      <div style={{ height: 64 }} />

      <main className="contenedor" style={{ maxWidth: 720, paddingBottom: 72 }}>
        <a href="/#mapa" style={{ display: "inline-block", fontWeight: 600, textDecoration: "none", margin: "22px 0 4px", fontSize: ".9rem" }}>
          ← Volver al mapa
        </a>
        <div className="tarjeta" style={{ padding: "30px 32px", marginTop: 10 }}>
          <div className="etiqueta">Caso registrado</div>
          <h1 className="codigo" style={{ fontSize: "clamp(1.6rem, 5vw, 2.3rem)", fontFamily: "var(--font-texto)", margin: "6px 0 2px" }}>
            {caso.codigo_publico}
          </h1>
          <p style={{ color: "#6B655C", fontSize: ".95rem" }}>
            {[caso.barrio, caso.municipio_nombre, caso.departamento_nombre].filter(Boolean).join(" · ")}
            {" — "}reportado el {new Date(caso.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            <span className="chip proceso">{estadoTexto[caso.estado] ?? caso.estado}</span>
            {caso.tiene_dano_estructural && <span className="chip">🏚 Daño estructural</span>}
            {caso.sin_vivienda && <span className="chip">⛺ Familia sin vivienda</span>}
            {caso.es_colectivo && <span className="chip">👥 {caso.num_familias} familias</span>}
          </div>

          {caso.dictamen ? (
            <div style={{ display: "flex", gap: 22, alignItems: "center", background: "var(--bruma)", borderRadius: 10, padding: "18px 22px", margin: "18px 0" }}>
              <Sello dictamen={caso.dictamen as Dictamen} fecha={caso.dictamen_at} />
              <p style={{ fontSize: ".92rem", color: "#4A5568", maxWidth: "34ch" }}>
                Dictamen de habitabilidad emitido en visita por un profesional voluntario acreditado.
              </p>
            </div>
          ) : (
            <p style={{ background: "var(--bruma)", borderRadius: 10, padding: "14px 18px", fontSize: ".92rem", color: "#4A5568", margin: "18px 0" }}>
              Este caso aún no tiene dictamen técnico. Un ingeniero o arquitecto voluntario lo visitará.
            </p>
          )}

          {Array.isArray(caso.necesidades_tipos) && caso.necesidades_tipos.length > 0 && (
            <>
              <div className="etiqueta" style={{ marginTop: 18 }}>Necesidades abiertas{caso.hay_necesidad_urgente ? " · hay urgentes" : ""}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {caso.necesidades_tipos.map((t: string) => (
                  <span key={t} className="chip">{NOMBRE_NECESIDAD[t] ?? t}</span>
                ))}
              </div>
            </>
          )}

          {caso.historia && (
            <blockquote style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.15rem", color: "var(--tinta)", borderLeft: "3px solid var(--lavado)", paddingLeft: 16, marginTop: 22 }}>
              “{caso.historia}”
              <footer style={{ fontFamily: "var(--font-texto)", fontStyle: "normal", fontSize: ".8rem", color: "#6B655C", marginTop: 6 }}>
                — contado por la familia, publicado con su autorización
              </footer>
            </blockquote>
          )}
        </div>

        <p style={{ fontSize: ".8rem", color: "#6B655C", marginTop: 16, maxWidth: "62ch" }}>
          Esta página es la constancia pública del caso: no muestra nombres, teléfonos ni la ubicación
          exacta de la vivienda. La familia puede actualizar su caso escribiendo al WhatsApp oficial con su código.
        </p>
      </main>
      <Pie />
    </>
  );
}
