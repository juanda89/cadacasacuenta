# Cada Casa Cuenta — Guía de marca v1.0

*Síntesis de tres direcciones creativas evaluadas por juez de diseño (2026-08-13). Sirve a dos audiencias con una sola marca: la familia que reporta por WhatsApp y la autoridad que cita los datos en rueda de prensa.*

---

## 1. Estrategia

**Esencia:** un acta pública con trazo de vecino. La marca es infraestructura cívica seria que fue hecha, visiblemente, con cuidado humano.

**La tensión que resuelve:** calidez de vecino + rigor de ingeniero. No se resuelve mezclando — se resuelve **separando por capas** con una regla enunciable:

> **La ilustración abraza; el dato dictamina.**
> La acuarela, el papel y la Fraunces enmarcan y dan calor. Los datos — cifras, códigos, tablas, leyendas de mapa, dictámenes — viven siempre en tipografía limpia sobre superficie plana, jamás sobre mancha de color ni en fuente display. Esta regla se codifica en el design system como restricción de componentes, no como recomendación.

**Promesa (lo único que prometemos siempre):** su caso queda registrado, con evidencia, visible para las autoridades y verificable con su código. Nunca prometemos ayuda que no depende de nosotros.

**Unidad de la plataforma:** el **hogar**, no el edificio. Una familia sin techo también cuenta.

## 2. Nombre y lenguaje del sistema

- **Cada Casa Cuenta** — triple lectura: cada casa *importa* / cada casa *es contada* / cada casa *cuenta su historia*.
- Descriptor institucional: **Cada Casa Cuenta · Registro Humanitario de Vivienda y Necesidades**.
- Código de caso: `CCC-2026-0847` — Public Sans con `tabular-nums`, letter-spacing amplio, agrupado para dictarse por teléfono. Los códigos solo existen en Grafito de Acta o Tinta Atrato, jamás en color.
- En conversación jamás decimos "víctima", "damnificado", "el inmueble", "radicar". Decimos "su casa", "su familia", "lo que pasó", "lo que necesitan".

## 3. Taglines

- **Primaria:** *Ninguna familia sin contar.*
- **Argumento institucional** (informes, prensa): *Lo que no se cuenta, no se atiende.*
- Inglés (cooperación internacional): *Every home counts. Every home is counted.*

## 4. Logo — "Techo y Punto"

Un techo (chevrón) que protege un punto. El punto es el hogar y es el dato georreferenciado; el espacio negativo entre ambos ES la casa y nunca se rellena.

**Construcción (viewBox 24×24):**
- Techo: `polyline M4,13 L12,4 L20,13`, stroke `3`, `stroke-linecap="round"`, `stroke-linejoin="round"`, color Tinta Atrato.
- Punto: `circle cx="12" cy="16" r="3.2"`, fill sólido.
- Verificado a 16 px: trazo ≈2 px + disco ≈4.3 px — dos formas de alto contraste, legible como favicon y en gama baja.

**Variantes (archivos en `assets/brand/`):**
- Símbolo Tinta Atrato (primario) · monocromo blanco (fondos oscuros) · perfil de WhatsApp (símbolo al 60% sobre círculo Papel de Petición, sin texto).
- **Marcador de mapa:** el techo permanece SIEMPRE en Tinta Atrato; el punto adopta el color funcional del dictamen (verde/amarillo/rojo). Sin dictamen: punto Azul Aguacero. *El logo carga el semáforo sin competir con él.*
- Halo de acuarela (Lavado de Cielo) solo en web editorial; jamás en favicon ni PDF.
- Regla dura: variante pequeña = silueta pura. Nada de tally, puertas ni ventanas bajo 24 px.

**Gráfica secundaria — el tally ("Conteo bajo el techo"):** cuatro palotes + diagonal que cierra la cuenta de cinco. No vive en el logo: vive como animación de confirmación de caso (los palotes aparecen uno a uno al registrarse) y motivo de estados vacíos.

## 5. Color

### Paleta de marca

| Token | Hex | Rol |
|---|---|---|
| Tinta Atrato | `#1F3A5F` | Primario: logo, titulares, navegación, sellos, filetes. Índigo-tinta (no azul bandera). |
| Azul Aguacero | `#4A7BA6` | Secundario: enlaces, botones secundarios, estados de proceso, marcador sin dictamen. |
| Papel de Petición | `#FBF7EF` | Fondo universal cálido: chat, mapa, portadas. |
| Bruma de Página | `#E9EFF4` | Superficie de datos: tarjetas, tablas, paneles de dashboard. |
| Grafito de Acta | `#26221E` | Tinta de texto. Contraste AAA sobre Papel de Petición. |
| Barro Cocido | `#9C6B4A` | **Solo ilustración** (techos, tierra, marcos). Prohibido en chips, botones, badges o estados — codificado por token. |
| Lavado de Cielo | `#D8E4EE` | **Solo ilustración**: aguadas y halo del logo. Nunca detrás de datos. |

