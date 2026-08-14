"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

function svgMarcador(dictamen: string | null) {
  const punto = dictamen ? COLOR_PUNTO[dictamen] ?? "#4A7BA6" : "#4A7BA6";
  return `<svg width="34" height="34" viewBox="0 0 24 24"><polyline points="4,13 12,4 20,13" fill="none" stroke="#1F3A5F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16" r="3.2" fill="${punto}"/></svg>`;
}

export default function MapaPublico({ puntos }: { puntos: PuntoMapa[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-76.65, 5.4], // Chocó
      zoom: 7.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    for (const p of puntos) {
      const el = document.createElement("div");
      el.innerHTML = svgMarcador(p.dictamen);
      el.style.cursor = "pointer";
      el.setAttribute("aria-label", `Caso ${p.codigo_publico}`);

      const dictamenHtml = p.dictamen
        ? `<span style="background:${p.dictamen === "uso_restringido" ? "#B97F0F" : COLOR_PUNTO[p.dictamen]};color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600">${ETIQUETA[p.dictamen]}</span>`
        : `<span style="background:#4A7BA6;color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600">Reportado</span>`;

      const popup = new maplibregl.Popup({ offset: 18, maxWidth: "260px" }).setHTML(
        `<div style="font-family:inherit;line-height:1.5">
           <div style="font-weight:700;letter-spacing:.1em;color:#1F3A5F">${p.codigo_publico}</div>
           <div style="color:#6B655C;font-size:13px">${p.municipio_nombre ?? ""}</div>
           <div style="margin:6px 0">${dictamenHtml}</div>
           ${p.sin_vivienda ? '<div style="font-size:13px">⛺ Familia sin vivienda</div>' : ""}
           ${p.es_colectivo ? `<div style="font-size:13px">👥 Reporte colectivo: ${p.num_familias} familias</div>` : ""}
           ${p.necesidades_abiertas > 0 ? `<div style="font-size:13px">${p.necesidades_abiertas} necesidad(es) abierta(s)${p.hay_necesidad_urgente ? " · urgente" : ""}</div>` : ""}
           <a href="/caso/${p.codigo_publico}" style="font-size:13px;color:#4A7BA6">Ver el caso →</a>
         </div>`
      );
      new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .setPopup(popup)
        .addTo(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [puntos]);

  return (
    <div
      ref={ref}
      style={{ width: "100%", height: "min(72vh, 560px)", borderRadius: 12, overflow: "hidden", border: "1px solid #E4DCCB", boxShadow: "var(--sombra-papel)" }}
      role="region"
      aria-label="Mapa de casos reportados"
    />
  );
}
