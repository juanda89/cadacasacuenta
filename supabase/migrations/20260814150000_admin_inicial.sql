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
