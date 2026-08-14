-- ============================================================
-- Cada Casa Cuenta — Esquema inicial (v2, tras revisión adversarial)
-- Registro humanitario de vivienda y necesidades · Terremoto Chocó 2026
-- La unidad de registro es el HOGAR, no el edificio.
--
-- Decisiones de seguridad clave:
--   · Los datos de contacto viven en casos_contacto, NUNCA en casos:
--     solo se leen vía RPC contacto_caso() que deja bitácora (matriz de
--     campos: "Alto — restringido, siempre con bitácora").
--   · La bitácora caso_eventos solo la escriben triggers y el service_role.
--   · Las vistas públicas redondean coordenadas a ~110 m.
-- ============================================================

create extension if not exists postgis with schema extensions;

-- Esquema privado: helpers y trigger functions que jamás se exponen por la Data API
create schema if not exists privado;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
create type public.estado_caso as enum ('reportado', 'asignado', 'visitado', 'evaluado', 'cerrado');
create type public.tipo_inmueble as enum ('casa', 'apartamento', 'edificio', 'otro');
create type public.relacion_vivienda as enum ('propietario', 'arrendatario', 'poseedor', 'familiar', 'vecino', 'lider_comunitario', 'otro');
create type public.habitabilidad_percibida as enum ('si', 'no', 'no_sabe');
create type public.dictamen_habitabilidad as enum ('habitable', 'uso_restringido', 'no_habitable');
create type public.dano_global as enum ('sin_dano', 'leve', 'moderado', 'severo', 'colapso');
create type public.sistema_constructivo as enum (
  'mamposteria_confinada', 'mamposteria_no_confinada', 'porticos_concreto',
  'muros_concreto', 'acero', 'madera', 'bahareque', 'tapia', 'otro'
);
create type public.tipo_necesidad as enum ('albergue', 'agua', 'alimentos', 'salud', 'medicamentos', 'psicosocial', 'proteccion', 'otra');
create type public.estado_necesidad as enum ('abierta', 'en_atencion', 'atendida');
create type public.tipo_evidencia as enum ('foto', 'audio', 'video', 'documento');
create type public.origen_evidencia as enum ('ciudadano', 'profesional', 'sistema');
create type public.profesion as enum ('ingenieria_civil', 'arquitectura', 'otra');
create type public.estado_verificacion as enum ('pendiente', 'verificado', 'rechazado', 'suspendido');
create type public.actor_evento as enum ('sistema', 'bot', 'ciudadano', 'profesional', 'admin');

