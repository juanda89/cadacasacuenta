-- ============================================================
-- Cada Casa Cuenta — Autorización de datos v2
--
-- Pedido del usuario (2026-08-14): formato tipo "AUTORIZACIÓN PARA EL
-- TRATAMIENTO DE DATOS PERSONALES" con enlace a la política publicada
-- (nueva página /datos del sitio) y respuesta por botones Sí/No.
-- El bot envía este texto como cuerpo de un mensaje interactivo con
-- botones "Sí, autorizo" / "No"; si los botones fallan, cae a texto.
-- v1 queda archivada: las autorizaciones ya otorgadas la referencian.
-- ============================================================

insert into public.consentimiento_versiones (version, texto) values
  ('v2',
   '*AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES*

Para conocer la política de tratamiento de datos puede abrirla aquí:
https://cadacasacuenta.vercel.app/datos

Para proteger su información y poder registrar su caso, es importante que autorice el tratamiento de sus datos (Ley 1581 de 2012). Solo se usan para registrar el estado de su vivienda y las necesidades de su hogar, a la vista de los profesionales voluntarios y las autoridades. Puede pedir corrección o eliminación cuando quiera, en este mismo número.

Toque *Sí, autorizo* para aceptar. Si no desea continuar, toque *No*.')
on conflict (version) do update set texto = excluded.texto;
