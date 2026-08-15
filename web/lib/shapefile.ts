import type { FilaExporte } from "./exporta";

/**
 * Generador de ESRI Shapefile (puntos) sin dependencias: .shp + .shx + .dbf +
 * .prj + .cpg empacados en un .zip (sin compresión — los shapefiles son chicos
 * y así el ZIP se escribe en ~60 líneas).
 *
 * La GEOMETRÍA va en MAGNA-SIRGAS / Colombia Bogotá zone (EPSG:3116) — el CRS
 * en el que trabaja el equipo SIG — usando las columnas este/norte ya
 * calculadas (desde el punto público redondeado). lat/lng WGS84 quedan como
 * atributos.
 */

// ESRI WKT de EPSG:3116 (MAGNA-SIRGAS / Colombia Bogotá zone)
const PRJ_3116 =
  'PROJCS["MAGNA-SIRGAS / Colombia Bogota zone",GEOGCS["GCS_MAGNA",DATUM["D_MAGNA",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",1000000.0],PARAMETER["False_Northing",1000000.0],PARAMETER["Central_Meridian",-74.07750791666666],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",4.596200416666666],UNIT["Meter",1.0]]';

type CampoDbf = { nombre: string; tipo: "C" | "N"; largo: number; dec: number; valor: (f: FilaExporte) => string };

const si = (v: unknown) => (v ? "si" : "no");
const num = (v: unknown, dec: number) => (v == null || v === "" ? "" : Number(v).toFixed(dec));

// Nombres DBF: máximo 10 caracteres, sin tildes
const CAMPOS: CampoDbf[] = [
  { nombre: "codigo", tipo: "C", largo: 13, dec: 0, valor: (f) => f.codigo_publico ?? "" },
  { nombre: "estado", tipo: "C", largo: 10, dec: 0, valor: (f) => f.estado ?? "" },
  { nombre: "dictamen", tipo: "C", largo: 15, dec: 0, valor: (f) => f.dictamen ?? "" },
  { nombre: "fecha_dict", tipo: "C", largo: 10, dec: 0, valor: (f) => (f.dictamen_at ?? "").slice(0, 10) },
  { nombre: "dano_estr", tipo: "C", largo: 2, dec: 0, valor: (f) => si(f.tiene_dano_estructural) },
  { nombre: "sin_viv", tipo: "C", largo: 2, dec: 0, valor: (f) => si(f.sin_vivienda) },
  { nombre: "colectivo", tipo: "C", largo: 2, dec: 0, valor: (f) => si(f.es_colectivo) },
  { nombre: "n_personas", tipo: "N", largo: 6, dec: 0, valor: (f) => num(f.num_personas, 0) },
  { nombre: "n_familias", tipo: "N", largo: 6, dec: 0, valor: (f) => num(f.num_familias, 0) },
  { nombre: "municipio", tipo: "C", largo: 30, dec: 0, valor: (f) => f.municipio_nombre ?? "" },
  { nombre: "divipola", tipo: "C", largo: 5, dec: 0, valor: (f) => f.municipio_divipola ?? "" },
  { nombre: "depto", tipo: "C", largo: 20, dec: 0, valor: (f) => f.departamento_nombre ?? "" },
  { nombre: "barrio", tipo: "C", largo: 30, dec: 0, valor: (f) => f.barrio ?? "" },
  { nombre: "necesidad", tipo: "C", largo: 40, dec: 0, valor: (f) => (f.necesidades_tipos ?? []).join("|") },
  { nombre: "urgente", tipo: "C", largo: 2, dec: 0, valor: (f) => si(f.hay_necesidad_urgente) },
  { nombre: "lat_wgs84", tipo: "N", largo: 10, dec: 3, valor: (f) => num(f.lat, 3) },
  { nombre: "lng_wgs84", tipo: "N", largo: 11, dec: 3, valor: (f) => num(f.lng, 3) },
  { nombre: "este_magna", tipo: "N", largo: 12, dec: 1, valor: (f) => num(f.este_magna, 1) },
  { nombre: "norte_magn", tipo: "N", largo: 12, dec: 1, valor: (f) => num(f.norte_magna, 1) },
  { nombre: "fecha_rep", tipo: "C", largo: 10, dec: 0, valor: (f) => (f.created_at ?? "").slice(0, 10) },
];

