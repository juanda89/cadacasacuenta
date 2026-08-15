"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// El worker de MapLibre v6 muere en silencio cuando lo empaqueta Turbopack
// (la fuente GeoJSON jamás carga y el país no se pinta). Se sirve el worker
// oficial desde /public — package.json lo copia en prebuild/predev para que
// siempre coincida con la versión de npm.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

export type PuntoMapa = {
  codigo_publico: string;
  lat: number;
  lng: number;
  estado: string;
  dictamen: "habitable" | "uso_restringido" | "no_habitable" | null;
  municipio_nombre: string | null;
  barrio?: string | null;
  sin_vivienda: boolean;
  es_colectivo: boolean;
  num_familias: number;
  necesidades_abiertas: number;
  hay_necesidad_urgente: boolean;
  created_at?: string;
  fotoUrl?: string; // primera evidencia, firmada en el servidor
};

// El punto del marcador carga el color del dictamen; el techo SIEMPRE en tinta.
const COLOR_PUNTO: Record<string, string> = {
  habitable: "#2E7D32",
  uso_restringido: "#F9A825",
  no_habitable: "#C62828",
};
const ETIQUETA: Record<string, string> = {
  habitable: "Habitable",
  uso_restringido: "Uso restringido",
  no_habitable: "No habitable",
};

// La sala de situación mira a Colombia, y a nada más.
const COLOMBIA_CONTINENTAL: [[number, number], [number, number]] = [
  [-79.2, -4.4],
  [-66.7, 12.6],
];
const LIMITES_MAXIMOS: [[number, number], [number, number]] = [
  [-84.5, -7.0],
  [-62.5, 16.0],
];
const EPICENTRO: [number, number] = [-76.234, 4.897]; // San José del Palmar, Chocó

const CIUDADES: { nombre: string; lngLat: [number, number]; mayor?: boolean }[] = [
  { nombre: "Quibdó", lngLat: [-76.658, 5.692], mayor: true },
  { nombre: "Medellín", lngLat: [-75.581, 6.244] },
  { nombre: "Bogotá", lngLat: [-74.072, 4.711] },
  { nombre: "Cali", lngLat: [-76.532, 3.452] },
];

/** Icono Techo-y-Punto: el mismo del logo, con el punto del dictamen. */
export function iconoCaso(dictamen: string | null, size = 20) {
  const punto = dictamen ? COLOR_PUNTO[dictamen] ?? "#4A7BA6" : "#4A7BA6";
  return `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true">
    <polyline points="5,15 14,5 23,15" fill="none" stroke="#1F3A5F" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="14" cy="19" r="3.8" fill="${punto}" stroke="#FBF7EF" stroke-width="1.4"/>
  </svg>`;
}

function svgMarcador(dictamen: string | null, urgente: boolean) {
  const punto = dictamen ? COLOR_PUNTO[dictamen] ?? "#4A7BA6" : "#4A7BA6";
  const halo = urgente ? `<circle cx="14" cy="19" r="6.5" fill="none" stroke="${punto}" stroke-width="1.6" opacity=".55"/>` : "";
  return `<svg width="38" height="38" viewBox="0 0 28 28">
    ${halo}
    <polyline points="5,15 14,5 23,15" fill="none" stroke="#1F3A5F" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="14" cy="19" r="3.8" fill="${punto}" stroke="#FBF7EF" stroke-width="1.4"/>
  </svg>`;
}

