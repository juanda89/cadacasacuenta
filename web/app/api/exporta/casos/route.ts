import { NextRequest } from "next/server";
import { aCsv, aGeojson, filasPublicas, respuestaExporte } from "@/lib/exporta";

export const revalidate = 60;

// Registro completo anonimizado, listo para ArcGIS/QGIS:
//   /api/exporta/casos?formato=csv      → XY en WGS84 y MAGNA-SIRGAS (EPSG:3116)
//   /api/exporta/casos?formato=geojson  → puntos WGS84 con propiedades MAGNA
export async function GET(req: NextRequest) {
  const formato = req.nextUrl.searchParams.get("formato") === "geojson" ? "geojson" : "csv";
  const filas = await filasPublicas();
  const fecha = new Date().toISOString().slice(0, 10);
  return formato === "csv"
    ? respuestaExporte(aCsv(filas), `cada-casa-cuenta-registro-${fecha}.csv`, "csv")
    : respuestaExporte(aGeojson(filas), `cada-casa-cuenta-registro-${fecha}.geojson`, "geojson");
}
