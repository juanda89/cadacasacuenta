import { NextRequest, NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { procesarMensaje, type MensajeEntrante } from "@/lib/agente";

export const maxDuration = 300; // el turno del agente (LLM + transcripción) corre tras el ACK

/**
 * Webhook de Kapso.
 * Contrato: ACK 200 en <10s o Kapso reintenta (10/40/90s). Por eso este
 * handler solo valida la firma y encola; el agente corre en `after()`.
 * La idempotencia vive en el agente (mensajes_procesados) y en la BD
 * (origen_ref unique), así que un reintento nunca duplica un caso.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Firma HMAC-SHA256 del cuerpo — sin firma válida no se procesa nada.
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (secret) {
    const firma = req.headers.get("x-webhook-signature") ?? "";
    const esperada = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "firma inválida" }, { status: 401 });
    }
  } else {
    console.warn("KAPSO_WEBHOOK_SECRET no configurado: firma sin verificar");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const mensajes = extraerMensajes(payload);
  after(async () => {
    for (const m of mensajes) {
      try {
        await procesarMensaje(m);
      } catch (e) {
        console.error("agente fallo", m.messageId, e);
      }
    }
  });

  return NextResponse.json({ ok: true, recibidos: mensajes.length });
}

/**
 * Normaliza el payload de Kapso (evento suelto o batch) a MensajeEntrante[].
 * Tolerante a variaciones de forma: busca los campos donde estén.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extraerMensajes(payload: any): MensajeEntrante[] {
  const eventos: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.events)
      ? payload.events
      : [payload];

  const out: MensajeEntrante[] = [];
  for (const ev of eventos) {
    const d = ev?.data ?? ev?.payload ?? ev;
    const msg = d?.message ?? d;
    const telefono: string | undefined = msg?.from ?? d?.from ?? d?.phone_number;
    const messageId: string | undefined = msg?.message_id ?? msg?.id ?? d?.message_id;
    if (!telefono || !messageId) continue;

    const tipo: string = msg?.type ?? "text";
    const e: MensajeEntrante = {
      messageId,
      conversationId: msg?.conversation_id ?? d?.conversation_id ?? null,
      telefono: telefono.startsWith("+") ? telefono : `+${telefono}`,
      tipo,
    };
    if (tipo === "text") {
      e.texto = typeof msg?.text === "string" ? msg.text : msg?.text?.body ?? "";
    } else if (tipo === "interactive" || tipo === "button") {
      // Respuesta a botones (p. ej. la autorización Sí/No): se normaliza a texto.
      e.tipo = "text";
      e.texto =
        msg?.interactive?.button_reply?.title ??
        msg?.interactive?.list_reply?.title ??
        msg?.button?.text ??
        "";
      e.botonId = msg?.interactive?.button_reply?.id ?? msg?.interactive?.list_reply?.id ?? null;
    } else if (tipo === "location") {
      e.lat = msg?.location?.latitude;
      e.lng = msg?.location?.longitude;
    } else {
      const media = msg?.[tipo];
      e.mediaId = media?.media_id ?? media?.id;
      e.mimeType = media?.mime_type;
    }
    out.push(e);
  }
  return out;
}