// Estilo local (Colombia en papel) + calles de OpenStreetMap que aparecen al
// acercarse: de lejos, el diorama; de cerca, calles y referencias para ubicarse.
const ESTILO_PAPEL: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    colombia: { type: "geojson", data: "/colombia.json" },
    calles: {
      type: "raster",
      tiles: ["a", "b", "c", "d"].map(
        (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`
      ),
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors · © CARTO",
    },
  },
  layers: [
    { id: "agua", type: "background", paint: { "background-color": "#D3E0EC" } },
    {
      id: "pais-sombra",
      type: "fill",
      source: "colombia",
      paint: { "fill-color": "rgba(31,58,95,0.20)", "fill-translate": [0, 3.5] },
    },
    { id: "pais", type: "fill", source: "colombia", paint: { "fill-color": "#FBF7EF" } },
    {
      id: "choco",
      type: "fill",
      source: "colombia",
      filter: ["==", ["get", "codigo"], "27"],
      paint: { "fill-color": "#FFFDF8" },
    },
    {
      id: "dptos-borde",
      type: "line",
      source: "colombia",
      paint: { "line-color": "rgba(31,58,95,0.20)", "line-width": 0.7 },
    },
    {
      id: "choco-borde",
      type: "line",
      source: "colombia",
      filter: ["==", ["get", "codigo"], "27"],
      paint: { "line-color": "rgba(31,58,95,0.55)", "line-width": 1.8 },
    },
    // Calles y referencias: invisibles de lejos, nítidas al acercarse (el papel
    // le cede el sitio al plano urbano justo cuando hace falta ubicarse)
    {
      id: "calles",
      type: "raster",
      source: "calles",
      paint: {
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 12.5, 1],
        "raster-saturation": -0.25,
      },
    },
  ],
};

function crearMapa(contenedor: HTMLDivElement) {
  return new maplibregl.Map({
    container: contenedor,
    style: ESTILO_PAPEL,
    bounds: COLOMBIA_CONTINENTAL,
    fitBoundsOptions: { padding: 28 },
    maxBounds: LIMITES_MAXIMOS,
    minZoom: 3.6, // deja que el fitBounds inicial muestre el país entero aunque el lienzo sea bajo
    maxZoom: 18, // con calles OSM el zoom de barrio sí sirve para ubicarse
    attributionControl: false,
    // zoom directo con el scroll: pedido explícito (sin Ctrl/⌘)
  });
}

/** Tamaño y "calor" del racimo según cuántos casos agrupa (rampa de tinta). */
function estiloCluster(n: number) {
  const t = Math.min(1, n / 60);
  const size = Math.round(44 + t * 34);
  const fondo =
    t < 0.25 ? "rgba(74,123,166,.92)" : t < 0.55 ? "rgba(47,86,133,.94)" : "rgba(31,58,95,.96)";
  const halo = 10 + Math.round(t * 16);
  return { size, fondo, halo };
}

export default function MapaSituacion({ puntos }: { puntos: PuntoMapa[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const tarjetasRef = useRef<HTMLDivElement>(null);
  const [sinWebgl, setSinWebgl] = useState(false);
  const [visibles, setVisibles] = useState<PuntoMapa[]>(puntos.slice(0, 30));
  const [activo, setActivo] = useState<string | null>(null);

  const porCodigo = useMemo(() => new Map(puntos.map((p) => [p.codigo_publico, p])), [puntos]);

  const conteo = useMemo(() => {
    const c = { habitable: 0, uso_restringido: 0, no_habitable: 0, proceso: 0 };
    for (const p of puntos) {
      if (p.dictamen) c[p.dictamen]++;
      else c.proceso++;
    }
    return c;
  }, [puntos]);

  // Ordena lo visible: urgencias primero, luego familias sin techo
  const ordenar = useCallback((lista: PuntoMapa[]) => {
    return [...lista].sort((a, b) => {
      const ua = Number(b.hay_necesidad_urgente) - Number(a.hay_necesidad_urgente);
      if (ua !== 0) return ua;
      const sv = Number(b.sin_vivienda) - Number(a.sin_vivienda);
      if (sv !== 0) return sv;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, []);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    if (!document.createElement("canvas").getContext("webgl2")) {
      setSinWebgl(true);
      return;
    }
    let map: maplibregl.Map;
    try {
      map = crearMapa(ref.current);
    } catch (e) {
      console.warn("mapa sin WebGL:", e);
      setSinWebgl(true);
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Límites: DANE MGN 2018" })
    );
    map.on("error", (e) => console.warn("mapa:", e.error?.message ?? e));
    mapRef.current = map;
    // referencia para diagnóstico manual en consola
    (window as unknown as Record<string, unknown>).__mapa = map;

    // Ciudades de referencia
    for (const c of CIUDADES) {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = "display:flex;align-items:center;gap:5px;pointer-events:none;";
      el.innerHTML = `
        <span style="width:${c.mayor ? 7 : 5}px;height:${c.mayor ? 7 : 5}px;border-radius:50%;background:rgba(31,58,95,${c.mayor ? ".78" : ".45"});box-shadow:0 1px 0 rgba(31,58,95,.25)"></span>
        <span style="font-size:${c.mayor ? 11 : 10}px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:rgba(31,58,95,${c.mayor ? ".8" : ".5"})">${c.nombre}</span>`;
      new maplibregl.Marker({ element: el, anchor: "left", offset: [6, 0] }).setLngLat(c.lngLat).addTo(map);
    }

    // El epicentro respira en papel
    const epi = document.createElement("div");
    epi.className = "epicentro";
    epi.innerHTML = `<i></i><i></i><i></i><span class="epicentro-tag">Epicentro · M 7,4</span>`;
    new maplibregl.Marker({ element: epi }).setLngLat(EPICENTRO).addTo(map);

    // ---- Racimos: la fuente agrupa; los marcadores HTML los dibujan ----
    map.on("load", () => {
      map.addSource("casos", {
        type: "geojson",
        cluster: true,
        clusterRadius: 58,
        clusterMaxZoom: 13,
        data: {
          type: "FeatureCollection",
          features: puntos.map((p) => ({
            type: "Feature" as const,
            properties: { codigo: p.codigo_publico },
            geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          })),
        },
      });
      // Capa invisible: obliga a MapLibre a calcular los tiles de la fuente
      map.addLayer({ id: "casos-sonda", type: "circle", source: "casos", paint: { "circle-opacity": 0, "circle-radius": 1 } });

      const sincronizar = () => {
        const fuente = map.getSource("casos") as maplibregl.GeoJSONSource | undefined;
        if (!fuente) return;

        const feats = map.querySourceFeatures("casos");
        const vivos = new Set<string>();
        const marcadores = marcadoresRef.current;

        for (const f of feats) {
          const props = f.properties as Record<string, unknown>;
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
          const esCluster = !!props.cluster;
          const clave = esCluster ? `c:${props.cluster_id}:${props.point_count}` : `p:${props.codigo}`;
          if (vivos.has(clave)) continue;
          vivos.add(clave);
          if (marcadores.has(clave)) continue;

          const el = document.createElement("div");
          if (esCluster) {
            const n = Number(props.point_count);
            const { size, fondo, halo } = estiloCluster(n);
            el.className = "racimo";
            el.style.cssText = `width:${size}px;height:${size}px;background:${fondo};box-shadow:0 2px 0 rgba(31,58,95,.4), 0 0 0 ${halo}px rgba(74,123,166,.16);`;
            el.innerHTML = `<span>${n.toLocaleString("es-CO")}</span><small>casos</small>`;
            el.addEventListener("click", async () => {
              const zoom = await (map.getSource("casos") as maplibregl.GeoJSONSource).getClusterExpansionZoom(
                Number(props.cluster_id)
              );
              map.easeTo({ center: [lng, lat], zoom: Math.min(zoom + 0.4, 15), duration: 620 });
            });
          } else {
            const codigo = String(props.codigo);
            const p = porCodigo.get(codigo);
            el.className = "marcador-caso";
            el.innerHTML = svgMarcador(p?.dictamen ?? null, !!p?.hay_necesidad_urgente);
            el.setAttribute("aria-label", `Caso ${codigo}`);
            el.addEventListener("click", () => {
              setActivo(codigo);
              document.getElementById(`tarjeta-${codigo}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
            el.addEventListener("mouseenter", () => setActivo(codigo));
          }
          const m = new maplibregl.Marker({ element: el, anchor: esCluster ? "center" : "bottom" })
            .setLngLat([lng, lat])
            .addTo(map);
          marcadores.set(clave, m);
        }

        // retira los que ya no están (se agruparon o des-agruparon)
        for (const [clave, m] of marcadores) {
          if (!vivos.has(clave)) {
            m.remove();
            marcadores.delete(clave);
          }
        }

        // tarjetas: lo que el mapa está mostrando ahora mismo
        const b = map.getBounds();
        setVisibles(puntos.filter((p) => b.contains([p.lng, p.lat])));
      };

      map.on("idle", sincronizar);
      map.on("moveend", sincronizar);
      map.on("zoomend", sincronizar);
    });

    return () => {
      marcadoresRef.current.forEach((m) => m.remove());
      marcadoresRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos]);

  const total = puntos.length;
  const lista = ordenar(visibles).slice(0, 40);


  if (sinWebgl) {
    return (
      <div className="mapa-lienzo" style={{ background: "var(--papel)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "56px 24px", textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ilustraciones/paso-mapa.webp" alt="" width={280} style={{ borderRadius: 14 }} />
          <p style={{ maxWidth: "44ch", color: "var(--arcilla)", fontSize: ".95rem" }}>
            Su navegador no puede dibujar el mapa interactivo, pero los casos siguen aquí:{" "}
            <strong style={{ color: "var(--tinta)" }}>
              {total.toLocaleString("es-CO")} {total === 1 ? "hogar registrado" : "hogares registrados"}
            </strong>{" "}
            — {conteo.habitable} habitables, {conteo.uso_restringido} de uso restringido, {conteo.no_habitable} no
            habitables y {conteo.proceso} sin dictamen aún.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sala">
      {/* ---- El mapa, fundido con la página ---- */}
      <div className="sala-mapa">
        {/* inline: la clase .maplibregl-map (position:relative) pisaría el absolute */}
        <div
          ref={ref}
          style={{ position: "absolute", inset: 0 }}
          role="region"
          aria-label="Mapa de casos reportados en Colombia"
        />

        <div className="panel-vidrio" style={{ position: "absolute", top: 16, left: 16, zIndex: 5, padding: "10px 16px" }}>
          <span className="pulso-vivo">
            En vivo · {total.toLocaleString("es-CO")} {total === 1 ? "caso" : "casos"}
          </span>
        </div>

        {/* Leyenda con los iconos reales del mapa */}
        <div className="leyenda panel-vidrio">
          <h3>Dictamen de habitabilidad</h3>
          {(
            [
              ["habitable", conteo.habitable],
              ["uso_restringido", conteo.uso_restringido],
              ["no_habitable", conteo.no_habitable],
            ] as const
          ).map(([d, n]) => (
            <div className="leyenda-fila" key={d}>
              <span dangerouslySetInnerHTML={{ __html: iconoCaso(d, 22) }} />
              {ETIQUETA[d]}
              <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--arcilla)" }}>{n}</span>
            </div>
          ))}
          <div className="leyenda-fila">
            <span dangerouslySetInnerHTML={{ __html: iconoCaso(null, 22) }} />
            Sin dictamen aún
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--arcilla)" }}>{conteo.proceso}</span>
          </div>
          <div className="leyenda-fila">
            <span className="racimo racimo-mini"><span>12</span></span>
            Casos agrupados
            <span style={{ marginLeft: "auto", fontSize: ".72rem", color: "var(--arcilla)" }}>acérquese</span>
          </div>
          <div className="leyenda-nota">
            Cada marcador es un hogar. La ubicación pública está redondeada (~110 m) para proteger a cada familia.
          </div>
        </div>
      </div>

      {/* ---- La fila de casos visibles (como una sala de mando) ---- */}
      <aside className="sala-casos" ref={tarjetasRef} aria-label="Casos visibles en el mapa">
        <div className="sala-casos-cabeza">
          <span className="etiqueta">En esta vista</span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {visibles.length.toLocaleString("es-CO")} {visibles.length === 1 ? "caso" : "casos"}
          </strong>
        </div>
        <div className="sala-casos-lista">
          {lista.length === 0 && (
            <p style={{ color: "var(--arcilla)", fontSize: ".9rem", padding: "18px 4px" }}>
              No hay casos en esta parte del mapa. Aléjese un poco o vuelva al Chocó.
            </p>
          )}
          {lista.map((p) => (
            <a
              key={p.codigo_publico}
              id={`tarjeta-${p.codigo_publico}`}
              href={`/caso/${p.codigo_publico}`}
              className={`tarjeta-caso ${activo === p.codigo_publico ? "activa" : ""}`}
              // El mapa manda sobre la lista, nunca al revés: el hover solo
              // resalta la tarjeta, jamás mueve el mapa.
              onMouseEnter={() => setActivo(p.codigo_publico)}
              onMouseLeave={() => setActivo(null)}
            >
              <div className="tarjeta-caso-foto">
                {p.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.fotoUrl} alt="" loading="lazy" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/casita.webp" alt="" loading="lazy" style={{ objectFit: "contain", padding: 14, background: "var(--bruma)" }} />
                )}
                <span
                  className={`chip ${
                    p.dictamen === "habitable" ? "ok" : p.dictamen === "uso_restringido" ? "warn" : p.dictamen === "no_habitable" ? "bad" : "proceso"
                  }`}
                  style={{ position: "absolute", top: 10, left: 10 }}
                >
                  {p.dictamen ? ETIQUETA[p.dictamen] : "Reportado"}
                </span>
              </div>
              <div className="tarjeta-caso-cuerpo">
                <div className="codigo" style={{ fontSize: ".92rem" }}>{p.codigo_publico}</div>
                <div className="tarjeta-caso-lugar">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {[p.barrio, p.municipio_nombre].filter(Boolean).join(", ") || "Ubicación reservada"}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {p.hay_necesidad_urgente && <span className="tag-mini urgente">Urgente</span>}
                  {p.sin_vivienda && <span className="tag-mini">⛺ Sin vivienda</span>}
                  {p.es_colectivo && <span className="tag-mini">👥 {p.num_familias} familias</span>}
                  {p.necesidades_abiertas > 0 && <span className="tag-mini">{p.necesidades_abiertas} necesidades</span>}
                </div>
              </div>
            </a>
          ))}
        </div>
      </aside>
    </div>
  );
}
