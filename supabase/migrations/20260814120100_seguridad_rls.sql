-- ============================================================
-- Cada Casa Cuenta — Seguridad: RLS, roles y grants (v2, tras revisión)
--
-- Modelo de acceso:
--   anon            → SOLO caso_publico / mapa_publico (anonimizadas, coordenada
--                     redondeada) y la RPC mapa_publico_bbox. Nada más.
--   authenticated   → profesionales activos (= pendiente|verificado CON evidencia
--                     de matrícula subida) y admins.
--   service_role    → el webhook de Kapso (bot); bypasa RLS por diseño.
--   admin           → JWT app_metadata.rol = 'admin' (raw_app_meta_data, NUNCA
--                     user_metadata: es editable por el usuario).
--
-- El contacto del hogar (casos_contacto) NO tiene política de SELECT: el único
-- acceso por API es la RPC contacto_caso(), que exige caso asignado o admin y
-- deja bitácora. La bitácora solo la escriben triggers y service_role.
-- Las columnas sensibles se protegen con triggers (privado.tg_*_protegido),
-- no con grants por columna, para no bloquear a los admins por API.
-- ============================================================

-- ------------------------------------------------------------
-- Helpers (schema privado, no expuesto; security definer permitido ahí)
-- ------------------------------------------------------------
create or replace function privado.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'rol'), '') = 'admin'
$$;

create or replace function privado.es_profesional_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profesionales p
    where p.id = (select auth.uid())
      and p.estado_verificacion in ('pendiente', 'verificado')
      and p.evidencia_matricula_path is not null
  )
$$;

comment on function privado.es_profesional_activo is 'Activo = registrado, no rechazado/suspendido, Y con evidencia de matrícula subida. Sin evidencia no se opera.';

grant usage on schema privado to authenticated;
grant execute on function privado.es_admin() to authenticated;
grant execute on function privado.es_profesional_activo() to authenticated;

-- ------------------------------------------------------------
-- RLS on
-- ------------------------------------------------------------
alter table public.profesionales enable row level security;
alter table public.casos enable row level security;
alter table public.casos_contacto enable row level security;
alter table public.necesidades enable row level security;
alter table public.evidencias enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.caso_eventos enable row level security;

-- ------------------------------------------------------------
-- Recorte de privilegios
-- ------------------------------------------------------------
-- anon no toca ninguna tabla: su superficie son las vistas públicas y la RPC bbox
revoke all on public.profesionales, public.casos, public.casos_contacto,
           public.necesidades, public.evidencias, public.evaluaciones,
           public.caso_eventos
from anon;

-- La bitácora solo la escriben los triggers (security definer) y service_role:
-- ni INSERT directo para authenticated (una entrada forjada sería indistinguible
-- de un evento oficial y es imborrable).
revoke insert, update, delete on public.caso_eventos from authenticated;

-- El contacto jamás se lee/escribe directo por API con JWT de usuario
revoke all on public.casos_contacto from authenticated;

-- Nadie inserta casos por API salvo admin (el bot entra por service_role)
-- (la política de INSERT ya lo exige; el grant se mantiene para admins)

-- ------------------------------------------------------------
-- Políticas: profesionales
-- ------------------------------------------------------------
create policy profesionales_select_propio on public.profesionales
  for select to authenticated
  using (id = (select auth.uid()) or (select privado.es_admin()));

create policy profesionales_insert_propio on public.profesionales
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and estado_verificacion = 'pendiente'   -- nadie se registra ya verificado
  );

-- El trigger privado.tg_profesionales_protegido impide que un no-admin toque
-- estado_verificacion/verificado_* y regresa a 'pendiente' si un verificado
-- cambia matrícula/profesión/evidencia.
create policy profesionales_update_propio on public.profesionales
  for update to authenticated
  using (id = (select auth.uid()) or (select privado.es_admin()))
  with check (id = (select auth.uid()) or (select privado.es_admin()));

-- ------------------------------------------------------------
-- Políticas: casos
-- ------------------------------------------------------------
create policy casos_select_profesional on public.casos
  for select to authenticated
  using ((select privado.es_profesional_activo()) or (select privado.es_admin()));

-- Tomar un caso libre, trabajar el propio, o DEVOLVERLO (asignado_a → null).
-- El trigger tg_caso_asignacion completa asignado_at/estado/bitácora en ambos
-- sentidos; tg_casos_protegido blinda consentimiento/código/origen.
create policy casos_update_profesional on public.casos
  for update to authenticated
  using (
    (select privado.es_admin())
    or ((select privado.es_profesional_activo())
        and (asignado_a is null or asignado_a = (select auth.uid())))
  )
  with check (
    (select privado.es_admin())
    or asignado_a = (select auth.uid())
    or asignado_a is null
  );

create policy casos_insert_admin on public.casos
  for insert to authenticated
  with check ((select privado.es_admin()));

