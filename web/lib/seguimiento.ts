import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";

/**
 * Seguimiento familiar verificado por OTP.
 *
 * La familia demuestra que radicó el caso con su número de WhatsApp: se le
 * envía un código de 6 dígitos por el mismo canal, y al verificarlo recibe una
 * cookie firmada (HMAC) que abre SOLO ese caso durante 7 días.
 * El OTP se guarda hasheado, expira a los 10 minutos, admite 5 intentos y es
 * de un solo uso. Nunca revelamos si un teléfono coincide o no (anti-enumeración).
 */

const SECRET = () => {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET no configurado");
  return s;
};

export const COOKIE_SEGUIMIENTO = "ccc_seg";
export const OTP_MINUTOS = 10;
export const OTP_MAX_INTENTOS = 5;
export const SESION_DIAS = 7;

export function generaOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(codigo: string, casoId: string): string {
  return createHash("sha256").update(`${casoId}:${codigo}:${SECRET()}`).digest("hex");
}

/** Los teléfonos llegan como quiera (+57 310..., 310...): comparamos los últimos 10 dígitos. */
export function normalizaTelefono(t: string): string {
  return t.replace(/\D/g, "").slice(-10);
}

// ---- Token de sesión de seguimiento: "codigo.exp.firma" ----

function firma(payload: string): string {
  return createHmac("sha256", SECRET()).update(payload).digest("base64url");
}

export function emiteToken(codigoCaso: string): string {
  const exp = Date.now() + SESION_DIAS * 24 * 60 * 60 * 1000;
  const payload = `${codigoCaso.toUpperCase()}.${exp}`;
  return `${payload}.${firma(payload)}`;
}

export function verificaToken(token: string | undefined, codigoCaso: string): boolean {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 3) return false;
  const [codigo, exp, sig] = partes;
  if (codigo !== codigoCaso.toUpperCase()) return false;
  if (Number(exp) < Date.now()) return false;
  const esperada = firma(`${codigo}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}
