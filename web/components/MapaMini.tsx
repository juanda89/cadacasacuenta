"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { iconoCaso } from "./MapaSituacion";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

/**
 * Minimapa de un caso: el mismo papel de la sala de situación, quieto.
 * Muestra la zona (~110 m de imprecisión deliberada) con el icono del
 * dictamen; sin zoom con scroll ni arrastre — es una estampilla, no un mapa.
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
          sources: { colombia: { type: "geojson", data: "/colombia.json" } },
          layers: [
            { id: "agua", type: "background", paint: { "background-color": "#D3E0EC" } },
            { id: "pais", type: "fill", source: "colombia", paint: { "fill-color": "#FBF7EF" } },
            { id: "borde", type: "line", source: "colombia", paint: { "line-color": "rgba(31,58,95,0.25)", "line-width": 0.8 } },
          ],
        },
        center: [lng, lat],
        zoom: 11.6,
        interactive: false,
        attributionControl: false,
      });
    } catch {
      setFallo(true);
      return;
    }

    // Zona aproximada: un aro de papel que respira, no un punto exacto.
    // El aro animado es un HIJO: animar el marker pisaría su transform.
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
        Zona aproximada: {lat.toFixed(3)}, {lng.toFixed(3)} (±110 m)
      </div>
    );
  }
  return <div ref={ref} style={{ width: "100%", height: 230 }} aria-label="Zona aproximada del caso" role="img" />;
}
