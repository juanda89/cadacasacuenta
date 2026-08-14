import "server-only";

const BASE = "https://api.kapso.ai";

function headers() {
  return {
    Authorization: `Bearer ${process.env.KAPSO_API_KEY!}`,
    "Content-Type": "application/json",
  };
}

export async function enviarTexto(to: string, body: string) {
  const res = await fetch(`${BASE}/api/meta/whatsapp/messages/send-a-message`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      phone_number_id: process.env.KAPSO_PHONE_NUMBER_ID!,
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    console.error("kapso enviarTexto", res.status, await res.text());
  }
}

// Descarga un medio (foto/audio) de un mensaje entrante.
export async function descargarMedia(mediaId: string): Promise<ArrayBuffer | null> {
  const urlRes = await fetch(
    `${BASE}/api/meta/whatsapp/media/get-media-url?media_id=${encodeURIComponent(mediaId)}`,
    { headers: headers() }
  );
  if (!urlRes.ok) {
    console.error("kapso get-media-url", urlRes.status, await urlRes.text());
    return null;
  }
  const data = await urlRes.json();
  const mediaUrl: string | undefined = data.url ?? data.media_url ?? data.download_url;
  if (!mediaUrl) return null;
  const bin = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${process.env.KAPSO_API_KEY!}` } });
  if (!bin.ok) return null;
  return bin.arrayBuffer();
}
