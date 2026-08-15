-- ============================================================
-- Cada Casa Cuenta — Cola serializada del bot (fix de raíz de la ráfaga)
--
-- Síntoma (visto en producción): la persona manda varios mensajes seguidos,
-- cada uno dispara una invocación paralela del webhook, cada invocación
-- responde sin ver a las demás → globos duplicados y turnos entrelazados.
--
-- Diseño: cada mensaje se ENCOLA (bot_entrantes, con dedupe por message_id);
-- un solo drenador por conversación toma el candado (procesando_hasta),
-- espera el fin de la ráfaga y responde UNA vez con todo el contexto.
-- ============================================================

create table public.bot_entrantes (
  id bigint generated always as identity primary key,
  message_id text not null unique,      -- dedupe: reintentos de Kapso chocan aquí
  telefono text not null,
  payload jsonb not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'hecho', 'error')),
  created_at timestamptz not null default now()
);

create index bot_entrantes_cola_idx on public.bot_entrantes (telefono, estado, id);

alter table public.bot_conversaciones
  add column if not exists procesando_hasta timestamptz;

-- Candado atómico por conversación (crea la fila si no existe).
-- TTL: si un drenador muere, el candado expira solo.
create or replace function public.bot_toma_candado(p_tel text, p_ttl_seg integer default 120)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_tomado boolean := false;
begin
  insert into public.bot_conversaciones (telefono, fase, historial)
  values (p_tel, 'nueva', '[]'::jsonb)
  on conflict (telefono) do nothing;

  update public.bot_conversaciones
     set procesando_hasta = now() + make_interval(secs => p_ttl_seg)
   where telefono = p_tel
     and (procesando_hasta is null or procesando_hasta < now());
  v_tomado := found;
  return v_tomado;
end;
$$;

create or replace function public.bot_suelta_candado(p_tel text)
returns void
language sql
set search_path = ''
as $$
  update public.bot_conversaciones set procesando_hasta = null where telefono = p_tel;
$$;

-- Solo el service_role (webhook) usa todo esto
alter table public.bot_entrantes enable row level security;
revoke all on public.bot_entrantes from anon, authenticated;
revoke execute on function public.bot_toma_candado(text, integer) from anon, authenticated, public;
revoke execute on function public.bot_suelta_candado(text) from anon, authenticated, public;
