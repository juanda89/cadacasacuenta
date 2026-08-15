import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enviarGlobos, enviarBotones, indicarEscribiendo, descargarMedia } from "./kapso";
import { aGlobos, ESTILO_PROMPT } from "./estilo";
import { completa, transcribe } from "./llm";

/**
 * El agente de Cada Casa Cuenta.
 *
 * Reglas de producto no negociables:
 *  - Voz de "tú" cálido (override del usuario, 2026-08-14: el bot tutea
 *    siguiendo docs/kit-estilo-whatsapp.md; la web institucional mantiene
 *    el usted). Jamás "víctima"/"damnificado"/"el inmueble".
 *  - El consentimiento habeas data abre la conversación, y la respuesta
 *    LITERAL queda archivada en `consentimientos` (Ley 1581 de 2012).
 *  - Incremental, no interrogatorio: solo pregunta lo que falta.
 *  - Nunca promete ayuda; promete registro, evidencia y visibilidad.
 */

export type MensajeEntrante = {
  messageId: string;
  conversationId: string | null;
  telefono: string;
  tipo: "text" | "audio" | "image" | "location" | "document" | string;
  texto?: string;
  botonId?: string | null; // id del botón si la persona tocó Sí/No
  mediaId?: string;
  mimeType?: string;
  lat?: number;
  lng?: number;
};

type Conversacion = {
  telefono: string;
  kapso_conversation_id: string | null;
  caso_id: string | null;
  fase: "nueva" | "esperando_consentimiento" | "recolectando" | "cerrado" | "rechazado";
  historial: { role: "user" | "assistant"; content: string }[];
};

const SALUDO =
  "Hola 🤝 soy el asistente de Cada Casa Cuenta. Lamento mucho lo que están viviendo.\n---\n" +
  "Estoy aquí para que lo que pasó — con tu casa, tu edificio, tu local o la sede de tu " +
  "comunidad — y lo que necesitan quede registrado, con evidencia, donde las autoridades " +
  "lo pueden ver.";

