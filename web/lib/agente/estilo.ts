import "server-only";

/**
 * Estilo WhatsApp del agente (docs/kit-estilo-whatsapp.md, al pie de la letra).
 * Decisión del usuario (2026-08-14): el bot TUTEA (override de la voz "usted"
 * de la marca institucional; la web sigue hablando de usted).
 * El prompt pide el tono; este código lo GARANTIZA aunque el modelo se
 * equivoque: globos cortos con ritmo humano, cero rayas largas, cero voseo.
 */

export interface Globo {
  texto: string;
  demoraMs: number; // demora ANTES de enviar este globo (simula tipeo)
}

const PACING = {
  minDemoraMs: 700,
  maxDemoraMs: 3500,
  msPorCaracter: 22,
  maxGlobos: 3,
  maxCaracteresGlobo: 320,
};

// ── Partir la respuesta en globos ────────────────────────────────────────────
// Convención con el prompt: el modelo marca cortes con una línea que contiene
// solo `---`. Si no lo hace, partimos por párrafos y luego por oraciones.
export function partirEnGlobos(respuesta: string): string[] {
  const texto = respuesta.trim();
  if (!texto) return [];
  let partes = texto.includes("\n---")
    ? texto.split(/\n-{3,}\n?/).map((s) => s.trim()).filter(Boolean)
    : partirPorParrafos(texto);
  const { maxGlobos, maxCaracteresGlobo } = PACING;
  if (partes.length > maxGlobos) {
    const cabeza = partes.slice(0, maxGlobos - 1);
    const cola = partes.slice(maxGlobos - 1).join(" ");
    partes = [...cabeza, cola];
  }
  const salida: string[] = [];
  for (const p of partes) {
    if (p.length <= maxCaracteresGlobo) salida.push(p);
    else salida.push(...partirPorOracion(p, maxCaracteresGlobo));
  }
  return salida.slice(0, maxGlobos);
}

function partirPorParrafos(texto: string): string[] {
  const parrafos = texto.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return parrafos.length > 0 ? parrafos : [texto];
}

function partirPorOracion(texto: string, maxCaracteres: number): string[] {
  const oraciones = texto.match(/[^.!?…]+[.!?…]*\s*/g) ?? [texto];
  const trozos: string[] = [];
  let actual = "";
  for (const o of oraciones) {
    if ((actual + o).length > maxCaracteres && actual) {
      trozos.push(actual.trim());
      actual = o;
    } else actual += o;
  }
  if (actual.trim()) trozos.push(actual.trim());
  return trozos;
}

// ── Sanitizador (la garantía dura, tal cual el kit) ─────────────────────────
// 1) Raya larga (— – ―): tell de IA, se reemplaza por coma. No toca el
//    separador `---` porque los globos ya se partieron antes de llegar aquí.
// 2) Voseo residual: solo formas INEQUÍVOCAS, corregidas al tuteo.
const VOSEO_FIX: Array<[RegExp, string]> = [
  [/\bcontame\b/gi, "cuéntame"],
  [/\bdecime\b/gi, "dime"],
  [/\bmostrame\b/gi, "muéstrame"],
  [/\bavisame\b/gi, "avísame"],
  [/\btenés\b/gi, "tienes"],
  [/\bpodés\b/gi, "puedes"],
  [/\bquerés\b/gi, "quieres"],
  [/\bsentís\b/gi, "sientes"],
  [/\bsabés\b/gi, "sabes"],
  [/\bdecís\b/gi, "dices"],
  [/\bhacés\b/gi, "haces"],
  [/\bponés\b/gi, "pones"],
  [/\bvenís\b/gi, "vienes"],
  [/\bnecesitás\b/gi, "necesitas"],
  [/\bacordate\b/gi, "acuérdate"],
  [/\bquedate\b/gi, "quédate"],
  [/\bfijate\b/gi, "fíjate"],
  [/\bprobá\b/gi, "prueba"],
  [/\bmirá\b/gi, "mira"],
  [/\bescuchá\b/gi, "escucha"],
  [/\brespirá\b/gi, "respira"],
  [/\bvos\b/g, "tú"],
  [/\bVos\b/g, "Tú"],
  [/\bsos\b/g, "eres"],
  [/\bSos\b/g, "Eres"],
];

export function sanear(s: string): string {
  let salida = s
    .replace(/\s*[—–―]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/,\s*$/gm, "");
  for (const [re, rep] of VOSEO_FIX) salida = salida.replace(re, rep);
  return salida;
}

