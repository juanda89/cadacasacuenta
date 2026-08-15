"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { iconoCaso } from "./MapaSituacion";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

/**
 * Mapa de la zona de un caso: calles y referencias reales (OpenStreetMap vía
 * CARTO), con zoom y arrastre para poder ubicarse. Mantiene el aro de zona
 * aproximada: la ubicación pública está redondeada a ~110 m a propósito.
 * cooperativeGestures evita que el scroll de la página quede secuestrado.
 */
export default function MapaMini({
  lat,
  lng,
  dictamen,
}: {
  lat: number;
  lng: number;
  dictamen: "habitable" | "uso_restringido" | "no_habitable" | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fallo, setFallo] = useState(false);

  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  useEffect(() => {
    if (!ref.current) return;
    if (!document.createElement("canvas").getContext("webgl2")) {
      setFallo(true);
      return;
    }
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          sources: {
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
            { id: "fondo", type: "background", paint: { "background-color": "#E9EFF4" } },
            { id: "calles", type: "raster", source: "calles", paint: { "raster-saturation": -0.2 } },
          ],
        },
        center: [lng, lat],
        zoom: 15.4,
        minZoom: 5,
        maxZoom: 18.5,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch {
      setFallo(true);
      return;
    }

    // Zona aproximada: un aro de papel que respira, no un punto exacto.
    const zona = document.createElement("div");
    zona.className = "zona-aproximada";
    zona.innerHTML = "<i></i>";
    new maplibregl.Marker({ element: zona }).setLngLat([lng, lat]).addTo(map);

    const el = document.createElement("div");
    el.innerHTML = iconoCaso(dictamen, 34);
    el.style.filter = "drop-shadow(0 2px 0 rgba(31,58,95,.35))";
    new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

    return () => map.remove();
  }, [lat, lng, dictamen]);

  if (fallo) {
    return (
      <div style={{ padding: "18px 16px", fontSize: ".85rem", color: "var(--arcilla)" }}>
        Zona aproximada: {lat.toFixed(3)}, {lng.toFixed(3)} (±110 m) ·{" "}
        <a href={osmUrl} target="_blank" rel="noreferrer">ver en OpenStreetMap</a>
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} style={{ width: "100%", height: 320 }} aria-label="Zona aproximada del caso, con calles y referencias" role="region" />
      <a
        href={osmUrl}
        target="_blank"
        rel="noreferrer"
        className="panel-vidrio"
        style={{ position: "absolute", bottom: 10, left: 10, padding: "6px 12px", fontSize: ".78rem", fontWeight: 700, textDecoration: "none", color: "var(--tinta)" }}
      >
        Abrir en OpenStreetMap ↗
      </a>
      <span
        className="panel-vidrio"
        style={{ position: "absolute", top: 10, left: 10, padding: "5px 11px", fontSize: ".72rem", color: "var(--arcilla)" }}
      >
        Zona aproximada (±110 m)
      </span>
    </div>
  );
}
