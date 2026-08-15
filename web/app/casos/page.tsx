import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { casosPublicos } from "@/lib/casos-publicos";
import ListaRegistro from "./ListaRegistro";

export const revalidate = 60;

export const metadata = {
  title: "El registro — Cada Casa Cuenta",
  description:
    "Todos los casos del registro humanitario del terremoto de Colombia 2026, como lista consultable y descargable: estado, dictamen, necesidades y ubicación anonimizada.",
};

export default async function Casos() {
  const { todos } = await casosPublicos();

  return (
    <>
      <Cabecera />
      <div style={{ height: 64 }} />
      <main className="contenedor" style={{ padding: "36px 24px 72px" }}>
        <span className="kicker" style={{ color: "var(--aguacero)" }}>El registro, caso por caso</span>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", margin: "12px 0 6px", maxWidth: "24ch" }}>
          Lo que el mapa muestra, aquí se puede leer.
        </h1>
        <p style={{ maxWidth: "62ch", color: "var(--arcilla)", marginBottom: 8 }}>
          Cada fila es una edificación reportada, con su código, su estado y sus necesidades —
          sin nombres, sin teléfonos y con la ubicación redondeada (~110 m). Los mismos datos se
          pueden descargar para ArcGIS/QGIS con coordenadas WGS84 y MAGNA-SIRGAS (EPSG:3116).
        </p>
        <ListaRegistro casos={todos} />
      </main>
      <Pie />
    </>
  );
}
