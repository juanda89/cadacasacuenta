-- ============================================================
-- Cada Casa Cuenta — Memoria conversacional del bot de WhatsApp
-- Solo la toca el webhook (service_role). Sin políticas: RLS activo
-- + revoke = invisible para anon y authenticated.
-- ============================================================

create table public.bot_conversaciones (
  telefono text primary key,
  kapso_conversation_id text,
  caso_id uuid references public.casos (id) on delete set null,
  fase text not null default 'nueva'
    check (fase in ('nueva', 'esperando_consentimiento', 'recolectando', 'cerrado', 'rechazado')),
  historial jsonb not null default '[]'::jsonb,
  mensajes_procesados text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bot_conversaciones is 'Estado por teléfono del agente de WhatsApp: fase, caso activo, historial LLM y dedupe de message_ids (reintentos de Kapso).';

create index bot_conversaciones_caso_idx on public.bot_conversaciones (caso_id);

create trigger tg_bot_conversaciones_updated before update on public.bot_conversaciones
  for each row execute function privado.set_updated_at();

alter table public.bot_conversaciones enable row level security;
revoke all on public.bot_conversaciones from anon, authenticated;