export async function procesarMensaje(m: MensajeEntrante) {
  const db = supabaseAdmin();
  // "escribiendo..." mientras el agente piensa: el turno se siente humano
  await indicarEscribiendo(m.messageId);

  // --- Estado de la conversación (crea si no existe) ---
  let conv: Conversacion;
  {
    const { data } = await db
      .from("bot_conversaciones")
      .select("*")
      .eq("telefono", m.telefono)
      .maybeSingle();
    if (data) {
      conv = data as Conversacion;
    } else {
      const nueva = {
        telefono: m.telefono,
        kapso_conversation_id: m.conversationId,
        fase: "nueva" as const,
        historial: [],
      };
      await db.from("bot_conversaciones").insert(nueva);
      conv = { ...nueva, caso_id: null };
    }
  }

  // --- Idempotencia ATÓMICA: reintentos de Kapso e invocaciones paralelas
  // compiten por un INSERT con PK; solo la primera procesa el mensaje. ---
  {
    const { error: claim } = await db
      .from("bot_mensajes")
      .insert({ message_id: m.messageId, telefono: m.telefono });
    if (claim) {
      if (claim.code !== "23505") console.error("claim mensaje", claim);
      return; // duplicado (23505) o error: no reprocesar
    }
  }

  // --- Normalizar la entrada a texto + efectos secundarios de media ---
  let textoUsuario = "";
  let esTranscripcion = false;

  if (m.tipo === "text") {
    textoUsuario = m.texto ?? "";
    // Ubicación por texto: coordenadas pegadas o enlace de Google Maps
    // (incluidos los cortos maps.app.goo.gl, que se resuelven por redirect).
    const coords = await resolverCoordenadas(textoUsuario);
    if (coords && conv.caso_id) {
      await db
        .from("casos")
        .update({ ubicacion: `SRID=4326;POINT(${coords.lng} ${coords.lat})`, ubicacion_por_texto: false })
        .eq("id", conv.caso_id);
      textoUsuario += `\n[Sistema: se detectaron coordenadas ${coords.lat}, ${coords.lng} en el mensaje y la ubicación ya quedó guardada]`;
    }
  } else if (m.tipo === "location" && m.lat != null && m.lng != null) {
    textoUsuario = `[El usuario compartió su ubicación: ${m.lat}, ${m.lng}]`;
    if (conv.caso_id) {
      await db
        .from("casos")
        .update({ ubicacion: `SRID=4326;POINT(${m.lng} ${m.lat})`, ubicacion_por_texto: false })
        .eq("id", conv.caso_id);
    }
  } else if ((m.tipo === "image" || m.tipo === "document") && m.mediaId) {
    const bin = await descargarMedia(m.mediaId);
    if (bin && conv.caso_id) {
      const ext = m.mimeType?.split("/")[1]?.split(";")[0] ?? "jpg";
      const path = `casos/${conv.caso_id}/${m.messageId}.${ext}`;
      await db.storage.from("evidencias").upload(path, bin, { contentType: m.mimeType });
      await db.from("evidencias").insert({
        caso_id: conv.caso_id,
        tipo: m.tipo === "image" ? "foto" : "documento",
        storage_path: path,
        mime_type: m.mimeType,
        origen: "ciudadano",
      });
    }
    textoUsuario = m.tipo === "image" ? "[El usuario envió una foto]" : "[El usuario envió un documento]";
  } else if (m.tipo === "audio" && m.mediaId) {
    const bin = await descargarMedia(m.mediaId);
    if (bin) {
      const t = await transcribe(bin, m.mimeType ?? "audio/ogg");
      if (t) {
        textoUsuario = t;
        esTranscripcion = true;
      }
      if (conv.caso_id && bin) {
        const path = `casos/${conv.caso_id}/${m.messageId}.ogg`;
        await db.storage.from("evidencias").upload(path, bin, { contentType: m.mimeType ?? "audio/ogg" });
        await db.from("evidencias").insert({
          caso_id: conv.caso_id,
          tipo: "audio",
          storage_path: path,
          mime_type: m.mimeType,
          transcripcion: t,
          origen: "ciudadano",
        });
      }
    }
    if (!textoUsuario) textoUsuario = "[Nota de voz que no se pudo transcribir]";
  }

  if (!textoUsuario.trim()) textoUsuario = `[Mensaje de tipo ${m.tipo}]`;

  // --- Máquina de fases ---
  let respuesta: string;

  if (conv.fase === "nueva") {
    const ver = await versionConsentimiento(db);
    conv.fase = "esperando_consentimiento";
    conv.historial = [
      { role: "user", content: textoUsuario },
      { role: "assistant", content: `${SALUDO}\n\n${ver.texto}` },
    ];
    await guardar(db, conv);
    // Saludo en globos + la autorización con botones Sí/No
    await enviarGlobos(m.telefono, aGlobos(SALUDO));
    await enviarBotones(m.telefono, ver.texto, [
      { id: "consent_si", titulo: "Sí, autorizo" },
      { id: "consent_no", titulo: "No" },
    ]);
    return;
  } else if (conv.fase === "esperando_consentimiento") {
    const ver = await versionConsentimiento(db);
    // Si tocó un botón, la respuesta es inequívoca; si escribió, decide el LLM.
    let acepta: boolean | null = null;
    if (m.botonId === "consent_si") acepta = true;
    else if (m.botonId === "consent_no") acepta = false;
    else {
      const veredicto = await completa(
        [
          {
            role: "system",
            content:
              'Analiza si la persona AUTORIZA el tratamiento de sus datos. Responde SOLO JSON: {"acepta": true|false|null}. null = respuesta ambigua o pregunta.',
          },
          { role: "user", content: textoUsuario },
        ],
        true
      );
      try {
        acepta = JSON.parse(veredicto).acepta;
      } catch {
        acepta = null;
      }
    }

    if (acepta === true) {
      // Crear el caso + archivar la evidencia literal del consentimiento
      const ahora = new Date().toISOString();
      const { data: caso } = await db
        .from("casos")
        .insert({
          consentimiento_datos: true,
          consentimiento_at: ahora,
          consentimiento_version: ver.version,
          kapso_conversation_id: m.conversationId,
          origen_ref: `kapso:${m.messageId}`,
        })
        .select("id, codigo_publico")
        .single();
      await db.from("casos_contacto").insert({ caso_id: caso!.id, telefono: m.telefono });
      await db.from("consentimientos").insert({
        caso_id: caso!.id,
        telefono: m.telefono,
        version: ver.version,
        acepta: true,
        respuesta_literal: textoUsuario,
        respuesta_es_transcripcion: esTranscripcion,
        kapso_message_id: m.messageId,
        kapso_conversation_id: m.conversationId,
      });
      conv.caso_id = caso!.id;
      conv.fase = "recolectando";
      respuesta =
        "Listo, quedó registrada tu autorización 🤝\n---\n" +
        "Puedes escribirme o mandarme notas de voz, como te quede más fácil.\n---\n" +
        "Para empezar: cuéntame qué pasó. ¿Se afectó tu casa, un edificio, un local u otra edificación? ¿Y en qué municipio y barrio o vereda está?";
    } else if (acepta === false) {
      await db.from("consentimientos").insert({
        telefono: m.telefono,
        version: ver.version,
        acepta: false,
        respuesta_literal: textoUsuario,
        respuesta_es_transcripcion: esTranscripcion,
        kapso_message_id: m.messageId,
        kapso_conversation_id: m.conversationId,
      });
      conv.fase = "rechazado";
      respuesta =
        "Entiendo, y respeto tu decisión: no guardaré ningún dato tuyo.\n---\n" +
        "Si cambias de opinión, escríbeme a este mismo número cuando quieras. Que estén bien.";
    } else {
      respuesta =
        "Disculpa si no fui claro.\n---\n" +
        "Solo necesito saber si autorizas que registremos los datos que me compartas, para que las " +
        "autoridades y los ingenieros voluntarios puedan ver tu caso.\n---\n" +
        "Toca el botón, o respóndeme sí o no, como te quede más fácil.";
    }
    conv.historial = [
      ...conv.historial,
      { role: "user", content: textoUsuario },
      { role: "assistant", content: respuesta },
    ];
  } else if (conv.fase === "recolectando" && conv.caso_id) {
    respuesta = await turnoRecoleccion(db, conv, textoUsuario, m.telefono);
  } else if (conv.fase === "cerrado" && conv.caso_id) {
    // Reapertura: la familia puede actualizar su caso cuando quiera
    conv.fase = "recolectando";
    respuesta = await turnoRecoleccion(db, conv, textoUsuario, m.telefono);
  } else {
    // rechazado → si vuelve a escribir, se le ofrece de nuevo el consentimiento
    conv.fase = "nueva";
    await guardar(db, conv);
    return procesarMensaje({ ...m, messageId: m.messageId + ":reintento" });
  }

  await guardar(db, conv);
  await enviarGlobos(m.telefono, aGlobos(respuesta));
}

