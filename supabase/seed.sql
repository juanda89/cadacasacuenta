-- ============================================================
-- Cada Casa Cuenta — Seed de desarrollo (SOLO datos de prueba)
-- Casos ficticios en municipios reales del Chocó para desarrollar
-- el mapa y el portal sin esperar reportes reales.
-- ============================================================

insert into public.casos
  (origen_ref, ubicacion, precision_gps_m, direccion, tipo_inmueble, barrio,
   municipio_divipola, departamento_divipola, municipio_nombre, departamento_nombre,
   tiene_dano_estructural, sin_vivienda, relacion_vivienda, habitabilidad_percibida,
   num_habitantes, num_menores, num_adultos_mayores, hay_discapacidad,
   es_colectivo, num_familias, descripcion, autoriza_historia_publica,
   consentimiento_datos, consentimiento_at, consentimiento_version, estado)
values
  ('demo-1', extensions.st_point(-76.6611, 5.6947)::extensions.geography, 8,
   'Calle 26 # 4-32', 'casa', 'Niño Jesús',
   '27001', '27', 'Quibdó', 'Chocó',
   true, false, 'propietario', 'no',
   5, 2, 1, false, false, 1,
   '[DATOS DE PRUEBA] Grietas diagonales en dos muros y el techo cedió en la cocina.', true,
   true, now(), 'v1', 'reportado'),

  ('demo-2', extensions.st_point(-76.2341, 4.8972)::extensions.geography, 15,
   'Vereda La Italia', 'casa', null,
   '27660', '27', 'San José del Palmar', 'Chocó',
   true, false, 'poseedor', 'no_sabe',
   4, 1, 0, false, false, 1,
   '[DATOS DE PRUEBA] La casa quedó inclinada; dormimos donde una vecina.', false,
   true, now(), 'v1', 'reportado'),

  ('demo-3', extensions.st_point(-76.6580, 5.6900)::extensions.geography, 20,
   null, null, 'La Yesquita',
   '27001', '27', 'Quibdó', 'Chocó',
   false, true, null, null,
   6, 3, 0, true, false, 1,
   '[DATOS DE PRUEBA] La casa colapsó, estamos en la cancha del barrio. Somos seis, hay un niño con discapacidad.', true,
   true, now(), 'v1', 'reportado'),

  ('demo-4', extensions.st_point(-76.6055, 5.0870)::extensions.geography, 25,
   'Comunidad El Salto', 'otro', null,
   '27361', '27', 'Istmina', 'Chocó',
   true, true, 'lider_comunitario', 'no',
   null, null, null, false,
   true, 23,
   '[DATOS DE PRUEBA] Reporte colectivo: 23 familias de la comunidad con viviendas caídas o inhabitables.', true,
   true, now(), 'v1', 'reportado'),

  ('demo-5', extensions.st_point(-76.4700, 4.9550)::extensions.geography, 10,
   'Carrera 5 # 3-18', 'casa', 'Centro',
   '27491', '27', 'Nóvita', 'Chocó',
   true, false, 'arrendatario', 'si',
   3, 0, 2, false, false, 1,
   '[DATOS DE PRUEBA] Fisuras finas en fachada; la familia sigue viviendo ahí.', false,
   true, now(), 'v1', 'reportado'),

  -- Caso sin ubicación (llegó descrito por texto): la página pública por código
  -- debe funcionar igual.
  ('demo-6', null, null,
   'Por la subida al colegio, tercera casa', 'casa', null,
   '27075', '27', 'Bahía Solano', 'Chocó',
   true, false, 'propietario', 'no',
   2, 0, 1, false, false, 1,
   '[DATOS DE PRUEBA] Reportado por texto sin GPS; pendiente de geocodificar.', false,
   true, now(), 'v1', 'reportado');

update public.casos set ubicacion_por_texto = true where origen_ref = 'demo-6';

-- Contacto (tabla separada, protegida por RPC con bitácora)
insert into public.casos_contacto (caso_id, nombre, telefono)
select id, 'Familia Demo ' || replace(origen_ref, 'demo-', ''), '+5730000000' || lpad(replace(origen_ref, 'demo-', ''), 2, '0')
from public.casos
where origen_ref like 'demo-%';

-- Evidencia de consentimiento de prueba (habeas data verificable)
insert into public.consentimientos
  (caso_id, telefono, version, acepta, respuesta_literal, kapso_message_id, kapso_conversation_id)
select id, '+573000000001', 'v1', true,
       '[PRUEBA] Sí señora, autorizo el uso de mis datos', 'demo-msg-001', 'demo-conv-001'
from public.casos where origen_ref = 'demo-1';

-- Necesidades de prueba
insert into public.necesidades (caso_id, tipo, detalle, urgente, origen_ref)
select id, 'albergue', '[PRUEBA] Sin techo, duermen en la cancha del barrio', true, 'demo-nec-1'
from public.casos where origen_ref = 'demo-3';

insert into public.necesidades (caso_id, tipo, detalle, urgente, origen_ref)
select id, 'agua', '[PRUEBA] Sin acceso a agua potable desde el sismo', false, 'demo-nec-2'
from public.casos where origen_ref = 'demo-3';

insert into public.necesidades (caso_id, tipo, detalle, urgente, origen_ref)
select id, 'salud', '[PRUEBA] Menor con discapacidad requiere control médico', true, 'demo-nec-3'
from public.casos where origen_ref = 'demo-3';

insert into public.necesidades (caso_id, tipo, detalle, urgente, origen_ref)
select id, 'alimentos', '[PRUEBA] Reporte colectivo: alimentos para 23 familias', false, 'demo-nec-4'
from public.casos where origen_ref = 'demo-4';
