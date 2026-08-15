import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  COOKIE_SEGUIMIENTO,
  emiteToken,
  hashOtp,
  normalizaTelefono,
  OTP_MAX_INTENTOS,
  SESION_DIAS,
} from "@/lib/seguimiento";

export const dynamic = "force-dynamic";

/**
 * Paso 2: verificar el OTP. Si es correcto → cookie firmada que abre SOLO este
 * caso durante 7 días, y bitácora 'seguimiento_verificado' en el caso.
 */
export async function POST(req: NextRequest) {
  let body: { codigo?: string; telefono?: string; otp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const codigo = (body.codigo ?? "").trim().toUpperCase();
  const telefono = normalizaTelefono(body.telefono ?? "");
  const otp = (body.otp ?? "").replace(/\D/g, "");
  if (!codigo || telefono.length !== 10 || otp.length !== 6) {
    return NextResponse.json({ error: "datos incompletos" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: caso } = await db.from("casos").select("id").eq("codigo_publico", codigo).maybeSingle();
  if (!caso) return NextResponse.json({ error: "código o teléfono no coinciden" }, { status: 401 });

  const { data: reg } = await db
    .from("otp_verificaciones")
    .select("*")
    .eq("caso_id", caso.id)
    .eq("usado", false)
    .gte("expira_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!reg || normalizaTelefono(reg.telefono) !== telefono || reg.intentos >= OTP_MAX_INTENTOS) {
    return NextResponse.json(
      { error: "El código venció o no hay una solicitud activa. Pide uno nuevo." },
      { status: 401 }
    );
  }

  if (reg.codigo_hash !== hashOtp(otp, caso.id)) {
    await db
      .from("otp_verificaciones")
      .update({ intentos: reg.intentos + 1 })
      .eq("id", reg.id);
    const restantes = OTP_MAX_INTENTOS - reg.intentos - 1;
    return NextResponse.json(
      { error: restantes > 0 ? `Código incorrecto. Te quedan ${restantes} intentos.` : "Código incorrecto. Pide uno nuevo." },
      { status: 401 }
    );
  }

  await db.from("otp_verificaciones").update({ usado: true }).eq("id", reg.id);
  await db.from("caso_eventos").insert({
    caso_id: caso.id,
    actor_tipo: "ciudadano",
    accion: "seguimiento_verificado",
    detalle: { via: "otp_whatsapp" },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SEGUIMIENTO, emiteToken(codigo), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESION_DIAS * 24 * 60 * 60,
  });
  return res;
}
