-- ============================================================
-- Cada Casa Cuenta — Informe de revisión 2026-08-15
--
-- (4.6) El registro cubre cualquier edificación, no solo vivienda familiar:
--       se amplía el enum tipo_inmueble con local_comercial e institucional.
-- (3.2) El dictamen de un profesional SIN matrícula verificada nunca llega al
--       mapa público: nace marcado `preliminar` por trigger, y se promueve
--       automáticamente cuando un admin verifica la matrícula.
-- ============================================================

alter type public.tipo_inmueble add value if not exists 'local_comercial';
alter type public.tipo_inmueble add value if not exists 'institucional';

alter table public.evaluaciones
  add column if not exists preliminar boolean not null default false;

comment on column public.evaluaciones.preliminar is 'true = emitida por profesional aún no verificado. Jamás visible en superficies públicas; se promueve sola al verificar la matrícula.';

-- Al insertar: preliminar si el autor no está verificado
create or replace function privado.tg_evaluacion_preliminar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.preliminar := not exists (
    select 1 from public.profesionales p
    where p.id = new.profesional_id
      and p.estado_verificacion = 'verificado'
  );
  return new;
end;
$$;

create trigger tg_evaluaciones_preliminar before insert on public.evaluaciones
  for each row execute function privado.tg_evaluacion_preliminar();

-- Al verificar la matrícula: los dictámenes preliminares del profesional se
-- promueven a definitivos (y quedan en bitácora de cada caso)
create or replace function privado.tg_profesional_verificado_promueve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado_verificacion = 'verificado' and old.estado_verificacion <> 'verificado' then
    insert into public.caso_eventos (caso_id, actor_tipo, actor_id, accion, detalle)
    select e.caso_id, 'admin', new.verificado_por, 'dictamen_confirmado',
           jsonb_build_object('evaluacion', e.id, 'dictamen', e.dictamen)
    from public.evaluaciones e
    where e.profesional_id = new.id and e.preliminar;

    update public.evaluaciones
       set preliminar = false
     where profesional_id = new.id and preliminar;
  end if;
  return new;
end;
$$;

create trigger tg_profesionales_verificado_promueve after update of estado_verificacion on public.profesionales
  for each row execute function privado.tg_profesional_verificado_promueve();

-- Vistas públicas: el dictamen visible es SOLO el último NO preliminar.
-- (create or replace: misma lista de columnas, cambia solo el lateral)
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
  c.created_at
from public.casos c
left join lateral (
  select e.dictamen, e.created_at as dictamen_at
  from public.evaluaciones e
  where e.caso_id = c.id
    and not e.preliminar          -- (3.2) lo no verificado jamás sale al público
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
