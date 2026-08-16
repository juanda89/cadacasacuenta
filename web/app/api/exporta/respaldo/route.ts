import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { aCsv, filasPublicas } from "@/lib/exporta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Respaldo para la hoja de Google Drive (docs/RESPALDO-DRIVE.md).
 * Lo consume el Apps Script del usuario con el header X-Llave-Respaldo.
 *
 *   ?alcance=anonimo   → mismas columnas que el export público (compartible)
 *   ?alcance=completo  → añade contacto, dirección y coordenada exacta (PII).
 *                        Exige además RESPALDO_COMPLETO=si en el entorno:
 *                        activarlo es una decisión consciente — la hoja que lo
 *                        reciba hereda la responsabilidad de la Ley 1581.
 */
export async function GET(req: NextRequest) {
  const llave = req.headers.get("x-llave-respaldo") ?? "";
  const secreto = process.env.BACKUP_SECRET ?? "";
  const a = Buffer.from(llave);
  const b = Buffer.from(secreto);
  if (!secreto || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "llave inválida" }, { status: 401 });
  }

  const alcance = req.nextUrl.searchParams.get("alcance") === "completo" ? "completo" : "anonimo";

  if (alcance === "anonimo") {
    return new Response(aCsv(await filasPublicas()), {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  if (process.env.RESPALDO_COMPLETO !== "si") {
    return NextResponse.json(
      { error: "El respaldo completo (con datos personales) está desactivado. Actívalo con RESPALDO_COMPLETO=si solo si la hoja de destino está debidamente restringida." },
      { status: 403 }
    );
  }

  // Completo: la fila pública + contacto, dirección y coordenada exacta
  const db = supabaseAdmin();
  const [{ data: casos }, publicas] = await Promise.all([
    db
      .from("casos")
      .select(
        "codigo_publico, direccion, unidad, referencia, casos_contacto ( nombre, telefono, correo )"
      )
      .order("created_at", { ascending: true })
      .limit(5000),
    filasPublicas(),
  ]);
  const { data: exactas } = await db
    .from("casos_priorizados")
    .select("codigo_publico, lat, lng, este_magna, norte_magna")
    .limit(5000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porCodigo = new Map<string, any>((casos ?? []).map((c) => [c.codigo_publico, c]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exactaPorCodigo = new Map<string, any>((exactas ?? []).map((c) => [c.codigo_publico, c]));

  const filas = publicas.map((f) => {
    const c = porCodigo.get(f.codigo_publico);
    const e = exactaPorCodigo.get(f.codigo_publico);
    const contacto = Array.isArray(c?.casos_contacto) ? c.casos_contacto[0] : c?.casos_contacto;
    return {
      ...f,
      // La coordenada EXACTA reemplaza a la redondeada en el respaldo completo
      lat: e?.lat ?? f.lat,
      lng: e?.lng ?? f.lng,
      este_magna: e?.este_magna ?? f.este_magna,
      norte_magna: e?.norte_magna ?? f.norte_magna,
      direccion: c?.direccion ?? "",
      unidad: c?.unidad ?? "",
      referencia: c?.referencia ?? "",
      contacto_nombre: contacto?.nombre ?? "",
      contacto_telefono: contacto?.telefono ?? "",
      contacto_correo: contacto?.correo ?? "",
    };
  });

  const extra: [string, string][] = [
    ["direccion", "direccion"],
    ["unidad", "unidad"],
    ["referencia", "referencia"],
    ["contacto_nombre", "contacto_nombre"],
    ["contacto_telefono", "contacto_telefono"],
    ["contacto_correo", "contacto_correo"],
  ];
  return new Response(aCsv(filas, extra), {
    headers: { "Content-Type": "text/csv; charset=utf-8" },
  });
}
