-- ============================================================
-- Cada Casa Cuenta — Reglas de los requisitos mínimos
--
-- Va aparte de 20260814190000 a propósito: Postgres no deja usar un valor de
-- enum recién agregado dentro de la misma transacción que lo creó.
-- ============================================================

-- Los casos nuevos nacen en borrador. Un caso solo "existe" cuando cumple.
alter table public.casos alter column estado set default 'borrador';

-- ------------------------------------------------------------
-- Qué le falta a un caso: única fuente de verdad, la usan el trigger y el bot
-- ------------------------------------------------------------
create or replace function public.caso_minimos(p_caso uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tiene_ubicacion', c.ubicacion is not null,
    'tiene_evidencia', exists (select 1 from public.evidencias e where e.caso_id = c.id),
    'tiene_descripcion', coalesce(length(btrim(c.descripcion)), 0) >= 15,
    'cumple',
      c.ubicacion is not null
      and exists (select 1 from public.evidencias e where e.caso_id = c.id)
      and coalesce(length(btrim(c.descripcion)), 0) >= 15
  )
  from public.casos c
  where c.id = p_caso;
$$;

comment on function public.caso_minimos is 'Mínimos para que un caso salga de borrador: pin de ubicación, al menos una evidencia y un relato de al menos 15 caracteres.';

revoke execute on function public.caso_minimos(uuid) from public, anon, authenticated;
grant execute on function public.caso_minimos(uuid) to service_role;

-- ------------------------------------------------------------
-- Última línea de defensa: nadie saca un caso de borrador sin cumplir
-- ------------------------------------------------------------
create or replace function privado.exige_minimos_caso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb;
  faltan text[] := '{}';
begin
  -- Solo se controla la promoción: borrador -> cualquier otro estado.
  if old.estado <> 'borrador' or new.estado = 'borrador' then
    return new;
  end if;

  m := public.caso_minimos(new.id);

  if not (m->>'tiene_ubicacion')::boolean then
    faltan := array_append(faltan, 'ubicación (pin de WhatsApp o dirección geocodificada)');
  end if;
  if not (m->>'tiene_evidencia')::boolean then
    faltan := array_append(faltan, 'al menos una evidencia');
  end if;
  if not (m->>'tiene_descripcion')::boolean then
    faltan := array_append(faltan, 'descripción de lo ocurrido');
  end if;

  if array_length(faltan, 1) > 0 then
    raise exception 'el caso % no cumple los mínimos para registrarse; falta: %',
      new.codigo_publico, array_to_string(faltan, ', ')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_casos_exige_minimos on public.casos;
create trigger tg_casos_exige_minimos
  before update of estado on public.casos
  for each row execute function privado.exige_minimos_caso();

-- ------------------------------------------------------------
-- Superficie pública: un borrador no cuenta, no se mapea, no se ve
-- ------------------------------------------------------------
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
where c.consentimiento_datos
  and c.estado <> 'borrador';

comment on view public.caso_publico is 'Superficie pública por código. Excluye borradores (casos sin ubicación, evidencia o relato). Security definer INTENCIONAL; coordenadas redondeadas a 3 decimales (~110 m).';

-- La cola de los profesionales tampoco ve borradores: nadie visita un caso
-- del que no se sabe dónde queda ni qué pasó.
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
) nec on true
where c.estado <> 'borrador';

comment on view public.casos_priorizados is 'Score de urgencia para la cola de profesionales. Excluye borradores.';

grant select on public.caso_publico to anon, authenticated;
grant select on public.mapa_publico to anon, authenticated;
grant select on public.casos_priorizados to authenticated;
