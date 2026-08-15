"use client";

import { useMemo, useState } from "react";
import type { PuntoMapa } from "@/components/MapaSituacion";

const ETIQUETA: Record<string, string> = {
  habitable: "Habitable",
  uso_restringido: "Uso restringido",
  no_habitable: "No habitable",
};
const NOMBRE_NECESIDAD: Record<string, string> = {
  albergue: "Albergue", agua: "Agua", alimentos: "Alimentos", salud: "Salud",
  medicamentos: "Medicamentos", psicosocial: "Psicosocial", proteccion: "Protección", otra: "Otra",
};

type Filtro = "todos" | "sin_dictamen" | "habitable" | "uso_restringido" | "no_habitable" | "sin_vivienda" | "urgentes";

const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: "todos", nombre: "Todos" },
  { id: "urgentes", nombre: "‼️ Urgentes" },
  { id: "sin_vivienda", nombre: "⛺ Sin vivienda" },
  { id: "sin_dictamen", nombre: "Sin dictamen" },
  { id: "habitable", nombre: "✓ Habitables" },
  { id: "uso_restringido", nombre: "▲ Uso restringido" },
  { id: "no_habitable", nombre: "✕ No habitables" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ListaRegistro({ casos }: { casos: (PuntoMapa & Record<string, any>)[] }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [limite, setLimite] = useState(50);

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return casos
      .filter((c) => {
        if (filtro === "urgentes" && !c.hay_necesidad_urgente) return false;
        if (filtro === "sin_vivienda" && !c.sin_vivienda) return false;
        if (filtro === "sin_dictamen" && c.dictamen) return false;
        if (["habitable", "uso_restringido", "no_habitable"].includes(filtro) && c.dictamen !== filtro) return false;
        if (!texto) return true;
        return [c.codigo_publico, c.municipio_nombre, c.barrio, c.departamento_nombre]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(texto));
      })
      .sort((a, b) => {
        const u = Number(b.hay_necesidad_urgente) - Number(a.hay_necesidad_urgente);
        if (u !== 0) return u;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      });
  }, [casos, q, filtro]);

  const visibles = filtrados.slice(0, limite);

  return (
    <section aria-label="Lista de casos del registro">
      {/* ---- Controles ---- */}
      <div className="registro-controles">
        <input
          type="search"
          placeholder="Buscar por código, municipio o barrio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar en el registro"
          style={{ maxWidth: 360 }}
        />
        <div className="registro-filtros" role="group" aria-label="Filtrar casos">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip ${filtro === f.id ? "proceso" : ""}`}
              style={{ cursor: "pointer", border: "1px solid #E4DCCB" }}
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
            >
              {f.nombre}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: ".85rem", color: "var(--arcilla)", fontVariantNumeric: "tabular-nums" }}>
            {filtrados.length.toLocaleString("es-CO")} de {casos.length.toLocaleString("es-CO")}
          </span>
          <a className="boton" style={{ padding: "8px 16px", fontSize: ".82rem" }} href="/api/exporta/casos?formato=csv">
            ⬇ CSV
          </a>
          <a
            className="boton"
            style={{ padding: "8px 16px", fontSize: ".82rem", background: "var(--bruma)", color: "var(--tinta)", boxShadow: "var(--sombra-papel)" }}
            href="/api/exporta/casos?formato=geojson"
          >
            ⬇ GeoJSON
          </a>
          <a
            className="boton"
            style={{ padding: "8px 16px", fontSize: ".82rem", background: "var(--bruma)", color: "var(--tinta)", boxShadow: "var(--sombra-papel)" }}
            href="/api/exporta/casos?formato=shp"
            title="Shapefile con geometría en MAGNA-SIRGAS Bogotá (EPSG:3116)"
          >
            ⬇ Shapefile
          </a>
        </div>
      </div>

      {/* ---- La lista: tabla que se vuelve tarjetas en pantallas angostas ---- */}
      {visibles.length === 0 ? (
        <div className="tarjeta" style={{ padding: 40, textAlign: "center", marginTop: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casita.webp" alt="" width={110} style={{ margin: "0 auto 10px", borderRadius: 10 }} />
          <p style={{ color: "var(--arcilla)" }}>Ningún caso coincide con esa búsqueda.</p>
        </div>
      ) : (
        <div className="registro-lista">
          <div className="registro-encabezado" aria-hidden="true">
            <span>Código · fecha</span>
            <span>Lugar</span>
            <span>Personas</span>
            <span>Dictamen · señales</span>
            <span>Necesidades</span>
            <span />
          </div>
          {visibles.map((c) => (
            <a key={c.codigo_publico} href={`/caso/${c.codigo_publico}`} className="registro-fila">
              <div className="registro-celda-codigo">
                <span className="codigo" style={{ fontSize: ".92rem" }}>{c.codigo_publico}</span>
                <span style={{ fontSize: ".75rem", color: "var(--arcilla)" }}>
                  {c.created_at
                    ? new Date(c.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
                    : ""}
                </span>
              </div>
              <div className="registro-celda-lugar">
                <strong>{c.municipio_nombre ?? "Sin municipio"}</strong>
                <span style={{ color: "var(--arcilla)" }}>
                  {[c.barrio, c.departamento_nombre].filter(Boolean).join(" · ")}
                  {c.lat == null && " · sin ubicación aún"}
                </span>
              </div>
              <div className="registro-celda-personas" title="Personas afectadas">
                <strong style={{ color: "var(--tinta)", fontVariantNumeric: "tabular-nums", fontSize: "1.05rem" }}>
                  {c.num_personas ?? "—"}
                </strong>
                <span style={{ fontSize: ".7rem", color: "var(--arcilla)" }}>personas</span>
              </div>
              <div className="registro-celda-chips">
                <span className={`chip ${c.dictamen === "habitable" ? "ok" : c.dictamen === "uso_restringido" ? "warn" : c.dictamen === "no_habitable" ? "bad" : "proceso"}`}>
                  {c.dictamen ? ETIQUETA[c.dictamen] : "Reportado"}
                </span>
                {c.hay_necesidad_urgente && <span className="tag-mini urgente">Urgente</span>}
                {c.sin_vivienda && <span className="tag-mini">⛺</span>}
                {c.es_colectivo && <span className="tag-mini">👥 {c.num_familias}</span>}
              </div>
              <div className="registro-celda-necesidades">
                {(c.necesidades_tipos ?? []).slice(0, 3).map((t: string) => (
                  <span key={t} className="tag-mini">{NOMBRE_NECESIDAD[t] ?? t}</span>
                ))}
                {(c.necesidades_tipos ?? []).length > 3 && (
                  <span className="tag-mini">+{(c.necesidades_tipos ?? []).length - 3}</span>
                )}
              </div>
              <span className="registro-flecha" aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      )}

      {filtrados.length > limite && (
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button className="boton" style={{ background: "var(--bruma)", color: "var(--tinta)", boxShadow: "var(--sombra-papel)" }} onClick={() => setLimite(limite + 100)}>
            Mostrar más ({(filtrados.length - limite).toLocaleString("es-CO")} restantes)
          </button>
        </div>
      )}
    </section>
  );
}
