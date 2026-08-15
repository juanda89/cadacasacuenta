import { createClient } from "@supabase/supabase-js";

// Filas públicas anonimizadas para exportes GIS (CSV / GeoJSON).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilaExporte = Record<string, any>;

export async function filasPublicas(codigo?: string): Promise<FilaExporte[]> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  let q = db.from("caso_publico").select("*").order("created_at", { ascending: true }).limit(5000);
  if (codigo) q = q.eq("codigo_publico", codigo.toUpperCase());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

const COLUMNAS: [string, string][] = [
  ["codigo", "codigo_publico"],
  ["estado", "estado"],
  ["dictamen", "dictamen"],
  ["fecha_dictamen", "dictamen_at"],
  ["dano_estructural", "tiene_dano_estructural"],
  ["sin_vivienda", "sin_vivienda"],
  ["colectivo", "es_colectivo"],
  ["num_personas", "num_personas"],
  ["num_familias", "num_familias"],
  ["municipio", "municipio_nombre"],
  ["divipola", "municipio_divipola"],
  ["departamento", "departamento_nombre"],
  ["barrio", "barrio"],
  ["necesidades", "necesidades_tipos"],
  ["necesidad_urgente", "hay_necesidad_urgente"],
  ["lat_wgs84", "lat"],
  ["lng_wgs84", "lng"],
  ["este_magna_sirgas_bogota_epsg3116", "este_magna"],
  ["norte_magna_sirgas_bogota_epsg3116", "norte_magna"],
  ["fecha_reporte", "created_at"],
];

function celda(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function aCsv(filas: FilaExporte[]): string {
  const bom = "﻿"; // Excel en Windows respeta UTF-8 solo con BOM
  const cab = COLUMNAS.map(([n]) => n).join(",");
  const cuerpo = filas.map((f) => COLUMNAS.map(([, k]) => celda(f[k])).join(",")).join("\n");
  return `${bom}${cab}\n${cuerpo}\n`;
}

export function aGeojson(filas: FilaExporte[]): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      nota: "Coordenadas geométricas en WGS84 (EPSG:4326). Las propiedades este/norte están en MAGNA-SIRGAS / Colombia Bogotá zone (EPSG:3116). Ubicaciones públicas redondeadas a ~110 m para proteger a cada familia.",
      features: filas
        .filter((f) => f.lat != null && f.lng != null)
        .map((f) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [f.lng, f.lat] },
          properties: Object.fromEntries(COLUMNAS.map(([n, k]) => [n, f[k]])),
        })),
    },
    null,
    1
  );
}

export function respuestaExporte(contenido: string, nombre: string, tipo: "csv" | "geojson"): Response {
  return new Response(contenido, {
    headers: {
      "Content-Type": tipo === "csv" ? "text/csv; charset=utf-8" : "application/geo+json",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
