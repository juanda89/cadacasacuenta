import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enviarTexto } from "@/lib/agente/kapso";
import { generaOtp, hashOtp, normalizaTelefono, OTP_MINUTOS } from "@/lib/seguimiento";

export const dynamic = "force-dynamic";

/**
 * Paso 1 del seguimiento: la familia da su código de caso y su número.
 * SIEMPRE respondemos ok (anti-enumeración): solo si el número coincide con el
 * que radicó el caso se genera y envía el OTP por WhatsApp.
 */
export async function POST(req: NextRequest) {
  let body: { codigo?: string; telefono?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const codigo = (body.codigo ?? "").trim().toUpperCase();
  const telefono = normalizaTelefono(body.telefono ?? "");
  if (!/^CCC-\d{4}-\d{4,}$/.test(codigo) || telefono.length !== 10) {
    return NextResponse.json({ error: "datos incompletos" }, { status: 400 });
  }

  const respuestaNeutra = NextResponse.json({
    ok: true,
    mensaje: `Si el número coincide con el que radicó el caso, en unos segundos le llegará un código por WhatsApp (vence en ${OTP_MINUTOS} minutos).`,
  });

  const db = supabaseAdmin();
  const { data: caso } = await db.from("casos").select("id").eq("codigo_publico", codigo).maybeSingle();
  if (!caso) return respuestaNeutra;

  const { data: contacto } = await db
    .from("casos_contacto")
    .select("telefono")
    .eq("caso_id", caso.id)
    .maybeSingle();
  if (!contacto?.telefono || normalizaTelefono(contacto.telefono) !== telefono) {
    return respuestaNeutra;
  }

  // Anti-abuso: máximo 3 códigos por caso por hora
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("otp_verificaciones")
    .select("id", { count: "exact", head: true })
    .eq("caso_id", caso.id)
    .gte("created_at", haceUnaHora);
  if ((count ?? 0) >= 3) return respuestaNeutra;

  const otp = generaOtp();
  await db.from("otp_verificaciones").insert({
    caso_id: caso.id,
    telefono: contacto.telefono,
    codigo_hash: hashOtp(otp, caso.id),
    expira_at: new Date(Date.now() + OTP_MINUTOS * 60 * 1000).toISOString(),
  });

  await enviarTexto(
    contacto.telefono,
    `Tu código de verificación de Cada Casa Cuenta es *${otp}*. Vence en ${OTP_MINUTOS} minutos.\n\n` +
      `Si no lo pediste, ignora este mensaje: nadie puede ver tu caso sin este código.`
  );

  return respuestaNeutra;
}
