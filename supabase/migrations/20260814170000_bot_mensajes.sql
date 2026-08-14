-- ============================================================
-- Cada Casa Cuenta — Dedupe atómico de mensajes del bot
--
-- Kapso reintenta (10/40/90s) y las personas mandan ráfagas de mensajes;
-- cada invocación del webhook corre en paralelo en Vercel. El array
-- mensajes_procesados de bot_conversaciones sufre lost-updates bajo carrera.
-- Este PK hace el dedupe atómico: INSERT gana exactamente una vez.
-- ============================================================

create table public.bot_mensajes (
  message_id text primary key,
  telefono text not null,
  created_at timestamptz not null default now()
);

comment on table public.bot_mensajes is 'Claim atómico por mensaje de WhatsApp: el primer INSERT procesa, los reintentos/paralelos reciben conflicto y no reprocesan.';

create index bot_mensajes_telefono_idx on public.bot_mensajes (telefono);

alter table public.bot_mensajes enable row level security;
revoke all on public.bot_mensajes from anon, authenticated;
