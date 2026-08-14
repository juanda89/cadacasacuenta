import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enviarTexto, descargarMedia } from "./kapso";
import { completa, transcribe } from "./llm";

/**
 * El agente de Cada Casa Cuenta.
 *
 * Reglas de producto no negociables:
 *  - Voz de "usted" cálido; jamás "víctima"/"damnificado"/"el inmueble".
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
  "Hola. Soy el asistente de Cada Casa Cuenta. Lamento mucho lo que están viviendo. " +
  "Estoy aquí para que lo que le pasó a su casa y lo que su familia necesita quede registrado, " +
  "con evidencia, donde las autoridades lo pueden ver.";

export async function procesarMensaje(m: MensajeEntrante) {
  const db = supabaseAdmin();

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
    const { data: ver } = await db
      .from("consentimiento_versiones")
      .select("version, texto")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .single();
    respuesta = `${SALUDO}\n\n${ver!.texto}`;
    conv.fase = "esperando_consentimiento";
    conv.historial = [
      { role: "user", content: textoUsuario },
      { role: "assistant", content: respuesta },
    ];
  } else if (conv.fase === "esperando_consentimiento") {
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
    let acepta: boolean | null = null;
    try {
      acepta = JSON.parse(veredicto).acepta;
    } catch {
      acepta = null;
    }

    if (acepta === true) {
      // Crear el caso + archivar la evidencia literal del consentimiento
      const ahora = new Date().toISOString();
      const { data: caso } = await db
        .from("casos")
        .insert({
          consentimiento_datos: true,
          consentimiento_at: ahora,
          consentimiento_version: "v1",
          kapso_conversation_id: m.conversationId,
          origen_ref: `kapso:${m.messageId}`,
        })
        .select("id, codigo_publico")
        .single();
      await db.from("casos_contacto").insert({ caso_id: caso!.id, telefono: m.telefono });
      await db.from("consentimientos").insert({
        caso_id: caso!.id,
        telefono: m.telefono,
        version: "v1",
        acepta: true,
        respuesta_literal: textoUsuario,
        respuesta_es_transcripcion: esTranscripcion,
        kapso_message_id: m.messageId,
        kapso_conversation_id: m.conversationId,
      });
      conv.caso_id = caso!.id;
      conv.fase = "recolectando";
      respuesta =
        "Gracias. Quedó registrada su autorización. Me puede escribir o mandar notas de voz, como le sea más fácil. " +
        "Para empezar: ¿me cuenta qué pasó con su casa, y en qué municipio y barrio o vereda está?";
    } else if (acepta === false) {
      await db.from("consentimientos").insert({
        telefono: m.telefono,
        version: "v1",
        acepta: false,
        respuesta_literal: textoUsuario,
        respuesta_es_transcripcion: esTranscripcion,
        kapso_message_id: m.messageId,
        kapso_conversation_id: m.conversationId,
      });
      conv.fase = "rechazado";
      respuesta =
        "Entiendo, y respeto su decisión: no guardaré ningún dato suyo. Si cambia de opinión, escríbame a este mismo número cuando quiera. Que estén bien.";
    } else {
      respuesta =
        "Disculpe si no fui claro. Solo necesito saber si autoriza que registremos los datos que me comparta para que las autoridades y los ingenieros voluntarios puedan ver su caso. ¿Me responde sí o no, como le quede más fácil?";
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
  await enviarTexto(m.telefono, respuesta);
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

  const sistema = `Eres el asistente de WhatsApp de "Cada Casa Cuenta", el registro humanitario del terremoto del Chocó (Colombia, 2026). Hablas SIEMPRE de "usted", con la calidez respetuosa del campo colombiano. Frases cortas. UNA sola pregunta por mensaje. Jamás dices "víctima", "damnificado" ni "el inmueble". Jamás prometes ayuda, casas o subsidios: prometes que el caso queda registrado, con evidencia, visible para autoridades y profesionales voluntarios. Si la persona cuenta algo doloroso, reconócelo con humanidad y brevedad antes de seguir.

ESTADO ACTUAL DEL CASO (código ${caso!.codigo_publico}):
${JSON.stringify({ ...caso, id: undefined }, null, 1)}
NECESIDADES REGISTRADAS: ${JSON.stringify(necesidades ?? [])}

TU OBJETIVO: completar el caso conversando con naturalidad. Datos que importan (pregunta SOLO lo que falte, en orden de conversación natural, no de formulario):
1. ubicacion (pídale compartir el pin de WhatsApp: clip 📎 → Ubicación) — si no puede, direccion descrita + municipio_nombre + barrio
2. direccion, tipo_inmueble (casa|apartamento|edificio|otro), unidad si aplica
3. ¿tiene_dano_estructural? descripcion del daño; ¿sin_vivienda? (¿dónde están durmiendo?)
4. relacion_vivienda (propietario|arrendatario|poseedor|familiar|vecino|lider_comunitario|otro), habitabilidad_percibida (si|no|no_sabe)
5. num_habitantes, num_menores, num_adultos_mayores, hay_discapacidad
6. necesidades: albergue|agua|alimentos|salud|medicamentos|psicosocial|proteccion|otra (con urgente true/false)
7. nombre de contacto
8. fotos como evidencia (pídelas una vez, no bloqueante: "si puede, mándeme fotos del daño")
9. es_colectivo + num_familias si reporta por una comunidad

RESPONDE SOLO ESTE JSON:
{
 "mensaje": "tu respuesta a la persona (cálida, usted, una sola pregunta)",
 "patch_caso": { /* SOLO campos de casos que este mensaje permita llenar, con los nombres exactos de arriba. {} si nada */ },
 "nombre_contacto": "si lo dijo, aquí; si no, null",
 "nuevas_necesidades": [ { "tipo": "...", "detalle": "...", "urgente": false } ],
 "caso_completo": false /* true SOLO cuando ya tengas ubicación (o dirección+municipio), qué pasó, habitantes y nombre */
}`;

  const historialLlm = conv.historial.slice(-16).map((h) => ({ role: h.role, content: h.content }));
  const salida = await completa(
    [{ role: "system", content: sistema }, ...historialLlm, { role: "user", content: textoUsuario }],
    true
  );

  let mensaje = "Gracias por contarme. ¿Me repite lo último? No le entendí bien.";
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
      conv.fase = "cerrado";
      const { data: c } = await db.from("casos").select("codigo_publico").eq("id", conv.caso_id!).single();
      const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/caso/${c!.codigo_publico}`;
      mensaje =
        `${mensaje}\n\nSu caso ya quedó registrado. Su código es *${c!.codigo_publico}*. ` +
        `Guárdelo: es la prueba de que su caso existe, y con él cualquiera puede verlo aquí:\n${url}\n\n` +
        `Un ingeniero o arquitecto voluntario va a revisar su caso. Si algo cambia — se mudan, consiguen albergue, empeora el daño — escríbame a este número y lo actualizamos.`;
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
