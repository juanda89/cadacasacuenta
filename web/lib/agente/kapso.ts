import "server-only";

// Proxy Meta de Kapso: rutas compatibles con la Cloud API de WhatsApp,
// autenticadas con X-API-Key (no Bearer).
const BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

function headers() {
  return {
    "X-API-Key": process.env.KAPSO_API_KEY!,
    "Content-Type": "application/json",
  };
}

export async function enviarTexto(to: string, body: string) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID!;
  const res = await fetch(`${BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    console.error("kapso enviarTexto", res.status, await res.text());
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Envía los globos EN ORDEN, respetando la demora de tipeo de cada uno.
// Eso es lo que hace que el bot se sienta humano (kit-estilo-whatsapp).
export async function enviarGlobos(to: string, globos: { texto: string; demoraMs: number }[]) {
  for (const g of globos) {
    await espera(g.demoraMs);
    await enviarTexto(to, g.texto);
    await espera(250); // pequeño respiro entre envíos
  }
}

// Marca el mensaje como leído y muestra "escribiendo..." mientras piensa el LLM.
export async function indicarEscribiendo(messageId: string | null | undefined) {
  if (!messageId) return;
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID!;
  try {
    await fetch(`${BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    });
  } catch (e) {
    console.warn("kapso typing falló", e);
  }
}

// Mensaje con botones (p. ej. la autorización de datos: Sí / No).
export async function enviarBotones(
  to: string,
  body: string,
  botones: { id: string; titulo: string }[]
) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID!;
  const res = await fetch(`${BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: botones.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo } })),
        },
      },
    }),
  });
  if (!res.ok) {
    // Si los botones fallan (p. ej. límite de la API), cae a texto plano.
    console.error("kapso enviarBotones", res.status, await res.text());
    await enviarTexto(to, `${body}\n\nResponda SÍ para aceptar o NO para no continuar.`);
  }
}

// Descarga un medio (foto/audio) de un mensaje entrante.
// GET /{media_id} devuelve un download_url ya autenticado (válido ~4 min).
export async function descargarMedia(mediaId: string): Promise<ArrayBuffer | null> {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID!;
  const urlRes = await fetch(
    `${BASE}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`,
    { headers: headers() }
  );
  if (!urlRes.ok) {
    console.error("kapso get-media-url", urlRes.status, await urlRes.text());
    return null;
  }
  const data = await urlRes.json();
  const mediaUrl: string | undefined = data.download_url ?? data.url;
  if (!mediaUrl) return null;
  const bin = await fetch(mediaUrl);
  if (!bin.ok) return null;
  return bin.arrayBuffer();
}