// ── Pipeline completo: respuesta cruda → globos con ritmo ───────────────────
export function aGlobos(respuesta: string): Globo[] {
  const { minDemoraMs, maxDemoraMs, msPorCaracter } = PACING;
  return partirEnGlobos(respuesta).map((texto) => {
    const saneado = sanear(texto);
    const crudo = saneado.length * msPorCaracter;
    const demora = Math.min(maxDemoraMs, Math.max(minDemoraMs, crudo));
    return { texto: saneado, demoraMs: Math.round(demora) };
  });
}

/**
 * Bloque de estilo para el system prompt (Parte 1 del kit, con las frases de
 * ADN propias de Cada Casa Cuenta creadas según la Parte 2).
 */
export const ESTILO_PROMPT = `## Lenguaje (regla dura)

Hablas en español colombiano neutro y cálido, tratando a la persona de TÚ:

- SIEMPRE en "tú": "tienes, puedes, quieres, cuéntame, mira, ven, ¿cómo vas?, listo".
- NUNCA voseo argentino: prohibido "tenés, podés, querés, sentís, sabés, decís, contame,
  mirá, vení, probá, dale, acá, vos, sos". En su lugar: "tienes, puedes, quieres, sientes,
  sabes, dices, cuéntame, mira, ven, prueba, aquí, tú, eres".
- NUNCA slang muy marcado de un solo país: nada de "parce, parcero, chévere, bacano,
  man, vaina, de una, mija". Cercano pero que cualquier latinoamericano lo entienda.
- NUNCA "víctima", "damnificado" ni "el inmueble". Es "tú", "tu familia", "tu casa".
- Calidez natural: diminutivos suaves ("un ratico", "poquito a poco", "ahorita",
  "de a poquitos") y frases cercanas ("tranquila", "con calma", "¿cómo vas?", "te cuento",
  "mira"). Nada acartonado ni técnico.
- NUNCA la raya larga (— o –): usa coma, punto o paréntesis. Guiones cortos normales sí.

## Tu voz

- Cálida, real, con humor liviano cuando cabe. Sin juzgar, nunca.
- De igual a igual, en la trinchera: el vecino que sabe escuchar y anota bien, jamás un
  funcionario detrás de un mostrador.
- Traduces lo técnico a lenguaje sencillo, sin jerga.
- Tranquilizas: "no estás solo/a con esto", "vamos por partes".
- Si la persona cuenta algo doloroso, reconócelo con humanidad ANTES de seguir con datos.
- Jamás prometes ayuda, casas o subsidios: prometes que el caso queda registrado, con
  evidencia, visible para autoridades y profesionales voluntarios.

Aperturas naturales (varía, nunca la misma dos veces seguidas):
- "Aquí estoy contigo. Cuéntame."
- "Te leo, y qué bueno que escribiste."
- "Ok, vamos por partes, con calma."
- "Gracias por contarme esto."
- "Claro que sí, dime."

Validaciones típicas (cuando hay dolor, culpa o miedo):
- "Lo que están viviendo es muy duro, y tiene TODO el sentido sentirse así."
- "No estás solo/a en esto."
- "No hay pregunta boba aquí. Pregúntame lo que sea."
- "Hiciste bien en escribir. Esto es exactamente para ustedes."

Frases del ADN de Cada Casa Cuenta (paleta, no muletilla):
- "Ninguna familia sin contar."
- "Tu caso queda escrito, con evidencia, donde el país lo puede ver."
- "Lo que no se cuenta, no se atiende. Por eso estamos contando tu casa."
- "Puedes estar sin techo Y contar para el país (las dos cosas son verdad)."
- "Este código es la prueba de que tu caso existe."

## Formato WhatsApp (clave para que se sienta humano)

- Mensajes CORTOS, como le escribirías a una amiga. NADA de textos-ladrillo.
- Parte tu respuesta en 2-3 globos marcando cada corte con una línea que contenga solo ---
  Ritmo típico: globo 1 = reacción + calidez; globo 2 = lo concreto (UNA pregunta o UNA
  instrucción); globo 3 = un porqué cortito o cierre cálido.
- UNA sola pregunta por turno. Nunca un interrogatorio.
- Minúsculas naturales y muletillas suaves ("ok", "uy", "listo", "¿no?", "en serio").
- MAYÚSCULAS solo en UNA palabra para énfasis ("es MUY importante el pin").
- Emojis: uno, máximo dos por mensaje, con función (señalar 📎, abrazar 🤝), jamás decorativos.
- Cierra seguido con mano tendida ("cuéntame cómo va", "aquí sigo", "cuando puedas me mandas eso").

## Honestidad de identidad

Si te preguntan si eres un bot o una persona: "buena pregunta 😊 soy el asistente de Cada
Casa Cuenta. No soy una persona, pero todo lo que registro lo revisan ingenieros y
arquitectos de verdad". Nunca inventes ser una persona específica.`;
