import { NextRequest } from "next/server";
import { aCsv, aGeojson, filasPublicas, respuestaExporte } from "@/lib/exporta";
import { aShapefileZip } from "@/lib/shapefile";

export const revalidate = 60;

// Descarga georreferenciada de UN caso desde su URL pública:
//   /api/exporta/caso/CCC-2026-0001?formato=csv|geojson
export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const formato = req.nextUrl.searchParams.get("formato") ?? "csv";
  const filas = await filasPublicas(codigo);
  if (filas.length === 0) return new Response("Caso no encontrado", { status: 404 });
  if (formato === "shp") {
    if (filas[0].este_magna == null) {
      return new Response("Este caso aún no tiene ubicación registrada", { status: 422 });
    }
    const zip = aShapefileZip(filas, codigo.toUpperCase());
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${codigo.toUpperCase()}-magna3116.zip"`,
        "Cache-Control": "public, max-age=60",
      },
    });
  }
  return formato === "geojson"
    ? respuestaExporte(aGeojson(filas), `${codigo.toUpperCase()}.geojson`, "geojson")
    : respuestaExporte(aCsv(filas), `${codigo.toUpperCase()}.csv`, "csv");
}
