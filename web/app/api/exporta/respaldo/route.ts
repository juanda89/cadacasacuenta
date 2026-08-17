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

  // Completo: la fila pública + contacto, dirección, coordenada exacta y
  // los links de la evidencia (URLs firmadas: el bucket es privado; se
  // renuevan en cada sincronización y valen 7 días)
  const db = supabaseAdmin();
  const [{ data: casos }, publicas, { data: evidencias }] = await Promise.all([
    db
      .from("casos")
      .select(
        "id, codigo_publico, direccion, unidad, referencia, casos_contacto ( nombre, telefono, correo )"
      )
      .order("created_at", { ascending: true })
      .limit(5000),
    filasPublicas(),
    db.from("evidencias").select("caso_id, tipo, storage_path").order("created_at").limit(20000),
  ]);

  const SIETE_DIAS = 7 * 24 * 3600;
  const rutas = (evidencias ?? []).map((e) => e.storage_path);
  const urlPorRuta = new Map<string, string>();
  if (rutas.length > 0) {
    const { data: firmadas, error: errFirma } = await db.storage
      .from("evidencias")
      .createSignedUrls(rutas, SIETE_DIAS);
    if (errFirma) console.error("firmando evidencias", errFirma);
    (firmadas ?? []).forEach((f, i) => {
      if (f.signedUrl) urlPorRuta.set(rutas[i], f.signedUrl);
    });
  }
  const mediaPorCaso = new Map<string, { fotos: string[]; audios: string[]; documentos: string[] }>();
  for (const e of evidencias ?? []) {
    const url = urlPorRuta.get(e.storage_path);
    if (!url) continue;
    const m = mediaPorCaso.get(e.caso_id) ?? { fotos: [], audios: [], documentos: [] };
    if (e.tipo === "foto") m.fotos.push(url);
    else if (e.tipo === "audio") m.audios.push(url);
    else m.documentos.push(url);
    mediaPorCaso.set(e.caso_id, m);
  }
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
    const media = (c && mediaPorCaso.get(c.id)) ?? { fotos: [], audios: [], documentos: [] };
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
      // Fotos 1-5 en columnas propias (clicables en Sheets); el resto junto
      num_fotos: media.fotos.length,
      foto_1: media.fotos[0] ?? "",
      foto_2: media.fotos[1] ?? "",
      foto_3: media.fotos[2] ?? "",
      foto_4: media.fotos[3] ?? "",
      foto_5: media.fotos[4] ?? "",
      fotos_extra: media.fotos.slice(5).join(" | "),
      audios: media.audios.join(" | "),
      documentos: media.documentos.join(" | "),
    };
  });

  const extra: [string, string][] = [
    ["direccion", "direccion"],
    ["unidad", "unidad"],
    ["referencia", "referencia"],
    ["contacto_nombre", "contacto_nombre"],
    ["contacto_telefono", "contacto_telefono"],
    ["contacto_correo", "contacto_correo"],
    ["num_fotos", "num_fotos"],
    ["foto_1", "foto_1"],
    ["foto_2", "foto_2"],
    ["foto_3", "foto_3"],
    ["foto_4", "foto_4"],
    ["foto_5", "foto_5"],
    ["fotos_extra", "fotos_extra"],
    ["audios", "audios"],
    ["documentos", "documentos"],
  ];
  return new Response(aCsv(filas, extra), {
    headers: { "Content-Type": "text/csv; charset=utf-8" },
  });
}
