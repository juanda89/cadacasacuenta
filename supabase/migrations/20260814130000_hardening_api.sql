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