function dbf(filas: FilaExporte[]): Buffer {
  const tamRegistro = 1 + CAMPOS.reduce((s, c) => s + c.largo, 0);
  const tamCabecera = 32 + CAMPOS.length * 32 + 1;
  const buf = Buffer.alloc(tamCabecera + tamRegistro * filas.length + 1);
  const hoy = new Date();
  buf[0] = 0x03;
  buf[1] = hoy.getFullYear() - 1900;
  buf[2] = hoy.getMonth() + 1;
  buf[3] = hoy.getDate();
  buf.writeUInt32LE(filas.length, 4);
  buf.writeUInt16LE(tamCabecera, 8);
  buf.writeUInt16LE(tamRegistro, 10);
  buf[29] = 0x57; // language driver: ANSI (cp1252) — coincide con el .cpg

  CAMPOS.forEach((c, i) => {
    const off = 32 + i * 32;
    buf.write(c.nombre.slice(0, 10), off, "latin1");
    buf.write(c.tipo, off + 11, "latin1");
    buf[off + 16] = c.largo;
    buf[off + 17] = c.dec;
  });
  buf[32 + CAMPOS.length * 32] = 0x0d;

  filas.forEach((f, r) => {
    let off = tamCabecera + r * tamRegistro;
    buf[off++] = 0x20; // registro vivo
    for (const c of CAMPOS) {
      let v = c.valor(f) ?? "";
      if (v.length > c.largo) v = v.slice(0, c.largo);
      const pad = " ".repeat(c.largo - v.length);
      buf.write(c.tipo === "N" ? pad + v : v + pad, off, "latin1");
      off += c.largo;
    }
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

function shpYShx(puntos: { x: number; y: number }[]): { shp: Buffer; shx: Buffer } {
  const n = puntos.length;
  const shp = Buffer.alloc(100 + n * 28);
  const shx = Buffer.alloc(100 + n * 8);
  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);
  const bbox = n
    ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    : [0, 0, 0, 0];

  for (const b of [shp, shx]) {
    b.writeInt32BE(9994, 0);
    b.writeInt32LE(1000, 28);
    b.writeInt32LE(1, 32); // tipo 1: Point
    bbox.forEach((v, i) => b.writeDoubleLE(v, 36 + i * 8));
  }
  shp.writeInt32BE(shp.length / 2, 24); // longitudes en words de 16 bits
  shx.writeInt32BE(shx.length / 2, 24);

  puntos.forEach((p, i) => {
    const off = 100 + i * 28;
    shp.writeInt32BE(i + 1, off);
    shp.writeInt32BE(10, off + 4); // 20 bytes de contenido = 10 words
    shp.writeInt32LE(1, off + 8);
    shp.writeDoubleLE(p.x, off + 12);
    shp.writeDoubleLE(p.y, off + 20);
    shx.writeInt32BE(off / 2, 100 + i * 8);
    shx.writeInt32BE(10, 100 + i * 8 + 4);
  });
  return { shp, shx };
}

// ---- ZIP sin compresión (método store) ----
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function zipStore(archivos: { nombre: string; datos: Buffer }[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, "latin1");
    const crc = crc32(a.datos);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(a.datos.length, 18);
    lfh.writeUInt32LE(a.datos.length, 22);
    lfh.writeUInt16LE(nombre.length, 26);
    locales.push(lfh, nombre, a.datos);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(a.datos.length, 20);
    cdh.writeUInt32LE(a.datos.length, 24);
    cdh.writeUInt16LE(nombre.length, 28);
    cdh.writeUInt32LE(offset, 42);
    centrales.push(cdh, nombre);
    offset += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = centrales.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(archivos.length, 8);
  eocd.writeUInt16LE(archivos.length, 10);
  eocd.writeUInt32LE(tamCentral, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, ...centrales, eocd]);
}

/** Shapefile ZIP del registro (solo filas con coordenada). */
export function aShapefileZip(filas: FilaExporte[], base: string): Buffer {
  const conCoords = filas.filter((f) => f.este_magna != null && f.norte_magna != null);
  const { shp, shx } = shpYShx(conCoords.map((f) => ({ x: Number(f.este_magna), y: Number(f.norte_magna) })));
  return zipStore([
    { nombre: `${base}.shp`, datos: shp },
    { nombre: `${base}.shx`, datos: shx },
    { nombre: `${base}.dbf`, datos: dbf(conCoords) },
    { nombre: `${base}.prj`, datos: Buffer.from(PRJ_3116, "latin1") },
    { nombre: `${base}.cpg`, datos: Buffer.from("1252", "latin1") },
  ]);
}