-- ------------------------------------------------------------
-- RPC de contacto: ÚNICO acceso al contacto del hogar por API.
-- Security definer en public de forma INTENCIONAL y documentada: exige caso
-- asignado (o admin) y deja bitácora 'contacto_consultado' (matriz de campos:
-- acceso Alto — restringido, siempre con bitácora).
-- ------------------------------------------------------------
create or replace function public.contacto_caso(p_caso_id uuid)
returns table (nombre text, telefono text, correo text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_autorizado boolean;
  v_tipo public.actor_evento;
  v_actor uuid;
begin
  select privado.es_admin() or exists (
    select 1 from public.casos c
    where c.id = p_caso_id and c.asignado_a = (select auth.uid())
  ) into v_autorizado;

  if not coalesce(v_autorizado, false) then
    raise exception 'sin permiso para el contacto de este caso';
  end if;

  select t.tipo, t.actor into v_tipo, v_actor from privado.actor_actual() t;
  insert into public.caso_eventos (caso_id, actor_tipo, actor_id, accion)
  values (p_caso_id, v_tipo, v_actor, 'contacto_consultado');

  return query
  select cc.nombre, cc.telefono, cc.correo
  from public.casos_contacto cc
  where cc.caso_id = p_caso_id;
end;
$$;

grant execute on function public.contacto_caso(uuid) to authenticated;

-- ------------------------------------------------------------
-- Políticas: necesidades
-- ------------------------------------------------------------
create policy necesidades_select_profesional on public.necesidades
  for select to authenticated
  using ((select privado.es_profesional_activo()) or (select privado.es_admin()));

-- El profesional asignado puede registrar necesidades que descubre en la visita
create policy necesidades_insert_asignado on public.necesidades
  for insert to authenticated
  with check (
    (select privado.es_admin())
    or exists (
      select 1 from public.casos c
      where c.id = caso_id and c.asignado_a = (select auth.uid())
    )
  );

create policy necesidades_update_asignado on public.necesidades
  for update to authenticated
  using (
    (select privado.es_admin())
    or exists (
      select 1 from public.casos c
      where c.id = caso_id and c.asignado_a = (select auth.uid())
    )
  )
  with check (
    (select privado.es_admin())
    or exists (
      select 1 from public.casos c
      where c.id = caso_id and c.asignado_a = (select auth.uid())
    )
  );

-- ------------------------------------------------------------
-- Políticas: evidencias (contienen fotos del hogar y transcripciones de voz →
-- solo el profesional ASIGNADO y los admins; el triage usa la descripción del caso)
-- ------------------------------------------------------------
create policy evidencias_select_asignado on public.evidencias
  for select to authenticated
  using (
    (select privado.es_admin())
    or exists (
      select 1 from public.casos c
      where c.id = caso_id and c.asignado_a = (select auth.uid())
    )
  );

create policy evidencias_insert_asignado on public.evidencias
  for insert to authenticated
  with check (
    (select privado.es_admin())
    or (
      (select privado.es_profesional_activo())
      and origen = 'profesional'
      and subida_por = (select auth.uid())
      and exists (
        select 1 from public.casos c
        where c.id = caso_id and c.asignado_a = (select auth.uid())
      )
    )
  );

-- ------------------------------------------------------------
-- Políticas: evaluaciones (dictámenes: visibles entre profesionales activos)
-- ------------------------------------------------------------
create policy evaluaciones_select_profesional on public.evaluaciones
  for select to authenticated
  using ((select privado.es_profesional_activo()) or (select privado.es_admin()));

create policy evaluaciones_insert_asignado on public.evaluaciones
  for insert to authenticated
  with check (
    (select privado.es_admin())
    or (
      (select privado.es_profesional_activo())
      and profesional_id = (select auth.uid())
      and exists (
        select 1 from public.casos c
        where c.id = caso_id and c.asignado_a = (select auth.uid())
      )
    )
  );

-- Corregir la propia evaluación exige seguir ACTIVO; el trigger
-- tg_evaluacion_inmutable impide reapuntarla y bitacorea cambios de dictamen.
create policy evaluaciones_update_autor on public.evaluaciones
  for update to authenticated
  using (
    (select privado.es_admin())
    or ((select privado.es_profesional_activo()) and profesional_id = (select auth.uid()))
  )
  with check (
    (select privado.es_admin())
    or ((select privado.es_profesional_activo()) and profesional_id = (select auth.uid()))
  );

-- ------------------------------------------------------------
-- Políticas: caso_eventos (bitácora: solo lectura por API)
-- ------------------------------------------------------------
create policy caso_eventos_select_asignado on public.caso_eventos
  for select to authenticated
  using (
    (select privado.es_admin())
    or exists (
      select 1 from public.casos c
      where c.id = caso_id and c.asignado_a = (select auth.uid())
    )
  );

-- ------------------------------------------------------------
-- Vistas y RPCs: superficie pública
-- ------------------------------------------------------------
grant select on public.caso_publico to anon, authenticated;
grant select on public.mapa_publico to anon, authenticated;
grant execute on function public.mapa_publico_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;
-- casos_priorizados respeta RLS (security_invoker): solo roles autenticados
revoke all on public.casos_priorizados from anon;
grant select on public.casos_priorizados to authenticated;