-- ------------------------------------------------------------
-- Profesionales (ingenieros/arquitectos voluntarios)
-- Regla de producto: se registran, suben evidencia de matrícula y pueden
-- trabajar DE INMEDIATO en estado 'pendiente' (con badge); un admin verifica
-- después. Sin evidencia de matrícula NO se es "activo".
-- ------------------------------------------------------------
create table public.profesionales (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  profesion public.profesion not null,
  matricula text not null,
  evidencia_matricula_path text,
  universidad text,
  especialidad text,
  ciudad text not null,
  telefono text,
  disponibilidad text,
  capacidad_desplazamiento text,
  municipios text[] not null default '{}',
  estado_verificacion public.estado_verificacion not null default 'pendiente',
  verificado_por uuid references auth.users (id),
  verificado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profesionales is 'Voluntarios técnicos. activo = (pendiente|verificado) Y con evidencia de matrícula subida. rechazado/suspendido no operan.';

-- ------------------------------------------------------------
-- Casos (un hogar afectado; puede reportar daño, falta de vivienda, o ambos)
-- SIN datos de contacto: esos viven en casos_contacto.
-- ------------------------------------------------------------
create sequence public.casos_codigo_seq;

create or replace function privado.genera_codigo_caso()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'CCC-' || to_char(now(), 'YYYY') || '-' ||
         case when s.n < 10000 then lpad(s.n::text, 4, '0') else s.n::text end
  from (select nextval('public.casos_codigo_seq') as n) s
$$;

create table public.casos (
  id uuid primary key default gen_random_uuid(),
  codigo_publico text not null unique default privado.genera_codigo_caso(),

  -- Ubicación
  ubicacion extensions.geography (point, 4326),
  precision_gps_m numeric,
  ubicacion_por_texto boolean not null default false,
  direccion text,
  tipo_inmueble public.tipo_inmueble,
  unidad text,
  barrio text,
  referencia text,
  municipio_divipola text,
  departamento_divipola text,
  municipio_nombre text,
  departamento_nombre text,

  -- Qué reporta (no excluyentes: una familia puede tener la casa dañada Y necesidades)
  tiene_dano_estructural boolean not null default false,
  sin_vivienda boolean not null default false,

  -- Hogar
  relacion_vivienda public.relacion_vivienda,
  habitabilidad_percibida public.habitabilidad_percibida,
  num_habitantes integer check (num_habitantes >= 0),
  num_menores integer check (num_menores >= 0),
  num_adultos_mayores integer check (num_adultos_mayores >= 0),
  hay_discapacidad boolean not null default false,

  -- Caso colectivo (un líder reporta por su comunidad)
  es_colectivo boolean not null default false,
  num_familias integer not null default 1,
  constraint colectivo_coherente check (es_colectivo or num_familias = 1),
  constraint familias_positivas check (num_familias >= 1),

  descripcion text,
  autoriza_historia_publica boolean not null default false,

  -- Habeas data (Ley 1581 de 2012)
  consentimiento_datos boolean not null default false,
  consentimiento_at timestamptz,
  consentimiento_version text,
  constraint consentimiento_completo check (
    not consentimiento_datos or (consentimiento_at is not null and consentimiento_version is not null)
  ),

  -- Flujo
  estado public.estado_caso not null default 'reportado',
  asignado_a uuid references public.profesionales (id),
  asignado_at timestamptz,
  posible_duplicado_de uuid references public.casos (id),

  -- Canal / idempotencia del bot (reintentos de Kapso no duplican casos)
  kapso_conversation_id text,
  origen_ref text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.casos.ubicacion is 'WGS84. Nullable: puede llegar descrita por texto y geocodificarse después (ubicacion_por_texto=true).';
comment on column public.casos.origen_ref is 'Clave de idempotencia que escribe el bot (p. ej. kapso:<message_id>). Reintentos del webhook no duplican casos.';

-- Contacto del hogar: tabla aparte, jamás expuesta directamente por la API.
create table public.casos_contacto (
  caso_id uuid primary key references public.casos (id) on delete cascade,
  nombre text,
  telefono text,
  correo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.casos_contacto is 'PII de contacto. Sin políticas de SELECT: el único acceso de la API es la RPC contacto_caso(), que exige caso asignado (o admin) y deja bitácora.';

-- ------------------------------------------------------------
-- Necesidades humanitarias del hogar
-- ------------------------------------------------------------
create table public.necesidades (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  tipo public.tipo_necesidad not null,
  detalle text,
  urgente boolean not null default false,
  estado public.estado_necesidad not null default 'abierta',
  atendida_at timestamptz,
  origen_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Evidencias (fotos, notas de voz con transcripción, documentos)
-- ------------------------------------------------------------
create table public.evidencias (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  tipo public.tipo_evidencia not null,
  storage_path text not null unique,
  mime_type text,
  transcripcion text,
  origen public.origen_evidencia not null default 'ciudadano',
  subida_por uuid references public.profesionales (id),
  created_at timestamptz not null default now()
);

comment on column public.evidencias.transcripcion is 'Para notas de voz: transcripción automática que alimenta la descripción del caso.';

-- ------------------------------------------------------------
-- Evaluaciones técnicas (dictamen en visita)
-- ------------------------------------------------------------
create table public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  profesional_id uuid not null references public.profesionales (id),
  visita_ubicacion extensions.geography (point, 4326),
  visita_at timestamptz not null default now(),
  sistema_constructivo public.sistema_constructivo,
  numero_pisos integer check (numero_pisos > 0),
  area_m2 numeric check (area_m2 > 0),
  -- Checklist NSR-10 opcional: {"cimentacion": "...", "columnas": "...", ...}
  estados_elementos jsonb not null default '{}'::jsonb,
  dano_global public.dano_global,
  dictamen public.dictamen_habitabilidad not null,
  recomendacion text,
  riesgos_externos text[] not null default '{}',
  descripcion_riesgos text,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.evaluaciones.estados_elementos is 'Checklist detallado opcional (semáforo + checklist colapsable, decisión de producto). Claves: cimentacion, columnas, vigas, muros, entrepisos, cubierta, escaleras, fachada, instalaciones.';

-- ------------------------------------------------------------
-- Bitácora del caso (timeline + auditoría, append-only)
-- Solo la escriben los triggers (security definer) y el service_role.
-- ------------------------------------------------------------
create table public.caso_eventos (
  id bigint generated always as identity primary key,
  caso_id uuid not null references public.casos (id) on delete cascade,
  actor_tipo public.actor_evento not null,
  actor_id uuid,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Triggers: updated_at
-- ------------------------------------------------------------
create or replace function privado.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tg_profesionales_updated before update on public.profesionales
  for each row execute function privado.set_updated_at();
create trigger tg_casos_updated before update on public.casos
  for each row execute function privado.set_updated_at();
create trigger tg_casos_contacto_updated before update on public.casos_contacto
  for each row execute function privado.set_updated_at();
create trigger tg_necesidades_updated before update on public.necesidades
  for each row execute function privado.set_updated_at();
create trigger tg_evaluaciones_updated before update on public.evaluaciones
  for each row execute function privado.set_updated_at();

-- ------------------------------------------------------------
-- Helper de contexto: quién actúa (para bitácora en triggers)
-- ------------------------------------------------------------
create or replace function privado.actor_actual()
returns table (tipo public.actor_evento, actor uuid)
language sql
stable
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) is null then 'sistema'::public.actor_evento
      when coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'rol'), '') = 'admin' then 'admin'::public.actor_evento
      else 'profesional'::public.actor_evento
    end,
    (select auth.uid())
$$;

-- ------------------------------------------------------------
-- Triggers de flujo y protección
-- ------------------------------------------------------------

-- Creación de caso → bitácora
create or replace function privado.tg_caso_creado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.caso_eventos (caso_id, actor_tipo, accion, detalle)
  values (new.id, 'sistema', 'caso_creado', jsonb_build_object('codigo', new.codigo_publico));
  return new;
end;
$$;

create trigger tg_casos_creado after insert on public.casos
  for each row execute function privado.tg_caso_creado();

-- Asignación Y liberación: fija/limpia asignado_at, mueve estado, deja bitácora
create or replace function privado.tg_caso_asignacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.actor_evento;
  v_actor uuid;
begin
  select tipo, actor into v_tipo, v_actor from privado.actor_actual();
  if new.asignado_a is distinct from old.asignado_a then
    if new.asignado_a is not null then
      new.asignado_at := now();
      if new.estado = 'reportado' then
        new.estado := 'asignado';
      end if;
      insert into public.caso_eventos (caso_id, actor_tipo, actor_id, accion, detalle)
      values (new.id, v_tipo, v_actor, 'caso_asignado', jsonb_build_object('profesional', new.asignado_a));
    else
      new.asignado_at := null;
      if new.estado = 'asignado' then
        new.estado := 'reportado';
      end if;
      insert into public.caso_eventos (caso_id, actor_tipo, actor_id, accion, detalle)
      values (new.id, v_tipo, v_actor, 'caso_liberado', jsonb_build_object('profesional_anterior', old.asignado_a));
    end if;
  end if;
  return new;
end;
$$;

create trigger tg_casos_asignacion before update of asignado_a on public.casos
  for each row execute function privado.tg_caso_asignacion();

-- Protección de columnas sensibles de casos: solo admin o service_role
create or replace function privado.tg_casos_protegido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privilegiado boolean;
begin
  v_privilegiado :=
    (select auth.uid()) is null                                             -- service_role / migraciones / dashboard
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'rol'), '') = 'admin';

  if new.codigo_publico is distinct from old.codigo_publico then
    raise exception 'codigo_publico es inmutable';
  end if;
  if not v_privilegiado and (
       new.consentimiento_datos is distinct from old.consentimiento_datos
    or new.consentimiento_at is distinct from old.consentimiento_at
    or new.consentimiento_version is distinct from old.consentimiento_version
    or new.autoriza_historia_publica is distinct from old.autoriza_historia_publica
    or new.origen_ref is distinct from old.origen_ref
    or new.kapso_conversation_id is distinct from old.kapso_conversation_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'columna protegida: solo admin o service_role';
  end if;
  return new;
end;
$$;

create trigger tg_casos_protegido before update on public.casos
  for each row execute function privado.tg_casos_protegido();

-- Protección de profesionales: la verificación solo la toca admin/service;
-- cambiar matrícula/profesión/evidencia estando 'verificado' regresa a 'pendiente'.
create or replace function privado.tg_profesionales_protegido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privilegiado boolean;
begin
  v_privilegiado :=
    (select auth.uid()) is null
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'rol'), '') = 'admin';

  if not v_privilegiado then
    if new.estado_verificacion is distinct from old.estado_verificacion
       or new.verificado_por is distinct from old.verificado_por
       or new.verificado_at is distinct from old.verificado_at then
      raise exception 'la verificación solo la modifica un admin';
    end if;
    if old.estado_verificacion = 'verificado' and (
         new.matricula is distinct from old.matricula
      or new.profesion is distinct from old.profesion
      or new.evidencia_matricula_path is distinct from old.evidencia_matricula_path
    ) then
      new.estado_verificacion := 'pendiente';
      new.verificado_por := null;
      new.verificado_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger tg_profesionales_protegido before update on public.profesionales
  for each row execute function privado.tg_profesionales_protegido();

