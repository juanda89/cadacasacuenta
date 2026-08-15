-- ============================================================
-- Cada Casa Cuenta — Restaura los privilegios de service_role
--
-- Bug encontrado en producción: el webhook de WhatsApp no podía leer ni
-- escribir NADA ("permission denied for table casos"). El agente recibía
-- los mensajes, respondía 200 a Kapso y fallaba en silencio dentro de
-- after(): ningún caso llegaba a existir.
--
-- Causa: 00_reset_destructivo.sql hace `drop schema public cascade`. Eso
-- destruye los grants de tabla Y los ALTER DEFAULT PRIVILEGES que Supabase
-- deja puestos al crear el proyecto. El reset rehízo los permisos DE ESQUEMA
-- (usage/all on schema public) pero no los DE TABLA, y el hardening solo
-- volvió a otorgar la superficie de anon. service_role quedó sin nada.
--
-- Esta migración restaura service_role SIN reabrir anon/authenticated: el
-- hardening (20260814130000) sigue siendo la única superficie pública.
-- ============================================================

-- Objetos que ya existen
grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;
grant execute on all functions in schema public to postgres, service_role;

-- Objetos futuros: que ninguna migración nueva vuelva a dejar mudo al bot
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
alter default privileges in schema public grant execute on functions to postgres, service_role;

-- El esquema privado lo usan las funciones security definer; service_role
-- no lo toca por API, pero postgres debe conservarlo íntegro.
grant usage on schema privado to postgres, service_role;
grant all on all tables in schema privado to postgres;
grant execute on all functions in schema privado to postgres;

-- Reafirma el hardening: los grants masivos de arriba NO tocan a anon ni a
-- authenticated, pero dejarlo explícito hace la migración auditable.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant select on public.caso_publico to anon, authenticated;
grant select on public.mapa_publico to anon, authenticated;
grant select on public.casos_priorizados to authenticated;
grant execute on function public.mapa_publico_bbox(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.casos_cercanos(uuid, double precision) to authenticated;
grant execute on function public.contacto_caso(uuid) to authenticated;
