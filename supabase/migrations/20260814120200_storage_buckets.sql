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