-- Evaluaciones: inmutables en su vínculo; correcciones de dictamen dejan rastro
create or replace function privado.tg_evaluacion_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.caso_id is distinct from old.caso_id
     or new.profesional_id is distinct from old.profesional_id then
    raise exception 'una evaluación no puede reasignarse de caso ni de profesional';
  end if;
  if new.dictamen is distinct from old.dictamen then
    insert into public.caso_eventos (caso_id, actor_tipo, actor_id, accion, detalle)
    values (new.caso_id, 'profesional', new.profesional_id, 'evaluacion_corregida',
            jsonb_build_object('dictamen_anterior', old.dictamen, 'dictamen_nuevo', new.dictamen));
  end if;
  return new;
end;
$$;

create trigger tg_evaluaciones_inmutable before update on public.evaluaciones
  for each row execute function privado.tg_evaluacion_inmutable();

-- Evaluación registrada: avanza estado del caso y deja bitácora con el dictamen
create or replace function privado.tg_evaluacion_registrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.caso_eventos (caso_id, actor_tipo, actor_id, accion, detalle)
  values (new.caso_id, 'profesional', new.profesional_id, 'evaluacion_registrada',
          jsonb_build_object('dictamen', new.dictamen, 'dano_global', new.dano_global));
  update public.casos
     set estado = 'evaluado'
   where id = new.caso_id
     and estado in ('reportado', 'asignado', 'visitado');
  return new;
