import { notFound } from "next/navigation";
import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { Sello, type Dictamen } from "@/components/Sello";
import { Revela } from "@/components/Revela";
import MapaMini from "@/components/MapaMini";
import { casoPublicoDetalle } from "@/lib/casos-publicos";

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

const PASOS_ESTADO = ["reportado", "asignado", "visitado", "evaluado", "cerrado"] as const;
const NOMBRE_ESTADO: Record<string, string> = {
  reportado: "Reportado",
  asignado: "Profesional asignado",
  visitado: "Visitado",
  evaluado: "Evaluado",
  cerrado: "Cerrado",
};

export default async function CasoPublico({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const detalle = await casoPublicoDetalle(codigo);
  if (!detalle) notFound();
  const { caso, evidencias } = detalle;

  const fotos = evidencias.filter((e) => e.tipo === "foto" && e.url);
  const audios = evidencias.filter((e) => e.tipo === "audio");
  const documentos = evidencias.filter((e) => e.tipo === "documento" && e.url);
  const pasoActual = Math.max(0, PASOS_ESTADO.indexOf(caso.estado));
  const lugar = [caso.barrio, caso.municipio_nombre, caso.departamento_nombre].filter(Boolean).join(" · ");

  return (
    <>
      <Cabecera conMapa />
      <div style={{ height: 64 }} />

      {/* ---- Encabezado del caso: la constancia ---- */}
      <section style={{ background: "var(--bruma)", borderBottom: "1px solid var(--borde-papel)" }}>
        <div className="contenedor" style={{ padding: "40px 24px 34px" }}>
          <a href="/#mapa" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, textDecoration: "none", fontSize: ".88rem", marginBottom: 18 }}>
            ← Volver al mapa
          </a>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <span className="kicker" style={{ color: "var(--aguacero)" }}>Constancia pública de registro</span>
              <h1 className="codigo" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.2rem, 6vw, 3.4rem)", letterSpacing: ".06em", margin: "10px 0 6px" }}>
                {caso.codigo_publico}
              </h1>
              <p style={{ color: "var(--arcilla)", fontSize: ".95rem" }}>
                {lugar || "Ubicación en verificación"} — reportado el{" "}
                {new Date(caso.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                {caso.tiene_dano_estructural && <span className="chip">🏚 Daño estructural</span>}
                {caso.sin_vivienda && <span className="chip">⛺ Familia sin vivienda</span>}
                {caso.es_colectivo && <span className="chip">👥 {caso.num_familias} familias</span>}
                {caso.hay_necesidad_urgente && <span className="chip bad">Necesidad urgente</span>}
              </div>
            </div>
            {caso.dictamen ? (
              <div style={{ background: "var(--papel-alto)", border: "1px solid var(--borde-papel)", borderRadius: 16, padding: "14px 18px", boxShadow: "var(--sombra-recorte)" }}>
                <Sello dictamen={caso.dictamen as Dictamen} fecha={caso.dictamen_at} size={132} />
              </div>
            ) : null}
          </div>

          {/* Línea de estado: dónde va el caso */}
          <ol className="linea-estado" aria-label="Estado del caso">
            {PASOS_ESTADO.map((p, i) => (
              <li key={p} className={i <= pasoActual ? "hecho" : ""}>
                <i />
                <span>{NOMBRE_ESTADO[p]}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <main className="contenedor" style={{ padding: "36px 24px 72px" }}>
        <div className="caso-grid">
          {/* ---- Columna principal ---- */}
          <div style={{ display: "grid", gap: 26, alignContent: "start" }}>
            {caso.historia && (
              <Revela>
                <blockquote
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: "clamp(1.15rem, 2.4vw, 1.45rem)",
                    lineHeight: 1.5,
                    color: "var(--tinta)",
                    borderLeft: "3px solid var(--aguacero)",
                    paddingLeft: 18,
                  }}
                >
                  “{caso.historia}”
                  <footer style={{ fontFamily: "var(--font-texto)", fontStyle: "normal", fontSize: ".8rem", color: "var(--arcilla)", marginTop: 8 }}>
                    — contado por la familia, publicado con su autorización
                  </footer>
                </blockquote>
              </Revela>
            )}

            {/* Evidencias */}
            <Revela>
              <section>
                <h2 style={{ fontSize: "1.25rem", marginBottom: 4 }}>La evidencia</h2>
                <p style={{ fontSize: ".85rem", color: "var(--arcilla)", marginBottom: 14 }}>
                  Lo que la familia envió por WhatsApp queda archivado con el caso: nadie puede decir que no pasó.
                </p>
                {fotos.length === 0 && audios.length === 0 && documentos.length === 0 && (
                  <div className="tarjeta" style={{ padding: "22px 24px", color: "var(--arcilla)", fontSize: ".92rem" }}>
                    Este caso aún no tiene evidencia adjunta. La familia puede enviarla al WhatsApp oficial
                    con su código de caso.
                  </div>
                )}
                {fotos.length > 0 && (
                  <div className="galeria">
                    {fotos.map((f, i) => (
                      <a key={i} href={f.url!} target="_blank" rel="noopener noreferrer" className="galeria-foto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url!} alt={`Evidencia fotográfica ${i + 1} del caso`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                {audios.length > 0 && (
                  <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                    {audios.map((a, i) => (
                      <div key={i} className="tarjeta" style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: a.transcripcion ? 8 : 0 }}>
                          <span aria-hidden="true">🎙</span>
                          <strong style={{ fontSize: ".88rem" }}>Nota de voz de la familia</strong>
                          {a.url && (
                            <audio controls preload="none" src={a.url} style={{ marginLeft: "auto", height: 32, maxWidth: 220 }} />
                          )}
                        </div>
                        {a.transcripcion && (
                          <p style={{ fontSize: ".9rem", color: "var(--grafito)", fontStyle: "italic", lineHeight: 1.6 }}>
                            “{a.transcripcion}”
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {documentos.length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    {documentos.map((d, i) => (
                      <a key={i} href={d.url!} target="_blank" rel="noopener noreferrer" className="chip" style={{ textDecoration: "none" }}>
                        📄 Documento {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </section>
            </Revela>

            {/* Necesidades */}
            {Array.isArray(caso.necesidades_tipos) && caso.necesidades_tipos.length > 0 && (
              <Revela>
                <section>
                  <h2 style={{ fontSize: "1.25rem", marginBottom: 10 }}>
                    Necesidades abiertas{caso.hay_necesidad_urgente ? " · hay urgentes" : ""}
                  </h2>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {caso.necesidades_tipos.map((t: string) => (
                      <span key={t} className="chip" style={{ fontSize: ".88rem", padding: "7px 15px" }}>
                        {NOMBRE_NECESIDAD[t] ?? t}
                      </span>
                    ))}
                  </div>
                </section>
              </Revela>
            )}
          </div>

          {/* ---- Columna lateral ---- */}
          <aside style={{ display: "grid", gap: 18, alignContent: "start" }}>
            <Revela>
              <div className="tarjeta" style={{ overflow: "hidden" }}>
                {caso.lat != null && caso.lng != null ? (
                  <>
                    <MapaMini lat={caso.lat} lng={caso.lng} dictamen={caso.dictamen} />
                    <div style={{ padding: "12px 16px", fontSize: ".78rem", color: "var(--arcilla)", borderTop: "1px solid var(--borde-papel)" }}>
                      Zona aproximada. La ubicación pública está redondeada (~110 m) para proteger a la familia;
                      la exacta solo la ve el profesional que toma el caso.
                    </div>
                  </>
                ) : (
                  <div style={{ padding: "18px 16px", fontSize: ".88rem", color: "var(--arcilla)" }}>
                    Este caso aún no tiene pin de ubicación. La familia puede enviarlo por WhatsApp
                    (clip 📎 → Ubicación).
                  </div>
                )}
              </div>
            </Revela>

            <Revela retraso={100}>
              <div className="tarjeta" style={{ padding: "18px 20px" }}>
                <h3 style={{ fontSize: ".98rem", marginBottom: 8 }}>
                  {caso.dictamen ? "Sobre el concepto técnico" : "Qué sigue"}
                </h3>
                <p style={{ fontSize: ".85rem", color: "var(--arcilla)", lineHeight: 1.65 }}>
                  {caso.dictamen
                    ? "El concepto de habitabilidad fue emitido por un profesional voluntario acreditado a partir de la evidencia y/o visita del caso. Es orientativo para la familia y las autoridades."
                    : "Un ingeniero o arquitecto voluntario revisará la evidencia de este caso y emitirá el concepto de habitabilidad: el sello que dice si la edificación es segura."}
                </p>
              </div>
            </Revela>

            <Revela retraso={160}>
              <div className="tarjeta" style={{ padding: "18px 20px", background: "var(--bruma)", border: "none" }}>
                <h3 style={{ fontSize: ".98rem", marginBottom: 8 }}>¿Este caso es suyo?</h3>
                <p style={{ fontSize: ".85rem", color: "var(--arcilla)", lineHeight: 1.65, marginBottom: 12 }}>
                  Puede actualizarlo cuando quiera (nuevas fotos, cambios, correcciones) escribiendo al
                  WhatsApp oficial con su código.
                </p>
                <a className="boton" style={{ padding: "10px 20px", fontSize: ".92rem" }} href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "+573137821926").replace("+", "")}?text=${encodeURIComponent(`Hola, quiero actualizar mi caso ${caso.codigo_publico}`)}`}>
                  Actualizar mi caso
                </a>
              </div>
            </Revela>
          </aside>
        </div>

        <p style={{ fontSize: ".8rem", color: "var(--arcilla)", marginTop: 30, maxWidth: "70ch" }}>
          Esta página es la constancia pública del caso: no muestra nombres, teléfonos ni la ubicación exacta.
          Los datos se tratan conforme a la <a href="/datos">política de tratamiento de datos</a> (Ley 1581 de 2012).
        </p>
      </main>
      <Pie />
    </>
  );
}
