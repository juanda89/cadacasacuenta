import { NextRequest } from "next/server";
import { aCsv, aGeojson, filasPublicas, respuestaExporte } from "@/lib/exporta";

export const revalidate = 60;

// Descarga georreferenciada de UN caso desde su URL pública:
//   /api/exporta/caso/CCC-2026-0001?formato=csv|geojson
export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const formato = req.nextUrl.searchParams.get("formato") === "geojson" ? "geojson" : "csv";
  const filas = await filasPublicas(codigo);
  if (filas.length === 0) return new Response("Caso no encontrado", { status: 404 });
  return formato === "csv"
    ? respuestaExporte(aCsv(filas), `${codigo.toUpperCase()}.csv`, "csv")
    : respuestaExporte(aGeojson(filas), `${codigo.toUpperCase()}.geojson`, "geojson");
}
