# Integraciones — Cada Casa Cuenta

## Kapso (WhatsApp) — sí, hay que configurar un webhook

Número operativo: **+57 313 7821926**. Kapso entrega los mensajes entrantes por webhook HTTPS; sin él el bot no escucha nada.

**Qué hay que hacer en el panel de Kapso:**
1. Registrar un webhook de tipo *Kapso* (no *Meta*: el formato de Kapso ya viene normalizado) apuntando a `https://<dominio-vercel>/api/whatsapp`.
2. Suscribirlo al evento `whatsapp.message.received` (y a los de ciclo de vida de conexión, para saber si el número se cae).
3. Copiar el **secret** que genera Kapso a `KAPSO_WEBHOOK_SECRET` en el `.env`.

**Contrato que impone Kapso (y cómo lo cumplimos):**

| Kapso | Nuestra respuesta |
|---|---|
| Hay que responder `200 OK` en **menos de 10 segundos** | El endpoint solo valida, encola y responde. El LLM y la transcripción de audio corren después: un modelo tardaría más de 10 s y dispararía reintentos. |
| Reintenta a los 10, 40 y 90 s si no hay ACK | Idempotencia real: `casos.origen_ref` y `necesidades.origen_ref` son `unique`. Un reintento no crea un caso duplicado. |
| Firma `X-Webhook-Signature` (HMAC-SHA256) | Se valida contra `KAPSO_WEBHOOK_SECRET` **antes** de leer el cuerpo. Sin firma válida, 401. |
| `X-Idempotency-Key` (UUID) | Es el valor que guardamos en `origen_ref`. |

El webhook escribe con `SUPABASE_SERVICE_ROLE_KEY` (bypasa RLS por diseño; es el único componente que lo hace). Esa key **jamás** va al navegador.

## Cerebro del agente — OpenRouter

- **Principal: `openai/gpt-5.6-luna`** — $0.10 por millón de tokens de entrada y $0.60 de salida, con 1 M de contexto. Para un bot conversacional de alto volumen en emergencia es la opción correcta: **30× más barato que Kimi K3** ($3.00 / $15.00).
- **Respaldo: `moonshotai/kimi-k3`** — se usa solo si Luna falla o para casos que requieran más razonamiento.
- Las notas de voz se transcriben antes de llegar al modelo; la transcripción se guarda en `evidencias.transcripcion` y alimenta la descripción del caso.

## Despliegue

Vercel con el dominio que asigne (`*.vercel.app`) por ahora. Cuando exista dominio propio hay que actualizar: la URL del webhook en Kapso, `site_url` en `supabase/config.toml` y las Redirect URLs de Auth en Supabase.

## Estado de credenciales

| Servicio | Estado |
|---|---|
| Kapso | Funcionando (API key + número) |
| OpenRouter | Funcionando (agente + Seedance) |
| OpenAI Images | Funcionando (gpt-image-2) |
| Supabase | Proyecto vivo; **ambas llaves verificadas** (`anon` y `service_role`). **Falta**: aplicar el esquema — por SQL Editor (pegar `supabase/aplicar_todo.sql`) o por CLI con la contraseña de BD |