end;
$$;

create trigger tg_evaluaciones_registrada after insert on public.evaluaciones
  for each row execute function privado.tg_evaluacion_registrada();

-- ------------------------------------------------------------
-- Detección de posibles duplicados (casos a menos de N metros)
-- ------------------------------------------------------------
create or replace function public.casos_cercanos(p_caso_id uuid, p_metros double precision default 30)
returns setof public.casos
language sql
stable
set search_path = ''
as $$
  select c2.*
  from public.casos c1
  join public.casos c2
    on c2.id <> c1.id
   and c1.ubicacion is not null
   and c2.ubicacion is not null
   and extensions.st_dwithin(c1.ubicacion, c2.ubicacion, p_metros)
  where c1.id = p_caso_id
$$;

comment on function public.casos_cercanos is 'RPC para profesionales: posibles duplicados por proximidad. Respeta RLS (invoker).';

-- ------------------------------------------------------------
-- Vistas públicas (anonimizadas, coordenada redondeada a ~110 m)
-- ------------------------------------------------------------

-- Página pública por código: funciona también para casos SIN ubicación.
-- DELIBERADAMENTE security definer (default): expone SOLO estas columnas a anon.
-- Nunca agregar aquí nombre, teléfono, correo, dirección ni unidad.
create view public.caso_publico as
select
  c.codigo_publico,
  c.estado,
  c.tiene_dano_estructural,
  c.sin_vivienda,
  c.es_colectivo,
  c.num_familias,
  c.municipio_divipola,
  c.municipio_nombre,
  c.departamento_nombre,
  c.barrio,
  round(extensions.st_y(c.ubicacion::extensions.geometry)::numeric, 3)::double precision as lat,
  round(extensions.st_x(c.ubicacion::extensions.geometry)::numeric, 3)::double precision as lng,
  ult.dictamen,
  ult.dictamen_at,
  coalesce(nec.abiertas, 0) as necesidades_abiertas,
  coalesce(nec.tipos, '{}') as necesidades_tipos,
  coalesce(nec.hay_urgente, false) as hay_necesidad_urgente,
  case when c.autoriza_historia_publica then c.descripcion end as historia,
  c.created_at
