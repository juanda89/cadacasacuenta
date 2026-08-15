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
