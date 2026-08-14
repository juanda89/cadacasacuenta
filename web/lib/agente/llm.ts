import "server-only";

type Msg = { role: "system" | "user" | "assistant"; content: string };

// Cerebro del agente: OpenRouter con Luna (30x más barato que Kimi K3).
// Si Luna falla, un reintento con Kimi antes de rendirse.
export async function completa(messages: Msg[], jsonEsperado = true): Promise<string> {
  const modelos = [
    process.env.AGENTE_MODELO ?? "openai/gpt-5.6-luna",
    process.env.AGENTE_MODELO_FALLBACK ?? "moonshotai/kimi-k3",
  ];
  let ultimoError: unknown = null;
  for (const model of modelos) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4,
          ...(jsonEsperado ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${model}: respuesta vacía`);
      return content;
    } catch (e) {
      ultimoError = e;
      console.error("llm fallo", e);
    }
  }
  throw ultimoError;
}

// Transcripción de notas de voz con OpenAI (la key de imágenes también sirve
// para audio). El texto resultante entra a la conversación y a la evidencia.
export async function transcribe(audio: ArrayBuffer, mime: string): Promise<string | null> {
  const form = new FormData();
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "mp3";
  form.append("file", new Blob([audio], { type: mime }), `nota.${ext}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "es");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
    body: form,
  });
  if (!res.ok) {
    console.error("transcripcion fallo", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.text ?? null;
}
