import "server-only";

/**
 * Geocodificación inversa con Nominatim (OpenStreetMap): de lat/lng al
 * barrio/vereda, municipio y departamento. Gratuito, sin key; su política de
 * uso exige User-Agent identificable y ≤1 req/s — el volumen del bot (una
 * llamada por ubicación recibida) queda muy por debajo.
 * Cobertura: buena en cascos urbanos colombianos; en zona rural puede no haber
 * barrio — por eso solo COMPLETA campos vacíos, jamás pisa lo que la persona dijo.
 */
export async function geocodificaInversa(
  lat: number,
  lng: number
): Promise<{ barrio: string | null; municipio: string | null; departamento: string | null }> {
  const vacio = { barrio: null, municipio: null, departamento: null };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=es`,
      {
        headers: { "User-Agent": "CadaCasaCuenta/1.0 (registro humanitario; cadacasacuenta.vercel.app)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return vacio;
    const a = (await res.json())?.address ?? {};
    return {
      barrio: a.neighbourhood ?? a.suburb ?? a.quarter ?? a.hamlet ?? a.village ?? null,
      municipio: a.city ?? a.town ?? a.municipality ?? a.county ?? null,
      departamento: a.state ?? null,
    };
  } catch (e) {
    console.error("geocodificaInversa", e);
    return vacio;
  }
}

/** Completa en el caso los campos de lugar que estén vacíos (nunca sobreescribe). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function completaLugar(db: any, casoId: string, lat: number, lng: number) {
  const { data: caso } = await db
    .from("casos")
    .select("barrio, municipio_nombre, departamento_nombre")
    .eq("id", casoId)
    .single();
  if (caso?.barrio && caso?.municipio_nombre && caso?.departamento_nombre) return;

  const geo = await geocodificaInversa(lat, lng);
  const patch: Record<string, string> = {};
  if (!caso?.barrio && geo.barrio) patch.barrio = geo.barrio;
  if (!caso?.municipio_nombre && geo.municipio) patch.municipio_nombre = geo.municipio;
  if (!caso?.departamento_nombre && geo.departamento) patch.departamento_nombre = geo.departamento;
  if (Object.keys(patch).length > 0) {
    await db.from("casos").update(patch).eq("id", casoId);
  }
}
