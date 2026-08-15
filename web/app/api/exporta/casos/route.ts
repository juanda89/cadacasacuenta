import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aCsv, aGeojson, filasPublicas, respuestaExporte } from "@/lib/exporta";
import { aShapefileZip } from "@/lib/shapefile";

export const dynamic = "force-dynamic";

// Registro COMPLETO para ArcGIS/QGIS — SOLO con sesión (decisión 2026-08-15:
// el dato en bloque no es público; el mapa anonimizado sí):
//   /api/exporta/casos?formato=csv|geojson|shp
export async function GET(req: NextRequest) {
  const auth = await supabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "El registro completo requiere sesión de profesional. Ingrese en /profesionales." },
      { status: 401 }
    );
  }
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
