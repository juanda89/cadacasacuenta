"use client";

import { useState } from "react";
import MapaSituacion, { type PuntoMapa } from "./MapaSituacion";
import ListaRegistro from "@/app/casos/ListaRegistro";

/**
 * La sala de situación con sus dos lentes: el MAPA (dónde está pasando) y la
 * TABLA (caso por caso). Un conmutador grande y evidente — pedido explícito —
 * cambia entre ambos sin salir de la página.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SalaConmutada({ puntos, todos }: { puntos: PuntoMapa[]; todos: (PuntoMapa & Record<string, any>)[] }) {
  const [vista, setVista] = useState<"mapa" | "tabla">("mapa");

  return (
    <div>
      <div className="conmutador-sala" role="tablist" aria-label="Cambiar entre mapa y tabla">
        <button
          role="tab"
          aria-selected={vista === "mapa"}
          className={`conmutador-opcion ${vista === "mapa" ? "activa" : ""}`}
          onClick={() => setVista("mapa")}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M9 3 3 5.4v15L9 18l6 2.4 6-2.4v-15L15 5.6 9 3Z" />
            <path d="M9 3v15M15 5.6v14.8" />
          </svg>
          Mapa
        </button>
        <button
          role="tab"
          aria-selected={vista === "tabla"}
          className={`conmutador-opcion ${vista === "tabla" ? "activa" : ""}`}
          onClick={() => setVista("tabla")}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
          Tabla
        </button>
      </div>

      {vista === "mapa" ? (
        <MapaSituacion puntos={puntos} />
      ) : (
        <div className="contenedor" style={{ paddingBottom: 8 }}>
          <ListaRegistro casos={todos} />
        </div>
      )}
    </div>
  );
}
