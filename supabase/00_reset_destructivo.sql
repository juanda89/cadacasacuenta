-- ============================================================
-- ⚠️  RESETEO DESTRUCTIVO — Cada Casa Cuenta
--
-- BORRA TODO el contenido previo del esquema `public` de este proyecto.
-- Autorizado por el usuario el 2026-08-14 ("puedes borrar todo lo que ya
-- existía en esa base de datos") sobre el proyecto uopmhtkxnmwzynpksgqk,
-- que no tenía datos de producción.
--
-- NO es una migración: vive fuera de migrations/ a propósito, para que nunca
-- se re-ejecute sola. Se corre UNA vez, a mano, antes de aplicar el esquema.
--
-- Qué NO toca: los esquemas internos de Supabase (auth, storage, realtime,
-- extensions). Solo se eliminan los objetos propios y las políticas que este
-- proyecto haya creado sobre storage.
-- ============================================================

-- 1. Políticas propias sobre storage (viven en el esquema storage, no en public)
drop policy if exists storage_evidencias_select on storage.objects;
drop policy if exists storage_evidencias_insert on storage.objects;
drop policy if exists storage_matriculas_select on storage.objects;
drop policy if exists storage_matriculas_insert on storage.objects;
drop policy if exists storage_matriculas_update on storage.objects;

-- 2. Trigger propio sobre auth.users (el bootstrap de admin)
drop trigger if exists tg_promueve_admin_inicial on auth.users;

-- 3. Buckets: Supabase PROHÍBE borrarlos por SQL ("Direct deletion from storage
--    tables is not allowed"). Si hiciera falta eliminarlos, se hace desde el
--    panel de Storage o por la Storage API. La migración los crea con
--    `on conflict do nothing`, así que re-aplicar es seguro.

-- 4. Esquemas de la aplicación: fuera completos
drop schema if exists privado cascade;
drop schema if exists public cascade;

-- 5. Recrear public con los permisos estándar de Supabase
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
comment on schema public is 'standard public schema';

-- Después de esto, ejecutar supabase/aplicar_todo.sql
