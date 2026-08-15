import { NextRequest } from "next/server";
import { aCsv, aGeojson, filasPublicas, respuestaExporte } from "@/lib/exporta";
import { aShapefileZip } from "@/lib/shapefile";

export const revalidate = 60;

// Registro completo anonimizado, listo para ArcGIS/QGIS:
//   /api/exporta/casos?formato=csv      → XY en WGS84 y MAGNA-SIRGAS (EPSG:3116)
//   /api/exporta/casos?formato=geojson  → puntos WGS84 con propiedades MAGNA
//   /api/exporta/casos?formato=shp      → shapefile ZIP con geometría en EPSG:3116
export async function GET(req: NextRequest) {
  const formato = req.nextUrl.searchParams.get("formato") ?? "csv";
  const filas = await filasPublicas();
  const fecha = new Date().toISOString().slice(0, 10);
  if (formato === "shp") {
    const zip = aShapefileZip(filas, "cada_casa_cuenta");
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cada-casa-cuenta-registro-${fecha}-magna3116.zip"`,
        "Cache-Control": "public, max-age=60",
      },
    });
  }
  return formato === "geojson"
    ? respuestaExporte(aGeojson(filas), `cada-casa-cuenta-registro-${fecha}.geojson`, "geojson")
    : respuestaExporte(aCsv(filas), `cada-casa-cuenta-registro-${fecha}.csv`, "csv");
}
