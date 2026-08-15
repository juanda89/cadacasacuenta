"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const ELEMENTOS = ["cimentacion", "columnas", "vigas", "muros", "entrepisos", "cubierta", "escaleras", "fachada", "instalaciones"] as const;
const ESTADOS_ELEMENTO = ["sin_dano", "leve", "moderado", "severo", "colapso"] as const;

/** Semáforo + checklist opcional: el dictamen es lo obligatorio (decisión de
 *  producto); el detalle NSR-10 se despliega solo si el profesional lo quiere. */
export function FormEvaluacion({ casoId }: { casoId: string }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const db = supabaseBrowser();
    const { data: { user } } = await db.auth.getUser();

    const estados: Record<string, string> = {};
    if (checklist) {
      for (const el of ELEMENTOS) {
        const v = String(f.get(`el_${el}`) || "");
        if (v) estados[el] = v;
      }
    }

    // La ubicación de la visita, si el navegador la da (evidencia de presencia)
    let visita: string | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })
      );
      visita = `SRID=4326;POINT(${pos.coords.longitude} ${pos.coords.latitude})`;
    } catch { /* sin GPS no se bloquea el dictamen */ }

    const { error: eIns } = await db.from("evaluaciones").insert({
      caso_id: casoId,
      profesional_id: user!.id,
      dictamen: String(f.get("dictamen")),
      dano_global: String(f.get("dano_global") || "") || null,
      sistema_constructivo: String(f.get("sistema") || "") || null,
      numero_pisos: Number(f.get("pisos")) || null,
      recomendacion: String(f.get("recomendacion") || "") || null,
      observaciones: String(f.get("observaciones") || "") || null,
      estados_elementos: estados,
      visita_ubicacion: visita,
    });
    if (eIns) setError(eIns.message);
    else router.refresh();
    setEnviando(false);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div>
        <label>Dictamen de habitabilidad (obligatorio)</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* color + palabra + forma: nunca color solo */}
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
            <input type="radio" name="dictamen" value="habitable" required style={{ width: "auto" }} />
            <span className="chip ok">✓ Habitable</span>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
            <input type="radio" name="dictamen" value="uso_restringido" style={{ width: "auto" }} />
            <span className="chip warn">▲ Uso restringido</span>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
            <input type="radio" name="dictamen" value="no_habitable" style={{ width: "auto" }} />
            <span className="chip bad">✕ No habitable</span>
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div>
          <label htmlFor="dano_global">Daño global</label>
          <select id="dano_global" name="dano_global" defaultValue="">
            <option value="">—</option>
            <option value="sin_dano">Sin daño</option>
            <option value="leve">Leve</option>
            <option value="moderado">Moderado</option>
            <option value="severo">Severo</option>
            <option value="colapso">Colapso</option>
          </select>
        </div>
        <div>
          <label htmlFor="sistema">Sistema constructivo</label>
          <select id="sistema" name="sistema" defaultValue="">
            <option value="">—</option>
            <option value="mamposteria_confinada">Mampostería confinada</option>
            <option value="mamposteria_no_confinada">Mampostería no confinada</option>
            <option value="porticos_concreto">Pórticos de concreto</option>
            <option value="muros_concreto">Muros de concreto</option>
            <option value="acero">Acero</option>
            <option value="madera">Madera</option>
            <option value="bahareque">Bahareque</option>
            <option value="tapia">Tapia</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div><label htmlFor="pisos">Pisos</label><input id="pisos" name="pisos" type="number" min={1} /></div>
      </div>

      <div><label htmlFor="recomendacion">Recomendación de intervención</label><input id="recomendacion" name="recomendacion" placeholder="p. ej. Apuntalar muro norte antes de reingresar" /></div>
      <div><label htmlFor="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones" rows={3} /></div>

      <button type="button" className="boton secundario" style={{ justifySelf: "start", padding: "8px 18px", fontSize: ".9rem" }} onClick={() => setChecklist(!checklist)}>
        {checklist ? "Ocultar checklist NSR-10" : "Agregar checklist detallado (opcional)"}
      </button>

      {checklist && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, background: "var(--bruma)", borderRadius: 10, padding: 14 }}>
          {ELEMENTOS.map((el) => (
            <div key={el}>
              <label htmlFor={`el_${el}`} style={{ textTransform: "capitalize" }}>{el}</label>
              <select id={`el_${el}`} name={`el_${el}`} defaultValue="">
                <option value="">—</option>
                {ESTADOS_ELEMENTO.map((s) => (
                  <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      <button className="boton" disabled={enviando} type="submit" style={{ justifySelf: "start" }}>
        {enviando ? "Registrando…" : "Estampar dictamen"}
      </button>
      <p style={{ fontSize: ".78rem", color: "#6B655C", maxWidth: "56ch", margin: 0 }}>
        Si su matrícula aún está en verificación, el dictamen queda como <strong>preliminar</strong>:
        visible para el equipo, nunca en el mapa público, y se confirma automáticamente cuando un
        administrador valide su matrícula.
      </p>
    </form>
  );
}

/** El contacto se pide a la RPC con bitácora — el botón lo hace explícito. */
export function VerContacto({ casoId }: { casoId: string }) {
  const [contacto, setContacto] = useState<{ nombre: string | null; telefono: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pedir() {
    const db = supabaseBrowser();
    const { data, error } = await db.rpc("contacto_caso", { p_caso_id: casoId });
    if (error) setError(error.message);
    else setContacto(data?.[0] ?? { nombre: null, telefono: null });
  }

  if (contacto) {
    return (
      <span className="chip" style={{ fontSize: ".9rem" }}>
        {contacto.nombre ?? "Sin nombre"} · <a href={`https://wa.me/${(contacto.telefono ?? "").replace("+", "")}`}>{contacto.telefono}</a>
      </span>
    );
  }
  return (
    <span>
      <button className="boton secundario" style={{ padding: "6px 16px", fontSize: ".85rem" }} onClick={pedir}>
        Ver contacto (queda en bitácora)
      </button>
      {error && <span style={{ color: "var(--bad)", fontSize: ".8rem", marginLeft: 8 }}>{error}</span>}
    </span>
  );
}

export function LiberarCaso({ casoId }: { casoId: string }) {
  const router = useRouter();
  return (
    <button
      className="boton secundario"
      style={{ padding: "6px 16px", fontSize: ".85rem" }}
      onClick={async () => {
        if (!confirm("¿Devolver este caso para que otro profesional lo tome?")) return;
        const db = supabaseBrowser();
        const { error } = await db.from("casos").update({ asignado_a: null }).eq("id", casoId);
        if (error) alert(error.message);
        else router.push("/portal");
      }}
    >
      Devolver el caso
    </button>
  );
}
