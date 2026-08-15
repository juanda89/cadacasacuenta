import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PuntoMapa } from "@/components/MapaSituacion";

/**
 * Superficie pública enriquecida, SOLO en el servidor.
 * La vista caso_publico da los campos anonimizados; aquí se le suma la
 * primera foto de evidencia de cada caso como URL FIRMADA (expira), porque
 * el bucket es privado. La service_role jamás llega al navegador: al
 * cliente solo viajan las URLs ya firmadas.
 */

const FIRMA_SEGUNDOS = 60 * 60 * 24; // 24 h; la página revalida cada minuto

function anon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function casosPublicos(): Promise<{
  puntos: PuntoMapa[];
  todos: PuntoMapa[];
}> {
  const { data } = await anon()
    .from("caso_publico")
    .select(
      "codigo_publico, lat, lng, estado, dictamen, municipio_nombre, barrio, sin_vivienda, es_colectivo, num_familias, necesidades_abiertas, hay_necesidad_urgente, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  const todos = (data ?? []) as PuntoMapa[];

  // Primera foto por caso → URL firmada
  const codigos = todos.map((p) => p.codigo_publico);
  if (codigos.length > 0) {
    const admin = supabaseAdmin();
    const { data: casos } = await admin
      .from("casos")
      .select("id, codigo_publico")
      .in("codigo_publico", codigos);
    const porId = new Map((casos ?? []).map((c) => [c.id as string, c.codigo_publico as string]));

    if (porId.size > 0) {
      const { data: fotos } = await admin
        .from("evidencias")
        .select("caso_id, storage_path, created_at")
        .in("caso_id", [...porId.keys()])
        .eq("tipo", "foto")
        .order("created_at", { ascending: true });

      const primeraPorCaso = new Map<string, string>();
      for (const f of fotos ?? []) {
        if (!primeraPorCaso.has(f.caso_id)) primeraPorCaso.set(f.caso_id, f.storage_path);
      }
      if (primeraPorCaso.size > 0) {
        const rutas = [...primeraPorCaso.values()];
        const { data: firmadas } = await admin.storage
          .from("evidencias")
          .createSignedUrls(rutas, FIRMA_SEGUNDOS);
        const urlPorRuta = new Map(
          (firmadas ?? []).filter((f) => f.signedUrl).map((f) => [f.path as string, f.signedUrl])
        );
        const fotoPorCodigo = new Map<string, string>();
        for (const [casoId, ruta] of primeraPorCaso) {
          const codigo = porId.get(casoId);
          const url = urlPorRuta.get(ruta);
          if (codigo && url) fotoPorCodigo.set(codigo, url);
        }
        for (const p of todos) {
          const url = fotoPorCodigo.get(p.codigo_publico);
          if (url) p.fotoUrl = url;
        }
      }
    }
  }

  return { puntos: todos.filter((p) => p.lat != null), todos };
}

export type EvidenciaPublica = {
  tipo: "foto" | "audio" | "video" | "documento";
  url: string | null;
  transcripcion: string | null;
  creadaEn: string;
};

/** Detalle público de un caso: campos anonimizados + evidencias firmadas. */
export async function casoPublicoDetalle(codigo: string) {
  const { data: caso } = await anon()
    .from("caso_publico")
    .select("*")
    .eq("codigo_publico", codigo.toUpperCase())
    .maybeSingle();
  if (!caso) return null;

  const admin = supabaseAdmin();
  const { data: fila } = await admin
    .from("casos")
    .select("id")
    .eq("codigo_publico", caso.codigo_publico)
    .single();

  let evidencias: EvidenciaPublica[] = [];
  if (fila) {
    const { data: evs } = await admin
      .from("evidencias")
      .select("tipo, storage_path, transcripcion, created_at")
      .eq("caso_id", fila.id)
      .order("created_at", { ascending: true })
      .limit(24);
    const rutas = (evs ?? []).map((e) => e.storage_path);
    const { data: firmadas } = rutas.length
      ? await admin.storage.from("evidencias").createSignedUrls(rutas, FIRMA_SEGUNDOS)
      : { data: [] as { path: string | null; signedUrl: string }[] };
    const urlPorRuta = new Map(
      (firmadas ?? []).filter((f) => f.signedUrl).map((f) => [f.path as string, f.signedUrl])
    );
    evidencias = (evs ?? []).map((e) => ({
      tipo: e.tipo,
      url: urlPorRuta.get(e.storage_path) ?? null,
      transcripcion: e.transcripcion,
      creadaEn: e.created_at,
    }));
  }

  return { caso, evidencias };
}