from public.casos c
left join lateral (
  select e.dictamen, e.created_at as dictamen_at
  from public.evaluaciones e
  where e.caso_id = c.id
  order by e.created_at desc
  limit 1
) ult on true
left join lateral (
  select count(*) as abiertas,
         array_agg(distinct n.tipo) as tipos,
         bool_or(n.urgente) as hay_urgente
  from public.necesidades n
  where n.caso_id = c.id and n.estado <> 'atendida'
) nec on true
where c.consentimiento_datos;

comment on view public.caso_publico is 'Superficie pública por código (con o sin ubicación). Security definer INTENCIONAL; coordenadas redondeadas a 3 decimales (~110 m).';

-- Mapa público: igual que caso_publico pero solo casos georreferenciados
create view public.mapa_publico as
select * from public.caso_publico where lat is not null;

comment on view public.mapa_publico is 'Vista pública anonimizada del mapa. La coordenada exacta solo existe para roles autenticados (casos_priorizados).';

-- Consulta por bbox para el mapa: usa el índice GiST de casos.ubicacion.
-- Security definer INTENCIONAL (misma superficie y columnas que mapa_publico).
create or replace function public.mapa_publico_bbox(
  min_lng double precision, min_lat double precision,
  max_lng double precision, max_lat double precision
)
returns setof public.caso_publico
language sql
stable
security definer
set search_path = ''
as $$
  select cp.*
  from public.caso_publico cp
  join public.casos c on c.codigo_publico = cp.codigo_publico
  where c.ubicacion is not null
    and c.ubicacion && extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
$$;

comment on function public.mapa_publico_bbox is 'Filtro por viewport del mapa público con índice GiST. Devuelve exactamente las columnas anonimizadas de caso_publico.';

-- Cola priorizada para profesionales y autoridades (respeta RLS: security_invoker)
create view public.casos_priorizados
with (security_invoker = true) as
select
  c.*,
  ult.dictamen as ultimo_dictamen,
  coalesce(nec.abiertas, 0) as necesidades_abiertas,
  coalesce(nec.hay_urgente, false) as hay_necesidad_urgente,
  (
    (case when c.sin_vivienda then 40 else 0 end) +
    (case when coalesce(c.num_menores, 0) > 0 then 15 else 0 end) +
    (case when c.hay_discapacidad then 15 else 0 end) +
    (case when coalesce(c.num_adultos_mayores, 0) > 0 then 10 else 0 end) +
    (case when coalesce(c.num_habitantes, 0) > 6 then 10 else 0 end) +
    (case when c.es_colectivo then least(c.num_familias, 20) else 0 end) +
    (case ult.dictamen
       when 'no_habitable' then 30
       when 'uso_restringido' then 15
       else 0 end) +
    (case when coalesce(nec.hay_urgente, false) then 10 else 0 end) +
    (case when coalesce(nec.abiertas, 0) > 0 then 5 else 0 end)
  ) as prioridad
from public.casos c
left join lateral (
  select e.dictamen
  from public.evaluaciones e
  where e.caso_id = c.id
  order by e.created_at desc
  limit 1
) ult on true
left join lateral (
  select count(*) as abiertas, bool_or(n.urgente) as hay_urgente
  from public.necesidades n
  where n.caso_id = c.id and n.estado <> 'atendida'
) nec on true;

