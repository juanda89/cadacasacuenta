"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

// Auto-asignación: el profesional toma el caso él mismo. RLS solo permite
// tomar casos libres, y el trigger de la BD completa estado + bitácora.
export function TomarCaso({ casoId }: { casoId: string }) {
  const [cargando, setCargando] = useState(false);
  const router = useRouter();
  async function tomar() {
    setCargando(true);
    const db = supabaseBrowser();
    const { data: { user } } = await db.auth.getUser();
    const { error } = await db
      .from("casos")
      .update({ asignado_a: user!.id })
      .eq("id", casoId)
      .is("asignado_a", null);
    if (error) alert(`No se pudo tomar el caso: ${error.message}`);
    router.refresh();
    setCargando(false);
  }
  return (
    <button className="boton secundario" style={{ padding: "6px 16px", fontSize: ".85rem" }} onClick={tomar} disabled={cargando}>
      {cargando ? "…" : "Tomarlo"}
    </button>
  );
}

export function Salir() {
  const router = useRouter();
  return (
    <button
      className="boton secundario"
      style={{ padding: "6px 16px", fontSize: ".85rem" }}
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.push("/");
      }}
    >
      Salir
    </button>
  );
}