// Última versión vigente del texto de autorización (Ley 1581 de 2012).
async function versionConsentimiento(db: ReturnType<typeof supabaseAdmin>) {
  const { data } = await db
    .from("consentimiento_versiones")
    .select("version, texto")
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .single();
  return data as { version: string; texto: string };
}

type Minimos = {
  tiene_ubicacion: boolean;
  tiene_evidencia: boolean;
  tiene_descripcion: boolean;
  cumple: boolean;
};

async function minimosDe(db: ReturnType<typeof supabaseAdmin>, casoId: string): Promise<Minimos> {
  const { data } = await db.rpc("caso_minimos", { p_caso: casoId });
  return (data ?? {
    tiene_ubicacion: false,
    tiene_evidencia: false,
    tiene_descripcion: false,
    cumple: false,
  }) as Minimos;
}

async function turnoRecoleccion(
  db: ReturnType<typeof supabaseAdmin>,
  conv: Conversacion,
  textoUsuario: string,
  telefono: string
): Promise<string> {
  const { data: caso } = await db.from("casos").select("*").eq("id", conv.caso_id!).single();
  const { data: necesidades } = await db
    .from("necesidades")
    .select("tipo, detalle, urgente")
    .eq("caso_id", conv.caso_id!);
  const minimos = await minimosDe(db, conv.caso_id!);

  const sistema = `Eres el asistente de WhatsApp de "Cada Casa Cuenta", el registro humanitario del terremoto de Colombia (10 de agosto de 2026 — Chocó, Caldas, Valle del Cauca, Risaralda y Quindío). Se registra CUALQUIER edificación afectada: casas, apartamentos, edificios, locales comerciales, sedes comunitarias o institucionales.

${ESTILO_PROMPT}

REGLA DE ORO — JAMÁS DES OPINIÓN TÉCNICA (la más importante de todas):
Tú NO eres ingeniero y NUNCA valoras la gravedad de un daño. PROHIBIDO decir que una grieta "es menos preocupante", "parece superficial", "suele ser grave" ni ninguna variante: una valoración optimista tuya podría dejar a alguien durmiendo en un lugar inseguro. Si te preguntan si algo es grave o si pueden quedarse, responde SIEMPRE una variante de: "Eso no te lo puedo decir yo: lo confirma el profesional que acompañe tu caso. Si sientes que el lugar es inseguro, no te quedes adentro." Solo haces preguntas sobre HECHOS observables (¿la grieta ha crecido?, ¿las puertas cierran bien?, ¿se escuchan crujidos?) SIN interpretar jamás qué significan. Y si hay peligro inminente (colapso en curso, olor a gas, cables caídos), primero: que se alejen y llamen a la línea de emergencia 123.

CUANDO PREGUNTES si creen poder volver a dormir/usar el lugar, aclara SIEMPRE en la misma frase que es su percepción y no un dictamen: "esto queda registrado como lo que tú percibes — la revisión técnica la hace el profesional".

ESTADO ACTUAL DEL CASO (código ${caso!.codigo_publico}):
${JSON.stringify({ ...caso, id: undefined }, null, 1)}
NECESIDADES REGISTRADAS: ${JSON.stringify(necesidades ?? [])}

REQUISITOS MÍNIMOS — sin los tres, el caso NO queda registrado (el sistema lo rechaza):
a. UBICACIÓN. JAMÁS uses la palabra "pin". Pídela siempre explícita con las DOS opciones: "compárteme la ubicación: por WhatsApp, tocando el botón de adjuntar junto al mensaje (el + o el clip, según tu teléfono) → Ubicación → Enviar mi ubicación actual; o si te queda más fácil, mándame el enlace de ubicación de Google Maps (compartir → copiar enlace) y yo lo entiendo". También entiendo coordenadas pegadas. La dirección escrita ayuda pero NO reemplaza la ubicación: insiste con paciencia y calidez.
b. Al menos UNA FOTO del daño o del lugar (o nota de voz contando lo ocurrido, que también queda como evidencia).
c. La DESCRIPCIÓN de qué pasó, en palabras de la persona.

MÍNIMOS DE ESTE CASO AHORA MISMO: ${JSON.stringify(minimos)} — persigue primero lo que esté en false.

Datos que importan (pregunta SOLO lo que falte, en orden de conversación natural, no de formulario):
1. Los tres mínimos de arriba, siempre primero
2. ¿Qué tipo de edificación se afectó? tipo_inmueble (casa|apartamento|edificio|local_comercial|institucional|otro) — no asumas que es una casa familiar
3. direccion, unidad si aplica, municipio_nombre + barrio
4. ¿tiene_dano_estructural? — escucha el relato SIN ASUMIR nada: si el daño que describen suena leve (fisuras, un muro agrietado, tejas corridas), NO preguntes dónde están durmiendo. SOLO si describen daño grave (colapso, "quedó en el piso", no pueden entrar, se los prohibieron) pregunta con tacto: "¿y en este momento dónde están pasando la noche?". Marca sin_vivienda ÚNICAMENTE si ellos dicen que no pueden habitar el lugar.
5. relacion_vivienda (propietario|arrendatario|poseedor|familiar|vecino|lider_comunitario|otro), habitabilidad_percibida (si|no|no_sabe) — SIEMPRE con la aclaración de percepción
6. OBLIGATORIO antes de cerrar: num_habitantes = cuántas personas viven o trabajan allí (+ num_menores, num_adultos_mayores, hay_discapacidad). Si no lo han dicho, pregúntalo explícitamente — sin este dato el caso no se cierra.
7. necesidades: albergue|agua|alimentos|salud|medicamentos|psicosocial|proteccion|otra (con urgente true/false)
8. nombre de contacto
9. es_colectivo + num_familias si reporta por una comunidad

RESPONDE SOLO ESTE JSON:
{
 "mensaje": "tu respuesta a la persona (cálida, de tú, UNA sola pregunta; 2-3 globos separados con una línea que contenga solo ---)",
 "patch_caso": { /* SOLO campos de casos que este mensaje permita llenar, con los nombres exactos de arriba. {} si nada */ },
 "nombre_contacto": "si lo dijo, aquí; si no, null",
 "nuevas_necesidades": [ { "tipo": "...", "detalle": "...", "urgente": false } ],
 "caso_completo": false /* true SOLO cuando los tres mínimos estén cumplidos Y tenga num_habitantes Y nombre */
}`;

  const historialLlm = conv.historial.slice(-16).map((h) => ({ role: h.role, content: h.content }));
  const salida = await completa(
    [{ role: "system", content: sistema }, ...historialLlm, { role: "user", content: textoUsuario }],
    true
  );

  let mensaje = "Gracias por contarme. ¿Me repites lo último? No te entendí bien.";
  try {
    const r = JSON.parse(salida);
    mensaje = r.mensaje ?? mensaje;

    // Campos permitidos: el LLM jamás toca consentimiento, código ni flujo.
    const permitidos = [
      "direccion", "tipo_inmueble", "unidad", "barrio", "referencia", "municipio_nombre",
      "departamento_nombre", "tiene_dano_estructural", "sin_vivienda", "relacion_vivienda",
      "habitabilidad_percibida", "num_habitantes", "num_menores", "num_adultos_mayores",
      "hay_discapacidad", "es_colectivo", "num_familias", "descripcion", "ubicacion_por_texto",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (r.patch_caso && r.patch_caso[k] !== undefined && r.patch_caso[k] !== null) {
        patch[k] = r.patch_caso[k];
      }
    }
    if (Object.keys(patch).length > 0) {
      await db.from("casos").update(patch).eq("id", conv.caso_id!);
    }
    if (r.nombre_contacto) {
      await db.from("casos_contacto").update({ nombre: r.nombre_contacto }).eq("caso_id", conv.caso_id!);
    }
    if (Array.isArray(r.nuevas_necesidades)) {
      for (const n of r.nuevas_necesidades) {
        if (n?.tipo) {
          await db.from("necesidades").insert({
            caso_id: conv.caso_id!,
            tipo: n.tipo,
            detalle: n.detalle ?? null,
            urgente: !!n.urgente,
            origen_ref: `kapso:${conv.caso_id}:${n.tipo}:${(n.detalle ?? "").slice(0, 40)}`,
          }).then(({ error }) => {
            if (error && !error.message.includes("duplicate")) console.error("necesidad", error);
          });
        }
      }
    }

    if (r.caso_completo === true) {
      // El LLM propone el cierre, pero la BD decide: sin ubicación, evidencia
      // y relato el caso no sale de borrador (trigger tg_casos_exige_minimos).
      const chequeo = await minimosDe(db, conv.caso_id!);
      // Personas afectadas: obligatorio antes de cerrar (informe 4.8) — la
      // cifra que le importa a una alcaldía es de personas, no de paredes.
      const { data: casoAhora } = await db
        .from("casos")
        .select("num_habitantes")
        .eq("id", conv.caso_id!)
        .single();
      const faltaPersonas = casoAhora?.num_habitantes == null;
      if (!chequeo.cumple || faltaPersonas) {
        const faltantes: string[] = [];
        if (!chequeo.tiene_ubicacion)
          faltantes.push(
            "la ubicación: compártela por WhatsApp (botón de adjuntar → Ubicación → Enviar mi ubicación actual) o mándame el enlace de Google Maps"
          );
        if (!chequeo.tiene_evidencia) faltantes.push("una foto del daño (o una nota de voz contando lo que pasó)");
        if (!chequeo.tiene_descripcion) faltantes.push("que me cuentes qué pasó");
        if (faltaPersonas) faltantes.push("cuántas personas viven o trabajan allí");
        mensaje =
          `Ya casi queda registrado tu caso 🙌\n---\nSolo me falta: ${faltantes.join(
            "; y "
          )}.\n---\n¿Me lo puedes mandar por aquí?`;
      } else {
        const { error: promo } = await db
          .from("casos")
          .update({ estado: "reportado" })
          .eq("id", conv.caso_id!)
          .eq("estado", "borrador");
        if (promo) console.error("promocion caso", promo);
        conv.fase = "cerrado";
        const { data: c } = await db.from("casos").select("codigo_publico").eq("id", conv.caso_id!).single();
        const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/caso/${c!.codigo_publico}`;
        mensaje =
          `${mensaje}\n---\n` +
          `Tu caso ya quedó registrado ✅ Tu código es *${c!.codigo_publico}*. ` +
          `Guárdalo: este código es la prueba de que tu caso existe, y con él cualquiera puede verlo aquí:\n${url}\n---\n` +
          `Un ingeniero o arquitecto voluntario va a revisar tu caso y acompañarte con asesoría técnica. ` +
          `Ten presente: este registro es evidencia ciudadana y no reemplaza el Registro Único de Damnificados (RUD) ni una inspección oficial de tu alcaldía.\n---\n` +
          `Si algo cambia (se mudan, consiguen albergue, empeora el daño) escríbeme y lo actualizamos. Aquí sigo.`;
      }
    }
  } catch (e) {
    console.error("turnoRecoleccion parse", e, salida?.slice(0, 300));
  }

  conv.historial = [
    ...conv.historial.slice(-30),
    { role: "user", content: textoUsuario },
    { role: "assistant", content: mensaje },
  ];
  return mensaje;
}

/**
 * Extrae coordenadas de un texto: enlaces de Google Maps (@lat,lng · q=lat,lng ·
 * el blob !3d…!4d… de los enlaces largos) o un par "lat, lng" pegado tal cual.
 * Validadas contra los límites de Colombia para no confundir cifras cualquiera.
 */
export function extraeCoordenadas(texto: string): { lat: number; lng: number } | null {
  const patrones = [
    /@(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,        // maps .../@4.897,-76.234
    /[?&]q=(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,   // maps ?q=4.897,-76.234
    /!3d(-?\d{1,2}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/,       // blob de enlaces largos
    /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/,      // "4.897, -76.234" pegado
  ];
  for (const re of patrones) {
    const m = texto.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      // Colombia continental e insular
      if (lat >= -4.5 && lat <= 13.6 && lng >= -82 && lng <= -66.8) return { lat, lng };
    }
  }
  return null;
}

/**
 * Como extraeCoordenadas, pero además resuelve los enlaces CORTOS de compartir
 * de Google Maps (maps.app.goo.gl / goo.gl/maps): sigue el redirect en el
 * servidor y busca las coordenadas en la URL final.
 */
export async function resolverCoordenadas(texto: string): Promise<{ lat: number; lng: number } | null> {
  const directo = extraeCoordenadas(texto);
  if (directo) return directo;

  const corto = texto.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[\w-]+/);
  if (!corto) return null;
  try {
    const res = await fetch(corto[0], {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CadaCasaCuenta/1.0)" },
    });
    // Las coordenadas viven en la URL final y a veces solo en el HTML
    return extraeCoordenadas(res.url) ?? extraeCoordenadas((await res.text()).slice(0, 200_000));
  } catch (e) {
    console.error("resolverCoordenadas shortlink", e);
    return null;
  }
}

async function guardar(db: ReturnType<typeof supabaseAdmin>, conv: Conversacion) {
  await db
    .from("bot_conversaciones")
    .update({
      caso_id: conv.caso_id,
      fase: conv.fase,
      historial: conv.historial,
      kapso_conversation_id: conv.kapso_conversation_id,
    })
    .eq("telefono", conv.telefono);
}
