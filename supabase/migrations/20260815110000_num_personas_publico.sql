-- ============================================================
-- Cada Casa Cuenta — Personas afectadas en las superficies públicas
--
-- Decisión de producto (2026-08-15): la unidad que se pregunta y se muestra
-- SIEMPRE es el número de PERSONAS afectadas (num_habitantes; en reportes
-- colectivos es el total de la comunidad). num_familias queda como dato
-- secundario que solo se guarda si lo mencionan espontáneamente.
-- Es dato agregado no personal (matriz de campos): puede ser público.
-- ============================================================

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
  ), 4326), 3116))::numeric, 1) as norte_magna,
  c.num_habitantes as num_personas
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

create or replace view public.mapa_publico as
select * from public.caso_publico where lat is not null;
