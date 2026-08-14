-- ============================================================
-- Cada Casa Cuenta — Consentimiento habeas data VERIFICABLE
-- Ley 1581 de 2012 / Decreto 1074 de 2015
--
-- Requisito de producto (2026-08-14): al inicio de la conversación el bot
-- pregunta si acepta el tratamiento de datos personales, y la aceptación debe
-- poder VERIFICARSE en el futuro. No basta un boolean: se archiva la evidencia
-- literal — qué texto exacto se le mostró, qué respondió (texto o transcripción
-- de la nota de voz), y el ID del mensaje de WhatsApp.
--
-- casos.consentimiento_* sigue siendo el flag operativo; esta tabla es el
-- archivo probatorio append-only.
-- ============================================================

-- Texto legal exacto por versión: "v1" debe resolver a las palabras precisas
-- que vio la persona.
create table public.consentimiento_versiones (
  version text primary key,
  texto text not null,
  vigente_desde timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Evidencia de cada aceptación (o rechazo), append-only
create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid references public.casos (id) on delete restrict,
  telefono text not null,
  version text not null references public.consentimiento_versiones (version),
  acepta boolean not null,
  respuesta_literal text not null,
  respuesta_es_transcripcion boolean not null default false,
  kapso_message_id text,
  kapso_conversation_id text,
  otorgado_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.consentimientos is 'Archivo probatorio de habeas data: evidencia literal de cada aceptación/rechazo. on delete RESTRICT: no se borra un caso sin resolver primero qué pasa con su evidencia de consentimiento.';
comment on column public.consentimientos.respuesta_literal is 'Lo que la persona escribió, o la transcripción de su nota de voz (respuesta_es_transcripcion=true). El audio original queda en evidencias.';

create index consentimientos_caso_idx on public.consentimientos (caso_id);
create index consentimientos_telefono_idx on public.consentimientos (telefono);

-- Versión inicial del texto (ajustar redacción legal antes de producción)
insert into public.consentimiento_versiones (version, texto) values
  ('v1',
   'Antes de empezar necesito su autorización: los datos que me comparta (ubicación, fotos, su nombre y este número de teléfono) se usarán únicamente para registrar el estado de su vivienda y las necesidades de su hogar, y ponerlos a disposición de los profesionales voluntarios y las autoridades de la emergencia. Puede pedir corrección o eliminación de sus datos en cualquier momento escribiendo a este mismo número. ¿Autoriza el uso de sus datos para este fin? (Ley 1581 de 2012)');

-- ------------------------------------------------------------
-- Seguridad: PII probatoria. Solo service_role (bot) escribe; solo admin lee
-- por API. Append-only para todos.
-- ------------------------------------------------------------
alter table public.consentimiento_versiones enable row level security;
alter table public.consentimientos enable row level security;

revoke all on public.consentimientos from anon, authenticated;
revoke all on public.consentimiento_versiones from anon;
revoke insert, update, delete on public.consentimiento_versiones from authenticated;

-- Los profesionales pueden leer el texto legal vigente (lo muestran en campo)
create policy consentimiento_versiones_select on public.consentimiento_versiones
  for select to authenticated
  using (true);

-- Solo admins consultan la evidencia por API (auditoría)
create policy consentimientos_select_admin on public.consentimientos
  for select to authenticated
  using ((select privado.es_admin()));

-- Nadie actualiza ni borra evidencia por API (ni admin): archivo probatorio.
-- (sin políticas de insert/update/delete para authenticated + revoke arriba;
-- el bot escribe con service_role)