### Tokens funcionales reservados (fuera de la paleta de marca)

| Dictamen | Hex | Siempre acompañado de |
|---|---|---|
| Habitable | `#2E7D32` | palabra HABITABLE + icono check |
| Uso restringido | `#F9A825` | palabra USO RESTRINGIDO + triángulo |
| No habitable | `#C62828` | palabra NO HABITABLE + aspa |

**Reglas duras:** (1) El semáforo jamás aparece como color solo — siempre color + palabra + forma (accesibilidad daltónica). (2) Los tres funcionales son lo único plenamente saturado en pantalla. (3) Todo estado de proceso va en azules: así el sistema enseña que verde/amarillo/rojo solo hablan de habitabilidad. (4) Un elemento azul siempre es marca/estructura, nunca dictamen.

## 6. Tipografía

- **Display: Fraunces** (Google Fonts, eje SOFT alto) — storybook adulto: libro bien hecho, no letra infantil. Titulares, cabeceras de caso, citas de familias (itálica).
- **Texto y datos: Public Sans** (Google Fonts, origen USWDS) — voz de Estado: cuerpo, UI, tablas, cifras con `tabular-nums` garantizados.
- Estándares: cuerpo mínimo **16 px** en toda vista que consume una familia; contraste AAA; códigos con letter-spacing amplio; una idea por línea en WhatsApp.

## 7. Voz — una marca, dos registros

### Hacia las familias (el bot y toda superficie ciudadana)

1. **Usted, con calidez** — el trato respetuoso del campo colombiano. Nunca tuteo.
2. **Primero la persona, después el dato** — se abre reconociendo a quien escribe, no pidiendo un campo.
3. **Una sola pregunta a la vez**, frases cortas, cero jerga ("un ingeniero va a revisar si su casa es segura", no "dictamen de habitabilidad").
4. **Dignidad sin lástima ni diminutivos** — adultos en crisis, no niños que consolar. Cero "casita".
5. **Honestidad radical** — jamás prometer ayuda, casas o subsidios; siempre confirmar qué quedó guardado y qué sigue.
6. **Todos los formatos valen** — nota de voz, foto borrosa, ortografía libre: el bot se adapta a la persona, jamás al revés.

**Patrón de oro — apertura del bot:**
> Hola. Soy el asistente de Cada Casa Cuenta. Lamento mucho lo que están viviendo. Estoy aquí para que lo que le pasó a su casa y lo que su familia necesita quede registrado, con evidencia, donde las autoridades lo pueden ver. Me puede escribir o mandar notas de voz, como le sea más fácil. ¿Empezamos? Cuénteme en qué municipio y en qué barrio o vereda está.

**Patrón de oro — cierre:**
> Su caso ya quedó registrado. Su código es **CCC-2026-0847**. Guárdelo: es la prueba de que su caso existe, y con él cualquiera puede verlo en cadacasacuenta.co. Un ingeniero voluntario va a revisar su caso. Si algo cambia — se mudan, consiguen albergue, empeora el daño — escríbame y lo actualizamos.

### Hacia autoridades y profesionales (dashboard, informes, prensa)

1. **Tono de acta, tercera persona** — se afirma solo lo verificado; siempre se distingue "reportado por la familia" de "dictaminado por profesional acreditado".
2. **Toda cifra viaja con fecha de corte, cobertura y método** — una cifra sin metadatos no sale de la plataforma.
3. **Verbos de evidencia:** "se reportó", "se verificó en visita", "se dictaminó". Cero adjetivos emotivos: la urgencia la ponen los números.
4. **Trazabilidad como retórica** — cada cifra agregada es descomponible en casos con código, evidencia y URL pública. Se invita activamente a auditar.
5. **Neutralidad absoluta** — la plataforma es infraestructura, no actor político. Ficha metodológica obligatoria en todo reporte citable.

**Patrón de oro — informe:**
> Al corte del 20 de agosto de 2026, 20:00 hora local, la plataforma registra 4.218 hogares reportados en 23 municipios; cada cifra de este informe es trazable a un caso georreferenciado con código único, evidencia fotográfica y, cuando existe, dictamen de habitabilidad emitido en visita por un profesional voluntario identificado.

## 8. El sello de dictamen

El semáforo se materializa como **sello circular estampado** — como caucho entintado sobre el acta: color funcional puro + palabra (HABITABLE / USO RESTRINGIDO / NO HABITABLE) + icono (check / triángulo / aspa) + fecha + matrícula del profesional.

