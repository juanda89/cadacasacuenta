# Cada Casa Cuenta

**Registro humanitario de vivienda y necesidades — Terremoto del Chocó, 2026.**
*Ninguna familia sin contar.*

Las familias afectadas reportan por WhatsApp (texto, notas de voz, fotos, ubicación) conversando con un agente que registra el caso con consentimiento verificable (Ley 1581 de 2012). Ingenieros y arquitectos voluntarios toman los casos, visitan y emiten dictamen de habitabilidad. Un mapa público anonimizado muestra en tiempo real lo que el país no podía ver.

## Estructura

| Carpeta | Qué es |
|---|---|
| `web/` | Next.js 15: landing + mapa (MapLibre), página pública de caso, portal de profesionales y webhook del agente de WhatsApp (`/api/whatsapp`) |
| `supabase/` | Esquema completo: migraciones, RLS, storage, hardening y seed. Ver `supabase/README.md` |
| `docs/` | `NARRATIVA.md` (por qué existe), `MARCA.md` (sistema de identidad), `INTEGRACIONES.md` (Kapso/OpenRouter/deploy) |
| `assets/brand/` | Logo SVG, ilustraciones papercraft (gpt-image-2) y animaciones (Seedance 2.5) |

## Stack

Next.js (Vercel) · Supabase (Postgres + PostGIS + Auth + Storage, RLS estricto) · Kapso (WhatsApp) · OpenRouter (`gpt-5.6-luna`, respaldo `kimi-k3`) · MapLibre GL.

Variables de entorno: `web/.env.example`. Deploy: Vercel con root directory `web/`.

## Principios no negociables

- **La ilustración abraza; el dato dictamina** — calidez de vecino, rigor de ingeniero.
- El contacto de cada familia solo se lee vía RPC con bitácora; las vistas públicas redondean coordenadas a ~110 m.
- El bot habla de **usted**, pide consentimiento antes que cualquier dato, y jamás promete ayuda: promete registro, evidencia y visibilidad.