comment on view public.casos_priorizados is 'Score de urgencia: sin techo, menores, discapacidad, adultos mayores, hacinamiento, colectivos, dictamen y necesidades (urgentes pesan doble).';

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
create index casos_ubicacion_idx on public.casos using gist (ubicacion);
create index casos_estado_idx on public.casos (estado);
create index casos_asignado_a_idx on public.casos (asignado_a);
create index casos_municipio_idx on public.casos (municipio_divipola);
create index casos_kapso_conversation_idx on public.casos (kapso_conversation_id);
create index casos_created_at_idx on public.casos (created_at desc);
create index casos_posible_duplicado_idx on public.casos (posible_duplicado_de);
create index casos_contacto_telefono_idx on public.casos_contacto (telefono);
create index necesidades_caso_idx on public.necesidades (caso_id);
create index necesidades_tipo_estado_idx on public.necesidades (tipo, estado);
create index evidencias_caso_idx on public.evidencias (caso_id);
create index evaluaciones_caso_idx on public.evaluaciones (caso_id);
create index evaluaciones_profesional_idx on public.evaluaciones (profesional_id);
create index caso_eventos_caso_idx on public.caso_eventos (caso_id, created_at);
create index profesionales_verificado_por_idx on public.profesionales (verificado_por);
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
-- ============================================================
-- Cada Casa Cuenta — Storage: buckets privados y políticas (v2)
--
-- evidencias/  → rutas OBLIGATORIAS casos/<caso_id>/<archivo>. Escribe el bot
--                (service_role); por API solo el profesional con ESE caso
--                asignado (o admin) lee/escribe, validando la ruta.
-- matriculas/  → evidencia de matrícula profesional. Cada profesional sube a
--                su carpeta (<auth.uid()>/...); leen el dueño y los admins.
--
-- Nota: si el proyecto hospedado rechaza políticas SQL sobre storage.objects
-- (restricciones de esquemas reservados), replicar estas políticas desde el
-- dashboard de Storage — el contenido es el contrato.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false),
       ('matriculas', 'matriculas', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Bucket evidencias: atado al caso asignado y a la ruta casos/<caso_id>/
-- ------------------------------------------------------------
create policy storage_evidencias_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias'
    and (
      (select privado.es_admin())
      or (
        (storage.foldername(name))[1] = 'casos'
        and exists (
          select 1 from public.casos c
          where c.id::text = (storage.foldername(name))[2]
            and c.asignado_a = (select auth.uid())
        )
      )
    )
  );

create policy storage_evidencias_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias'
    and (
      (select privado.es_admin())
      or (
        (select privado.es_profesional_activo())
        and (storage.foldername(name))[1] = 'casos'
        and exists (
          select 1 from public.casos c
          where c.id::text = (storage.foldername(name))[2]
            and c.asignado_a = (select auth.uid())
        )
      )
    )
  );

-- ------------------------------------------------------------
-- Bucket matriculas (upsert requiere INSERT + SELECT + UPDATE)
-- ------------------------------------------------------------
create policy storage_matriculas_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'matriculas'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select privado.es_admin()))
  );

create policy storage_matriculas_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'matriculas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy storage_matriculas_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'matriculas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'matriculas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- ============================================================
-- Cada Casa Cuenta — Hardening de la Data API (v2)
--
-- Contexto: la anon key es pública por diseño (viaja en el navegador); las
-- restricciones de origen (CORS) NO son un mecanismo de seguridad para una API
-- pública — cualquiera puede llamarla con curl. La protección real es que el
-- rol anon no tenga NINGÚN privilegio salvo las vistas anonimizadas, ni ahora
-- ni sobre objetos creados en el futuro. Además, Postgres concede EXECUTE a
-- PUBLIC en toda función nueva: hay que romper esa cadena, no solo "revoke
-- from anon".
-- ============================================================

-- Objetos futuros: ni anon ni PUBLIC reciben nada por defecto
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- Objetos actuales: barrido total
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- authenticated: solo las funciones que le competen
revoke execute on all functions in schema public from authenticated;
grant execute on function public.casos_cercanos(uuid, double precision) to authenticated;
grant execute on function public.contacto_caso(uuid) to authenticated;

-- Superficie pública única de anon (re-otorgada tras el barrido)
grant select on public.caso_publico to anon, authenticated;
grant select on public.mapa_publico to anon, authenticated;
grant execute on function public.mapa_publico_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;
grant select on public.casos_priorizados to authenticated;
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
-- ============================================================
-- Cada Casa Cuenta — Admin inicial
--
-- El rol admin vive en raw_app_meta_data (NO en user_metadata, que el propio
-- usuario puede editar). Como el usuario aún no existe en auth.users, se
-- promueve por correo: si ya existe se actualiza ahora, y si se registra
-- después lo hace el trigger.
-- ============================================================

create or replace function privado.promueve_admin_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) in ('vizcaya.jd@gmail.com') then
    new.raw_app_meta_data :=
      coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', 'admin');
  end if;
  return new;
end;
$$;

create trigger tg_promueve_admin_inicial
  before insert on auth.users
  for each row execute function privado.promueve_admin_inicial();

-- Por si la cuenta ya existía antes de esta migración
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', 'admin')
 where lower(email) in ('vizcaya.jd@gmail.com');

comment on function privado.promueve_admin_inicial is 'Bootstrap del primer admin. Para sumar admins después: update auth.users set raw_app_meta_data = raw_app_meta_data || ''{"rol":"admin"}'' where email = ...';
