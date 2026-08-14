"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Simbolo, Wordmark } from "@/components/Logo";

export default function Profesionales() {
  const [modo, setModo] = useState<"registro" | "ingreso">("registro");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const db = supabaseBrowser();
    const email = String(f.get("email"));
    const password = String(f.get("password"));

    try {
      if (modo === "ingreso") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        router.push("/portal");
        return;
      }

      // Registro: cuenta + perfil profesional + evidencia de matrícula.
      const { data: auth, error: eAuth } = await db.auth.signUp({ email, password });
      if (eAuth) throw new Error(eAuth.message);
      if (!auth.session) {
        setAviso("Cuenta creada. Revise su correo para confirmarla y luego ingrese aquí con su contraseña.");
        setModo("ingreso");
        return;
      }
      const uid = auth.user!.id;

      const archivo = f.get("matricula_archivo") as File | null;
      let path: string | null = null;
      if (archivo && archivo.size > 0) {
        const ext = archivo.name.split(".").pop() ?? "pdf";
        path = `${uid}/matricula.${ext}`;
        const { error: eUp } = await db.storage.from("matriculas").upload(path, archivo, { upsert: true });
        if (eUp) throw new Error(`No se pudo subir la matrícula: ${eUp.message}`);
      }

      const { error: ePerfil } = await db.from("profesionales").insert({
        id: uid,
        nombre: String(f.get("nombre")),
        profesion: String(f.get("profesion")),
        matricula: String(f.get("matricula")),
        evidencia_matricula_path: path,
        ciudad: String(f.get("ciudad")),
        telefono: String(f.get("telefono") || "") || null,
        municipios: String(f.get("municipios") || "")
          .split(",").map((m) => m.trim()).filter(Boolean),
      });
      if (ePerfil) throw new Error(ePerfil.message);
      router.push("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo falló. Intente de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <header className="contenedor" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Simbolo size={30} />
          <Wordmark />
        </Link>
      </header>

      <main className="contenedor" style={{ maxWidth: 560, paddingBottom: 60 }}>
        <h1 style={{ fontSize: "1.8rem", margin: "10px 0 6px" }}>
          Su matrícula puede decirle a una familia si puede volver a dormir en su casa.
        </h1>
        <p style={{ color: "#4A5568", marginBottom: 20 }}>
          Regístrese con su matrícula profesional (COPNIA/CPNAA) y empiece a tomar casos de inmediato.
          Un administrador verificará su matrícula después — mientras tanto su perfil aparece como «pendiente de verificación».
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <button className={modo === "registro" ? "boton" : "boton secundario"} onClick={() => setModo("registro")} type="button">Registrarme</button>
          <button className={modo === "ingreso" ? "boton" : "boton secundario"} onClick={() => setModo("ingreso")} type="button">Ya tengo cuenta</button>
        </div>

        {aviso && <p className="tarjeta" style={{ padding: 14, marginBottom: 14, borderColor: "var(--aguacero)" }}>{aviso}</p>}
        {error && <p className="tarjeta" style={{ padding: 14, marginBottom: 14, color: "var(--bad)" }}>{error}</p>}

        <form onSubmit={onSubmit} className="tarjeta" style={{ padding: "24px 26px", display: "grid", gap: 14 }}>
          {modo === "registro" && (
            <>
              <div><label htmlFor="nombre">Nombre completo</label><input id="nombre" name="nombre" required /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label htmlFor="profesion">Profesión</label>
                  <select id="profesion" name="profesion" required defaultValue="ingenieria_civil">
                    <option value="ingenieria_civil">Ingeniería civil</option>
                    <option value="arquitectura">Arquitectura</option>
                    <option value="otra">Otra afín</option>
                  </select>
                </div>
                <div><label htmlFor="matricula">Matrícula profesional</label><input id="matricula" name="matricula" required /></div>
              </div>
              <div>
                <label htmlFor="matricula_archivo">Evidencia de la matrícula (foto o PDF) — sin ella no podrá tomar casos</label>
                <input id="matricula_archivo" name="matricula_archivo" type="file" accept="image/*,.pdf" required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label htmlFor="ciudad">Ciudad</label><input id="ciudad" name="ciudad" required /></div>
                <div><label htmlFor="telefono">Teléfono (opcional)</label><input id="telefono" name="telefono" type="tel" /></div>
              </div>
              <div>
                <label htmlFor="municipios">Municipios donde puede apoyar (separados por coma)</label>
                <input id="municipios" name="municipios" placeholder="Quibdó, Istmina, Nóvita" />
              </div>
            </>
          )}
          <div><label htmlFor="email">Correo</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
          <div><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" required minLength={8} autoComplete={modo === "registro" ? "new-password" : "current-password"} /></div>
          <button className="boton" disabled={cargando} type="submit">
            {cargando ? "Un momento…" : modo === "registro" ? "Crear mi cuenta" : "Ingresar"}
          </button>
        </form>
      </main>
    </>
  );
}
