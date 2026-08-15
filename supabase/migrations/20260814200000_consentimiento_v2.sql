-- ============================================================
-- Cada Casa Cuenta — Autorización de datos v2
--
-- Pedido del usuario (2026-08-14): formato tipo "AUTORIZACIÓN PARA EL
-- TRATAMIENTO DE DATOS PERSONALES" con enlace a la política publicada
-- (página /datos del sitio) y respuesta por botones Sí/No. En tuteo:
-- el usuario pidió override del "usted" de marca para el bot
-- (docs/kit-estilo-whatsapp.md al pie de la letra).
-- El bot envía este texto como cuerpo de un mensaje interactivo con
-- botones "Sí, autorizo" / "No"; si los botones fallan, cae a texto.
-- v1 queda archivada: las autorizaciones ya otorgadas la referencian.
-- ============================================================

insert into public.consentimiento_versiones (version, texto) values
  ('v2',
   '*AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES*

Para conocer la política de tratamiento de datos puedes abrirla aquí:
https://cadacasacuenta.vercel.app/datos

Para proteger tu información y poder registrar tu caso, es importante que autorices el tratamiento de tus datos (Ley 1581 de 2012). Solo se usan para registrar el estado de tu vivienda y las necesidades de tu hogar, a la vista de los profesionales voluntarios y las autoridades. Puedes pedir corrección o eliminación cuando quieras, en este mismo número.

Toca *Sí, autorizo* para aceptar. Si no deseas continuar, toca *No*.')
on conflict (version) do update set texto = excluded.texto;
