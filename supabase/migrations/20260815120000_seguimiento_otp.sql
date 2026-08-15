-- ============================================================
-- Cada Casa Cuenta — Seguimiento verificado + insights diarios
--
-- Decisión de producto (2026-08-15): el detalle del caso deja de ser público.
-- La URL del caso muestra un TABLERO agregado (analizado por IA cada 24 h), y
-- el detalle solo se abre verificando por OTP el número que radicó el caso
-- (enviado por el propio WhatsApp del registro).
-- ============================================================

-- Códigos de un solo uso, con hash — el texto plano jamás se guarda
create table public.otp_verificaciones (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  telefono text not null,
  codigo_hash text not null,
  expira_at timestamptz not null,
  intentos integer not null default 0,
  usado boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.otp_verificaciones is 'OTP de seguimiento familiar: hash sha256, expira a los 10 min, máx. 5 intentos, un solo uso. Solo service_role.';

create index otp_verificaciones_caso_idx on public.otp_verificaciones (caso_id, created_at desc);

-- El análisis agregado que la IA produce cada 24 h para el tablero público
create table public.insights_diarios (
  id uuid primary key default gen_random_uuid(),
  generado_at timestamptz not null default now(),
  corte jsonb not null,
  insights jsonb not null,
  modelo text
);

comment on table public.insights_diarios is 'Lectura diaria del registro: cifras agregadas (corte) + insights redactados por IA. El tablero muestra la fila más reciente.';

create index insights_diarios_generado_idx on public.insights_diarios (generado_at desc);

-- Solo el servidor (service_role) toca estas tablas
alter table public.otp_verificaciones enable row level security;
alter table public.insights_diarios enable row level security;
revoke all on public.otp_verificaciones from anon, authenticated;
revoke all on public.insights_diarios from anon, authenticated;
