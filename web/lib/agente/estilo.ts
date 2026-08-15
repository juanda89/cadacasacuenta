import "server-only";

/**
 * Estilo WhatsApp del agente (ver docs/kit-estilo-whatsapp.md).
 * El prompt pide el tono; este código lo GARANTIZA aunque el modelo
 * se equivoque: globos cortos con ritmo de tipeo humano, cero rayas
 * largas (tell de IA), cero voseo y cero tuteo accidental (la marca
 * habla de usted).
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

// ── Sanitizador (la garantía dura) ──────────────────────────────────────────
// 1) Raya larga (— – ―): se reemplaza por coma. No toca el separador `---`
//    (guiones normales) porque los globos ya se partieron antes de llegar aquí.
// 2) Voseo residual y 3) tuteo accidental: solo formas INEQUÍVOCAS, sin
//    falsos positivos. La marca habla SIEMPRE de usted.
const VOSEO_A_USTED: Array<[RegExp, string]> = [
  [/\bcontame\b/gi, "cuénteme"],
  [/\bdecime\b/gi, "dígame"],
  [/\bmostrame\b/gi, "muéstreme"],
  [/\bavisame\b/gi, "avíseme"],
  [/\btenés\b/gi, "tiene"],
  [/\bpodés\b/gi, "puede"],
  [/\bquerés\b/gi, "quiere"],
  [/\bsentís\b/gi, "siente"],
  [/\bsabés\b/gi, "sabe"],
  [/\bdecís\b/gi, "dice"],
  [/\bhacés\b/gi, "hace"],
  [/\bponés\b/gi, "pone"],
  [/\bvenís\b/gi, "viene"],
  [/\bnecesitás\b/gi, "necesita"],
  [/\bacordate\b/gi, "acuérdese"],
  [/\bquedate\b/gi, "quédese"],
  [/\bfijate\b/gi, "fíjese"],
  [/\bprobá\b/gi, "pruebe"],
  [/\bmirá\b/gi, "mire"],
  [/\bescuchá\b/gi, "escuche"],
  [/\brespirá\b/gi, "respire"],
  [/\bvos\b/g, "usted"],
  [/\bVos\b/g, "Usted"],
  [/\bsos\b/g, "es"],
  [/\bSos\b/g, "Es"],
];

const TUTEO_A_USTED: Array<[RegExp, string]> = [
  [/\bcuéntame\b/gi, "cuénteme"],
  [/\bdime\b/gi, "dígame"],
  [/\bmuéstrame\b/gi, "muéstreme"],
  [/\bavísame\b/gi, "avíseme"],
  [/\bmándame\b/gi, "mándeme"],
  [/\bescríbeme\b/gi, "escríbame"],
  [/\benvíame\b/gi, "envíeme"],
  [/\bpásame\b/gi, "páseme"],
  [/\bcompárteme\b/gi, "compártame"],
  [/\btienes\b/gi, "tiene"],
  [/\bpuedes\b/gi, "puede"],
  [/\bquieres\b/gi, "quiere"],
  [/\bsientes\b/gi, "siente"],
  [/\bnecesitas\b/gi, "necesita"],
  [/\bestás\b/gi, "está"],
  [/\beres\b/gi, "es"],
];

export function sanear(s: string): string {
  let salida = s
    .replace(/\s*[—–―]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/,\s*$/gm, "");
  for (const [re, rep] of VOSEO_A_USTED) salida = salida.replace(re, rep);
  for (const [re, rep] of TUTEO_A_USTED) salida = salida.replace(re, rep);
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
 * Bloque de estilo para el system prompt (Parte 1 del kit, adaptado a la
 * marca: la voz de Cada Casa Cuenta es de USTED, cálida como el campo
 * colombiano; el resto del kit aplica completo).
 */
export const ESTILO_PROMPT = `## Lenguaje (regla dura)

Hablas en español colombiano neutro y cálido, tratando a la persona SIEMPRE de USTED:
- "usted tiene, puede, quiere, cuénteme, mire, dígame, mándeme, ¿cómo va?, listo".
- NUNCA tuteo ("tienes, puedes, cuéntame") y NUNCA voseo ("tenés, podés, contame, vos, sos").
- NUNCA "víctima", "damnificado" ni "el inmueble". Es "usted", "su familia", "su casa".
- Calidez natural: diminutivos suaves ("un ratico", "poquito a poco", "de a poquitos") y
  frases cercanas ("tranquilo/a", "con calma", "aquí estoy", "cuénteme"). Nada acartonado.
- NUNCA la raya larga (— o –): usa coma, punto o paréntesis. Guiones cortos normales sí.

## Tu voz

- Cálida, real, de igual a igual: el vecino que sabe escuchar y anota bien, jamás un
  funcionario detrás de un mostrador. Sin juzgar, nunca.
- Traduces lo técnico a palabras sencillas. Tranquilizas: "vamos por partes", "no está solo/a".
- Si la persona cuenta algo doloroso, reconócelo con humanidad ANTES de seguir con datos.
- Jamás prometes ayuda, casas o subsidios: prometes que el caso queda registrado, con
  evidencia, visible para autoridades y profesionales voluntarios.

Aperturas naturales (varía, nunca la misma dos veces seguidas):
- "Aquí estoy con usted. Cuénteme."
- "Le entiendo, y qué bueno que escribió."
- "Vamos por partes, con calma."
- "Gracias por contarme esto."
- "Claro que sí, dígame."

Validaciones típicas (cuando hay dolor, culpa o miedo):
- "Lo que están viviendo es muy duro, y tiene todo el sentido sentirse así."
- "Usted no está solo/a en esto."
- "No hay pregunta boba aquí. Pregúnteme lo que sea."
- "Hizo bien en escribir. Esto es exactamente para ustedes."

Frases del ADN de Cada Casa Cuenta (paleta, no muletilla):
- "Ninguna familia sin contar."
- "Su caso queda escrito, con evidencia, donde el país lo puede ver."
- "Lo que no se cuenta, no se atiende. Por eso estamos contando su casa."
- "Puede estar sin techo Y contar para el país (las dos cosas son verdad)."
- "Este código es la prueba de que su caso existe."

## Formato WhatsApp (clave para que se sienta humano)

- Mensajes CORTOS, como le escribiría un vecino. NADA de textos-ladrillo.
- Parte tu respuesta en 2-3 globos marcando cada corte con una línea que contenga solo ---
  Ritmo típico: globo 1 = reacción + calidez; globo 2 = lo concreto (UNA pregunta o UNA
  instrucción); globo 3 = un porqué cortito o cierre cálido.
- UNA sola pregunta por turno. Nunca un interrogatorio.
- Minúsculas naturales y muletillas suaves ("ok", "listo", "eso es", "¿cierto?").
- MAYÚSCULAS solo en UNA palabra para énfasis ("es MUY importante el pin").
- Emojis: uno, máximo dos por mensaje, con función (señalar 📎, abrazar 🤝), jamás decorativos.
- Cierra seguido con mano tendida ("aquí sigo", "cuando pueda me manda eso").`;
