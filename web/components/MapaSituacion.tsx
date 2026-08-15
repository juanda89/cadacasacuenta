"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  sin_vivienda: boolean;
  es_colectivo: boolean;
  num_familias: number;
  necesidades_abiertas: number;
  hay_necesidad_urgente: boolean;
};

// El punto del marcador carga el color del dictamen; el techo SIEMPRE en tinta.
// Sin dictamen = azul de proceso (el semáforo solo habla de habitabilidad).
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

function svgMarcador(dictamen: string | null, urgente: boolean) {
  const punto = dictamen ? COLOR_PUNTO[dictamen] ?? "#4A7BA6" : "#4A7BA6";
  const halo = urgente ? `<circle cx="14" cy="19" r="6.5" fill="none" stroke="${punto}" stroke-width="1.6" opacity=".55"/>` : "";
  return `<svg width="38" height="38" viewBox="0 0 28 28">
    ${halo}
    <polyline points="5,15 14,5 23,15" fill="none" stroke="#1F3A5F" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="14" cy="19" r="3.8" fill="${punto}" stroke="#FBF7EF" stroke-width="1.4"/>
  </svg>`;
}

// Estilo 100% local: Colombia recortada en papel sobre agua de acuarela.
// Sin tiles, sin glyphs, sin una sola petición fuera de este dominio.
function crearMapa(contenedor: HTMLDivElement) {
  return new maplibregl.Map({
    container: contenedor,
    style: ESTILO_PAPEL,
    bounds: COLOMBIA_CONTINENTAL,
    fitBoundsOptions: { padding: 28 },
    maxBounds: LIMITES_MAXIMOS,
    minZoom: 4.2,
    maxZoom: 13,
    attributionControl: false,
    cooperativeGestures: true,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + desplazamiento para hacer zoom en el mapa",
      "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + desplazamiento para hacer zoom en el mapa",
      "CooperativeGesturesHandler.MobileHelpText": "Use dos dedos para mover el mapa",
    },
  });
}

const ESTILO_PAPEL: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    colombia: { type: "geojson", data: "/colombia.json" },
  },
  layers: [
    { id: "agua", type: "background", paint: { "background-color": "#D3E0EC" } },
    {
      // La sombra dura del recorte: el mismo polígono, corrido 3px hacia abajo
      id: "pais-sombra",
      type: "fill",
      source: "colombia",
      paint: { "fill-color": "rgba(31,58,95,0.20)", "fill-translate": [0, 3.5] },
    },
    { id: "pais", type: "fill", source: "colombia", paint: { "fill-color": "#FBF7EF" } },
    {
      // El Chocó: una capa de papel más alta, más luminosa
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
  ],
};

export default function MapaSituacion({ puntos }: { puntos: PuntoMapa[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Sin WebGL (navegadores viejos, lectores, bots) el mapa no puede dibujarse,
  // pero la página jamás debe caerse: se muestra la lámina de papel.
  const [sinWebgl, setSinWebgl] = useState(false);

  const conteo = useMemo(() => {
    const c = { habitable: 0, uso_restringido: 0, no_habitable: 0, proceso: 0 };
    for (const p of puntos) {
      if (p.dictamen) c[p.dictamen]++;
      else c.proceso++;
    }
    return c;
  }, [puntos]);

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
    if (process.env.NODE_ENV !== "production" || typeof window !== "undefined") {
      // referencia para diagnóstico manual en consola
      (window as unknown as Record<string, unknown>).__mapa = map;
    }

    // Ciudades de referencia: puntos serenos, tipografía de sala de mando
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

    // Los casos: cada marcador es un hogar
    for (const p of puntos) {
      const el = document.createElement("div");
      el.className = "marcador-caso";
      el.innerHTML = svgMarcador(p.dictamen, p.hay_necesidad_urgente);
      el.setAttribute("aria-label", `Caso ${p.codigo_publico}`);

      const dictamenHtml = p.dictamen
        ? `<span class="chip ${p.dictamen === "habitable" ? "ok" : p.dictamen === "uso_restringido" ? "warn" : "bad"}">${
            p.dictamen === "habitable" ? "✓" : p.dictamen === "uso_restringido" ? "▲" : "✕"
          } ${ETIQUETA[p.dictamen]}</span>`
        : `<span class="chip proceso">Reportado</span>`;

      const popup = new maplibregl.Popup({ offset: 20, maxWidth: "270px", className: "popup-papel" }).setHTML(
        `<div>
           <div class="codigo" style="font-size:14px">${p.codigo_publico}</div>
           <div style="color:var(--arcilla);font-size:13px">${p.municipio_nombre ?? "Municipio por confirmar"}</div>
           <div style="margin:8px 0 6px">${dictamenHtml}</div>
           ${p.sin_vivienda ? '<div style="font-size:13px">⛺ Familia sin vivienda</div>' : ""}
           ${p.es_colectivo ? `<div style="font-size:13px">👥 Reporte colectivo: ${p.num_familias} familias</div>` : ""}
           ${p.necesidades_abiertas > 0 ? `<div style="font-size:13px">${p.necesidades_abiertas} necesidad(es) abierta(s)${p.hay_necesidad_urgente ? " · <strong>urgente</strong>" : ""}</div>` : ""}
           <a href="/caso/${p.codigo_publico}" style="font-size:13px;font-weight:600">Ver el caso →</a>
         </div>`
      );
      new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [puntos]);

  const total = puntos.length;

  if (sinWebgl) {
    return (
      <div className="mapa-marco" style={{ background: "var(--papel)" }}>
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
    <div className="mapa-marco">
      <div ref={ref} style={{ width: "100%", height: "min(78vh, 720px)", minHeight: 440 }} role="region" aria-label="Mapa de casos reportados en Colombia" />

      {/* Sala de situación: el pulso, arriba a la izquierda */}
      <div className="panel-vidrio" style={{ position: "absolute", top: 16, left: 16, zIndex: 5, padding: "10px 16px" }}>
        <span className="pulso-vivo">
          En vivo · {total.toLocaleString("es-CO")} {total === 1 ? "caso" : "casos"}
        </span>
      </div>

      {/* Leyenda del dictamen: color + palabra + forma, nunca color solo */}
      <div className="leyenda panel-vidrio">
        <h3>Dictamen de habitabilidad</h3>
        <div className="leyenda-fila">
          <span className="chip ok">✓</span> Habitable
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--arcilla)" }}>{conteo.habitable}</span>
        </div>
        <div className="leyenda-fila">
          <span className="chip warn">▲</span> Uso restringido
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--arcilla)" }}>{conteo.uso_restringido}</span>
        </div>
        <div className="leyenda-fila">
          <span className="chip bad">✕</span> No habitable
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--arcilla)" }}>{conteo.no_habitable}</span>
        </div>
        <div className="leyenda-fila">
          <span className="chip proceso" style={{ width: 28, justifyContent: "center" }}>●</span> Sin dictamen aún
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--arcilla)" }}>{conteo.proceso}</span>
        </div>
        <div className="leyenda-nota">
          Cada marcador es un hogar. La ubicación pública está redondeada (~110 m) para proteger a cada familia.
        </div>
      </div>
    </div>
  );
}
