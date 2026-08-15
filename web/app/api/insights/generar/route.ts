import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { casosPublicos } from "@/lib/casos-publicos";
import { completa } from "@/lib/agente/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Análisis diario del registro (lo dispara el cron de Vercel — ver vercel.json).
 * Calcula el corte agregado desde la superficie pública anonimizada y le pide
 * a la IA una lectura en tono de acta. El tablero muestra la fila más reciente.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const { todos } = await casosPublicos();
  const hace24h = Date.now() - 24 * 60 * 60 * 1000;

  const porMunicipio: Record<string, number> = {};
  const porNecesidad: Record<string, number> = {};
  let personas = 0, sinVivienda = 0, urgentes = 0, conDictamen = 0, nuevos24h = 0, sinUbicacion = 0;
  const dictamenes = { habitable: 0, uso_restringido: 0, no_habitable: 0 };

  for (const c of todos) {
    personas += c.num_personas ?? 0;
    if (c.sin_vivienda) sinVivienda++;
    if (c.hay_necesidad_urgente) urgentes++;
    if (c.dictamen) { conDictamen++; dictamenes[c.dictamen as keyof typeof dictamenes]++; }
    if (c.created_at && new Date(c.created_at).getTime() > hace24h) nuevos24h++;
    if (c.lat == null) sinUbicacion++;
    if (c.municipio_nombre) porMunicipio[c.municipio_nombre] = (porMunicipio[c.municipio_nombre] ?? 0) + 1;
    for (const n of c.necesidades_tipos ?? []) porNecesidad[n] = (porNecesidad[n] ?? 0) + 1;
  }

  const corte = {
    fecha_corte: new Date().toISOString(),
    casos: todos.length,
    personas_afectadas: personas,
    casos_sin_vivienda: sinVivienda,
    con_necesidad_urgente: urgentes,
    con_dictamen: conDictamen,
    dictamenes,
    nuevos_ultimas_24h: nuevos24h,
    sin_ubicacion: sinUbicacion,
    por_municipio: Object.fromEntries(Object.entries(porMunicipio).sort((a, b) => b[1] - a[1]).slice(0, 10)),
    por_necesidad: porNecesidad,
  };

  let insights: string[] = [];
  try {
    const salida = await completa(
      [
        {
          role: "system",
          content:
            'Eres el analista del registro humanitario "Cada Casa Cuenta" (terremoto de Colombia 2026). ' +
            "Recibes el corte agregado del registro ciudadano y escribes de 4 a 6 insights BREVES en español, tono de acta institucional: " +
            "verbos de evidencia, cero adjetivos dramáticos, cada afirmación sostenida por las cifras dadas (jamás inventes números). " +
            "Prioriza lo accionable para autoridades: dónde se concentra la necesidad, qué crece, qué falta por dictaminar, qué casos no tienen ubicación. " +
            'El registro es evidencia ciudadana, no censo oficial. Responde SOLO JSON: {"insights": ["...", "..."]}',
        },
        { role: "user", content: JSON.stringify(corte) },
      ],
      true
    );
    insights = JSON.parse(salida).insights ?? [];
  } catch (e) {
    console.error("insights IA", e);
  }
  if (insights.length === 0) {
    insights = [
      `Al corte, el registro suma ${corte.casos} casos con ${corte.personas_afectadas} personas afectadas; ${corte.nuevos_ultimas_24h} casos ingresaron en las últimas 24 horas.`,
    ];
  }

  const db = supabaseAdmin();
  const { error } = await db.from("insights_diarios").insert({
    corte,
    insights,
    modelo: process.env.AGENTE_MODELO ?? "openrouter",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, corte, insights });
}
