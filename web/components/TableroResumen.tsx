import { supabaseAdmin } from "@/lib/supabase/admin";
import { casosPublicos } from "@/lib/casos-publicos";
import { Revela } from "@/components/Revela";

const NOMBRE_NECESIDAD: Record<string, string> = {
  albergue: "Albergue", agua: "Agua", alimentos: "Alimentos", salud: "Salud",
  medicamentos: "Medicamentos", psicosocial: "Psicosocial", proteccion: "Protección", otra: "Otra",
};

/**
 * El tablero agregado que ve cualquiera que llegue a la URL de un caso:
 * cifras generales del registro (en vivo) + la lectura que la IA produce cada
 * 24 h. Ningún dato individual: eso exige verificación por WhatsApp.
 */
export default async function TableroResumen() {
  const { todos } = await casosPublicos();
  const hace24h = Date.now() - 24 * 60 * 60 * 1000;

  let personas = 0, sinVivienda = 0, urgentes = 0, conDictamen = 0, nuevos24h = 0;
  const dictamenes = { habitable: 0, uso_restringido: 0, no_habitable: 0 };
  const porNecesidad: Record<string, number> = {};
  const porMunicipio: Record<string, number> = {};
  for (const c of todos) {
    personas += c.num_personas ?? 0;
    if (c.sin_vivienda) sinVivienda++;
    if (c.hay_necesidad_urgente) urgentes++;
    if (c.dictamen) { conDictamen++; dictamenes[c.dictamen as keyof typeof dictamenes]++; }
    if (c.created_at && new Date(c.created_at).getTime() > hace24h) nuevos24h++;
    for (const n of c.necesidades_tipos ?? []) porNecesidad[n] = (porNecesidad[n] ?? 0) + 1;
    if (c.municipio_nombre) porMunicipio[c.municipio_nombre] = (porMunicipio[c.municipio_nombre] ?? 0) + 1;
  }
  const maxNecesidad = Math.max(1, ...Object.values(porNecesidad));
  const topMunicipios = Object.entries(porMunicipio).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const { data: lectura } = await supabaseAdmin()
    .from("insights_diarios")
    .select("generado_at, insights")
    .order("generado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const CIFRAS = [
    { n: todos.length, l: "casos registrados", extra: nuevos24h > 0 ? `+${nuevos24h} en 24 h` : null },
    { n: personas, l: "personas afectadas", extra: null },
    { n: sinVivienda, l: "casos sin vivienda", extra: null },
    { n: urgentes, l: "con necesidad urgente", extra: null },
    { n: conDictamen, l: "con concepto técnico", extra: null },
  ];

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* Cifras en vivo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {CIFRAS.map((s) => (
          <div key={s.l} className="tarjeta" style={{ padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "2rem", color: "var(--tinta)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {s.n.toLocaleString("es-CO")}
            </div>
            <div style={{ fontWeight: 700, fontSize: ".82rem", marginTop: 4 }}>{s.l}</div>
            {s.extra && <div style={{ fontSize: ".74rem", color: "var(--aguacero)", fontWeight: 700 }}>{s.extra}</div>}
          </div>
        ))}
      </div>

      <div className="caso-grid" style={{ alignItems: "start" }}>
        {/* Lectura de la IA */}
        <Revela>
          <div className="tarjeta" style={{ padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <h2 style={{ fontSize: "1.2rem" }}>La lectura del registro</h2>
              {lectura?.generado_at && (
                <span style={{ fontSize: ".74rem", color: "var(--arcilla)" }}>
                  Análisis del {new Date(lectura.generado_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {lectura?.insights ? (
              <ul style={{ listStyle: "none", display: "grid", gap: 12, marginTop: 14 }}>
                {(lectura.insights as string[]).map((t, i) => (
                  <li key={i} style={{ paddingLeft: 20, position: "relative", fontSize: ".95rem", lineHeight: 1.6 }}>
                    <span style={{ position: "absolute", left: 0, top: ".5em", width: 8, height: 8, borderRadius: "50%", background: "var(--aguacero)" }} />
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--arcilla)", marginTop: 12, fontSize: ".92rem" }}>
                El primer análisis del registro se publica en las próximas 24 horas.
              </p>
            )}
            <p style={{ fontSize: ".74rem", color: "var(--arcilla)", marginTop: 16, borderTop: "1px solid var(--borde-papel)", paddingTop: 10 }}>
              Resumen generado automáticamente por IA cada 24 h a partir de cifras agregadas y anonimizadas.
              El registro es evidencia ciudadana y no reemplaza el RUD ni los censos oficiales.
            </p>
          </div>
        </Revela>

        <aside style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {/* Dictámenes */}
          <Revela retraso={80}>
            <div className="tarjeta" style={{ padding: "18px 20px" }}>
              <h3 style={{ fontSize: ".95rem", marginBottom: 10 }}>Conceptos de habitabilidad</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {([["habitable", "Habitable", "ok"], ["uso_restringido", "Uso restringido", "warn"], ["no_habitable", "No habitable", "bad"]] as const).map(([k, nombre, cls]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`chip ${cls}`}>{nombre}</span>
                    <strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{dictamenes[k]}</strong>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="chip proceso">Sin dictamen aún</span>
                  <strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{todos.length - conDictamen}</strong>
                </div>
              </div>
            </div>
          </Revela>

          {/* Necesidades */}
          <Revela retraso={140}>
            <div className="tarjeta" style={{ padding: "18px 20px" }}>
              <h3 style={{ fontSize: ".95rem", marginBottom: 10 }}>Necesidades abiertas</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(porNecesidad).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
                  <div key={tipo} style={{ display: "grid", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem" }}>
                      <span>{NOMBRE_NECESIDAD[tipo] ?? tipo}</span>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{n}</strong>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: "var(--bruma)" }}>
                      <div style={{ height: "100%", borderRadius: 99, width: `${(n / maxNecesidad) * 100}%`, background: "var(--aguacero)" }} />
                    </div>
                  </div>
                ))}
                {Object.keys(porNecesidad).length === 0 && (
                  <p style={{ fontSize: ".85rem", color: "var(--arcilla)" }}>Sin necesidades abiertas registradas.</p>
                )}
              </div>
            </div>
          </Revela>

          {/* Municipios */}
          <Revela retraso={200}>
            <div className="tarjeta" style={{ padding: "18px 20px" }}>
              <h3 style={{ fontSize: ".95rem", marginBottom: 10 }}>Municipios con más casos</h3>
              <ol style={{ listStyle: "none", display: "grid", gap: 6 }}>
                {topMunicipios.map(([m, n], i) => (
                  <li key={m} style={{ display: "flex", gap: 10, fontSize: ".88rem" }}>
                    <span style={{ color: "var(--arcilla)", fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
                    {m}
                    <strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{n}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </Revela>
        </aside>
      </div>
    </div>
  );
}
