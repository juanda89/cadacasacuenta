-- ============================================================
-- Cada Casa Cuenta — Coordenadas planas MAGNA-SIRGAS (petición del equipo SIG)
--
-- Además de lat/lng (WGS84 geográficas), cada superficie expone la coordenada
-- plana en MAGNA-SIRGAS / Colombia Bogotá zone (EPSG:3116) — el sistema que
-- usan ArcGIS/QGIS en Colombia — para cruzar el registro con otra cartografía
-- sin reproyectar a mano.
--
-- En las vistas PÚBLICAS la transformación parte del punto YA redondeado
-- (~110 m): la anonimización no se puede deshacer restando proyecciones.
-- ============================================================

-- Público: se agregan al FINAL (create or replace view exige no reordenar)
create or replace view public.caso_publico as
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
  c.created_at,
  round(extensions.st_x(extensions.st_transform(extensions.st_setsrid(extensions.st_point(
    round(extensions.st_x(c.ubicacion::extensions.geometry)::numeric, 3)::double precision,
    round(extensions.st_y(c.ubicacion::extensions.geometry)::numeric, 3)::double precision
  ), 4326), 3116))::numeric, 1) as este_magna,
  round(extensions.st_y(extensions.st_transform(extensions.st_setsrid(extensions.st_point(
    round(extensions.st_x(c.ubicacion::extensions.geometry)::numeric, 3)::double precision,
    round(extensions.st_y(c.ubicacion::extensions.geometry)::numeric, 3)::double precision
  ), 4326), 3116))::numeric, 1) as norte_magna
from public.casos c
left join lateral (
  select e.dictamen, e.created_at as dictamen_at
  from public.evaluaciones e
  where e.caso_id = c.id
    and not e.preliminar
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

comment on view public.caso_publico is 'Superficie pública anonimizada. lat/lng WGS84 y este/norte MAGNA-SIRGAS Bogotá (EPSG:3116), ambas derivadas del punto redondeado a ~110 m.';

-- mapa_publico es select * de caso_publico: se recrea para heredar las columnas
create or replace view public.mapa_publico as
select * from public.caso_publico where lat is not null;

-- Interno (profesionales/autoridades, RLS): coordenada EXACTA también en MAGNA
create or replace view public.casos_priorizados
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
  ) as prioridad,
  extensions.st_y(c.ubicacion::extensions.geometry) as lat,
  extensions.st_x(c.ubicacion::extensions.geometry) as lng,
  round(extensions.st_x(extensions.st_transform(c.ubicacion::extensions.geometry, 3116))::numeric, 2) as este_magna,
  round(extensions.st_y(extensions.st_transform(c.ubicacion::extensions.geometry, 3116))::numeric, 2) as norte_magna
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