Es **el mismo artefacto** en la página de caso, el dashboard y el PDF: trazabilidad visual perfecta — el sello que ve la familia es el que firma el informe ante la Defensoría. Resuelve accesibilidad daltónica por diseño (color + palabra + forma, nunca color solo).

## 9. Mundo visual — papel recortado sobre acuarela (Ghibli × Paper Mario)

El mundo es un **diorama de papel**: escenas construidas en capas de papel recortado (Paper Mario) pintadas con acuarela suave (Ghibli). Los cielos y aguadas son acuarela; los objetos — casas, colinas, río, nubes — son papel con bordes visibles y **sombras duras entre capas**. La sombra de "papel recortado" que ya usa la UI (1 capa, offset 2 px) es la misma física del mundo ilustrado: todo el sistema es papel.

- **Frontera:** papel y acuarela = suelo y marco; tinta = dato. La textura vive en fondos, cabeceras, estados vacíos e ilustraciones de territorio. Jamás dentro de tablas, gráficas, chips o fotos de evidencia (las fotos de daños no se decoran ni se filtran: son evidencia).
- **Dos capas de artefactos:** los artefactos **funcionales** (logo, marcadores, sellos de dictamen, iconos) son SIEMPRE SVG vectorial plano — nunca se sustituyen por renders. Las **ilustraciones** (hero, emblema editorial, casitas de estados vacíos) se generan como papercraft (gpt-image-1, prompts con paleta estricta y "sin texto/personas/ruinas") y viven en `assets/brand/`.
- **Lo que jamás se ilustra:** personas, rostros, ruinas, dolor. Solo territorio, casas y objetos del oficio (libreta, teodolito, lápiz). 265 muertos exigen sobriedad: cero personajes ni sonrisas en superficies de crisis.
- **Ingeniería:** textura de papel = un solo SVG tileado con `feTurbulence`, opacidad 4–6%, <25 KB, con degradación elegante a color plano. 3 máscaras de borde irregular reutilizables. Sombra dura de "papel recortado" (1 capa, offset 2 px). Marcadores como `<symbol>` SVG instanciado.
- **Presupuesto duro:** <200 KB por vista consumida por familias (redes 2G/3G rurales del Chocó). El bot de WhatsApp no depende de ningún asset.
- **Mapa:** base cartográfica propia en lavados de papel y azules desaturados, sin satélite en vista pública. Todo el cromo del mapa (controles, leyenda, clusters) en Tinta Atrato; los marcadores son el único lugar donde vive el semáforo.
- **Modo oscuro:** solo en dashboard ("tinta invertida"). Mapa público y páginas de caso permanecen en papel claro — decisión declarada, no omisión.

## 10. Aplicaciones por superficie

- **WhatsApp:** perfil = símbolo sobre círculo Papel de Petición, sin texto. Chat = 100% voz, sin ilustración. Cada confirmación importante llega como **mini-acta**: tarjeta con código en tabular, fecha y sello del techo. Al cerrar: **acta de vecindad** reenviable ("Su casa ya está en el mapa") — la pieza más compartible de la marca.
- **Mapa público:** el acta manda — datos en tinta sobre cartografía de papel; acuarela solo fuera del lienzo del mapa (cabecera, leyenda, estados vacíos).
- **Página de caso:** expediente con alma — cabecera cálida (Fraunces, banda de acuarela, "La familia cuenta" con citas en itálica si autorizó) sobre zona de rigor (Public Sans sobre Bruma de Página: código, coordenadas, cronología, evidencia en retícula limpia, sello de dictamen con nombre y matrícula).
- **Dashboard de autoridades:** casi cero ilustración — aquí la marca demuestra que no es un juguete. Gráficos monocromos en azules; solo los estados de habitabilidad usan semáforo, mostrados como sellos con conteo. Cada cifra con fecha de corte y enlace "ver casos fuente". Calidez residual: logo, filete, estados vacíos con casita a línea.
- **PDF institucional:** membrete tipo instituto de estadística — logo monocromo, descriptor, folio y **código de verificación del documento**, cuerpo íntegro en Public Sans, ficha metodológica en la última página, URL de verificación al pie. Acuarela solo en portada; interiores en blanco puro para impresión económica.

## 11. Integridad y protección

- **Anti-suplantación** (una marca citable será imitada por bots falsos que pidan datos): número de WhatsApp verificado publicado en toda superficie; URL pública de verificación por caso; código de verificación en cada PDF. Desde el día uno.
- **Blindaje político:** índigo-tinta (no azul bandera), cero rojo de marca, neutralidad radical de voz, ficha metodológica en todo reporte citable.
- **Auditoría comunitaria:** validar tono e ilustración con personas afectadas y líderes comunitarios del Chocó antes de publicar — y periódicamente.
