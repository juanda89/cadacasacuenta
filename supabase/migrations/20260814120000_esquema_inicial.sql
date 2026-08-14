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
    -- El operador se califica con OPERATOR(): con search_path='' (obligatorio en
    -- security definer) un '&&' pelado no resuelve al operador de PostGIS.
    and c.ubicacion operator(extensions.&&)
        extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
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
