# Base de datos — Cada Casa Cuenta

Esquema completo en `migrations/` (3 migraciones) + datos de prueba en `seed.sql`.

## Modelo

- **`casos`** — la unidad es el **hogar**: puede reportar daño estructural, falta de vivienda, o ambos (flags no excluyentes). Incluye ubicación PostGIS, consentimiento habeas data, composición del hogar para priorización, casos colectivos, idempotencia del bot (`origen_ref`) y código público `CCC-YYYY-NNNN`.
- **`casos_contacto`** — PII de contacto separada de `casos`. Sin política de SELECT: el único acceso por API es la RPC `contacto_caso(caso_id)`, que exige caso asignado (o admin) y **deja bitácora** (`contacto_consultado`).
- **`necesidades`** — necesidades humanitarias del hogar (albergue, agua, alimentos, salud, medicamentos, psicosocial, protección).
- **`evidencias`** — fotos/audios/documentos; las notas de voz guardan transcripción.
- **`evaluaciones`** — dictamen del profesional (semáforo) + checklist NSR-10 opcional en jsonb.
- **`profesionales`** — voluntarios; trabajan de inmediato en `pendiente`, admin verifica.
- **`caso_eventos`** — bitácora append-only (timeline + auditoría).
- **Vistas y RPCs públicas:** `caso_publico` (página por código, funciona sin ubicación), `mapa_publico` (solo georreferenciados) y `mapa_publico_bbox()` (viewport con índice GiST) — todas anonimizadas con coordenada redondeada a ~110 m, security definer INTENCIONAL. `casos_priorizados` (score de urgencia, coordenada exacta) respeta RLS.
- **Blindaje:** columnas sensibles protegidas por triggers (`privado.tg_*_protegido`), bitácora escrita solo por triggers/service_role, "activo" exige evidencia de matrícula subida, y hardening de default privileges (incluye `PUBLIC` en funciones). Revisión adversarial: 21 hallazgos corregidos el 2026-08-14.

## Roles

| Rol | Acceso |
|---|---|
| `anon` | Solo `mapa_publico` |
| `authenticated` (profesional `pendiente`/`verificado`) | Ve casos completos, toma casos libres, evalúa los suyos |
| admin (`app_metadata.rol = 'admin'`) | Todo vía políticas; columnas sensibles solo por dashboard/service |
| `service_role` (webhook Kapso) | Escribe casos/necesidades/evidencias del bot; bypasa RLS |

## Estado: APLICADO ✅

Aplicado el 2026-08-14 al proyecto `uopmhtkxnmwzynpksgqk` (172 sentencias, 0 fallos) con datos de prueba. Verificado en vivo contra la API real con la `anon` key:

| Prueba | Resultado |
|---|---|
| `anon` lee `mapa_publico` | ✅ permitido — coordenadas redondeadas (5.695 / −76.661) |
| `anon` lee `casos`, `casos_contacto`, `consentimientos`, `casos_priorizados` | ✅ **bloqueado** (`42501 permission denied`) |
| `anon` intenta insertar un caso | ✅ **bloqueado** |
| RPC `mapa_publico_bbox` por viewport | ✅ devuelve los 5 casos georreferenciados |
| Caso sin ubicación (`CCC-2026-0006`) | ✅ ausente del mapa, presente en `caso_publico` |
| Necesidades urgentes en superficie pública | ✅ tipos y urgencia sin exponer al hogar |

Para reaplicar desde cero: correr `00_reset_destructivo.sql` (borra el esquema `public`) y luego las migraciones en orden.

## Aplicar (referencia)

```bash
supabase link --project-ref <ref>
```

```bash
supabase db push
```

Con Docker local: `supabase start` y `supabase db reset` (aplica migraciones + seed).

Después de aplicar: correr advisors (`supabase db advisors` o MCP `get_advisors`) y verificar en el dashboard que las tablas de `public` NO estén expuestas a `anon` más allá de la vista (Data API settings).

**Admin inicial:** asignar rol vía SQL una vez creado el usuario:
`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"admin"}' where email = '...';`
