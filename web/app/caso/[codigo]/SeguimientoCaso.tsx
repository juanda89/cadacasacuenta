"use client";

import { useState } from "react";

/**
 * El portón del detalle: "Hacer seguimiento a mi caso".
 * Paso 1: número de WhatsApp con el que se radicó → se envía OTP por WhatsApp.
 * Paso 2: código de 6 dígitos → cookie firmada → recarga mostrando el detalle.
 */
export default function SeguimientoCaso({ codigo }: { codigo: string }) {
  const [paso, setPaso] = useState<"cerrado" | "telefono" | "otp">("cerrado");
  const [telefono, setTelefono] = useState("");
  const [otp, setOtp] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/seguimiento/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, telefono }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo solicitar el código");
      setAviso(d.mensaje);
      setPaso("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/seguimiento/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, telefono, otp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Código incorrecto");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setCargando(false);
    }
  }

  return (
    <div className="tarjeta" style={{ padding: "22px 24px", background: "var(--bruma)", border: "none" }}>
      <h2 style={{ fontSize: "1.15rem", marginBottom: 6 }}>¿Este caso es suyo?</h2>
      <p style={{ fontSize: ".88rem", color: "var(--arcilla)", lineHeight: 1.65, marginBottom: 14, maxWidth: "52ch" }}>
        Por la privacidad de cada familia, el detalle solo lo ve quien radicó el caso. Verifíquese
        con el número de WhatsApp que usó al reportar: le enviamos un código por ese mismo chat.
      </p>

      {paso === "cerrado" && (
        <button className="boton" onClick={() => setPaso("telefono")}>
          Hacer seguimiento a mi caso
        </button>
      )}

      {paso === "telefono" && (
        <form onSubmit={solicitar} style={{ display: "grid", gap: 10, maxWidth: 380 }}>
          <label htmlFor="seg-tel">Número de WhatsApp con el que reportó</label>
          <input
            id="seg-tel"
            type="tel"
            inputMode="tel"
            placeholder="3XX XXX XXXX"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required
            autoFocus
          />
          <button className="boton" disabled={cargando} type="submit" style={{ justifySelf: "start" }}>
            {cargando ? "Enviando…" : "Enviarme el código por WhatsApp"}
          </button>
        </form>
      )}

      {paso === "otp" && (
        <form onSubmit={verificar} style={{ display: "grid", gap: 10, maxWidth: 380 }}>
          {aviso && <p style={{ fontSize: ".85rem", color: "var(--tinta)" }}>{aviso}</p>}
          <label htmlFor="seg-otp">Código de 6 dígitos</label>
          <input
            id="seg-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            autoFocus
            style={{ letterSpacing: ".4em", fontSize: "1.3rem", fontVariantNumeric: "tabular-nums", textAlign: "center" }}
          />
          <button className="boton" disabled={cargando} type="submit" style={{ justifySelf: "start" }}>
            {cargando ? "Verificando…" : "Ver mi caso"}
          </button>
          <button
            type="button"
            onClick={() => { setPaso("telefono"); setOtp(""); setError(null); }}
            style={{ background: "none", border: "none", color: "var(--aguacero)", cursor: "pointer", justifySelf: "start", fontSize: ".85rem", fontWeight: 600, padding: 0 }}
          >
            ¿No llegó? Revisar el número o pedir otro código
          </button>
          <p style={{ fontSize: ".76rem", color: "var(--arcilla)", maxWidth: "44ch" }}>
            Consejo: si no le llega, escríbale cualquier mensaje al WhatsApp oficial del registro y
            vuelva a pedir el código — eso reabre la ventana de entrega.
          </p>
        </form>
      )}

      {error && <p style={{ color: "var(--bad)", fontSize: ".88rem", marginTop: 10 }}>{error}</p>}
    </div>
  );
}
