import type { Metadata } from "next";
import { Cabecera } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos — Cada Casa Cuenta",
  description:
    "Cómo Cada Casa Cuenta trata los datos personales de las familias que reportan su caso, conforme a la Ley 1581 de 2012.",
};

const SECCIONES = [
  {
    t: "1. Quién trata sus datos",
    c: "Cada Casa Cuenta, el registro humanitario de vivienda y necesidades del terremoto de Colombia (2026): Chocó, Caldas, Valle del Cauca, Risaralda y Quindío. Contacto: el número oficial de WhatsApp que aparece al pie de esta página.",
  },
  {
    t: "2. Qué datos se recogen",
    c: "Los que usted comparte por WhatsApp al reportar su caso: su número de teléfono, el nombre de contacto que nos dé, la ubicación de la vivienda (el pin o la dirección descrita), lo que cuente sobre el daño y las necesidades de su hogar, y las fotos, documentos o notas de voz que envíe como evidencia (las notas de voz se transcriben automáticamente).",
  },
  {
    t: "3. Para qué se usan",
    c: "Únicamente para: (a) registrar el estado de su vivienda y las necesidades de su hogar con un código único; (b) que ingenieros y arquitectos voluntarios acreditados puedan visitar la vivienda y emitir el dictamen de habitabilidad; y (c) que las autoridades de la emergencia tengan cifras trazables caso por caso. Nunca se usan con fines comerciales.",
  },
  {
    t: "4. Qué es público y qué no",
    c: "El mapa y la página pública de su caso NUNCA muestran su nombre ni su teléfono, y la ubicación se publica redondeada (~110 metros) para proteger a su familia. Su historia solo se publica si usted lo autoriza expresamente. El contacto exacto solo lo ve el profesional que toma su caso, y cada acceso queda anotado en una bitácora.",
  },
  {
    t: "5. Sus derechos (Ley 1581 de 2012)",
    c: "Usted puede conocer, actualizar, corregir o pedir la eliminación de sus datos, y revocar la autorización, en cualquier momento y sin costo. Basta con escribir al mismo número de WhatsApp desde el que reportó, con su código de caso si lo tiene a la mano.",
  },
  {
    t: "6. Cuánto tiempo se conservan",
    c: "Mientras dure la atención de la emergencia y las labores de reconstrucción asociadas a su caso. Después, los datos se anonimizan o eliminan, salvo la evidencia mínima de su autorización, que la ley exige conservar.",
  },
  {
    t: "7. La evidencia de su autorización",
    c: "Cuando usted autoriza, guardamos el texto exacto que le mostramos, su respuesta literal (o la transcripción de su nota de voz), la fecha y el identificador del mensaje. Es su garantía y la nuestra: nadie puede decir que usted autorizó algo distinto de lo que leyó.",
  },
];

export default function PoliticaDatos() {
  return (
    <>
      <Cabecera />
      <div style={{ height: 64 }} />
      <main className="contenedor" style={{ maxWidth: 760, padding: "44px 24px 72px" }}>
        <span className="kicker" style={{ color: "var(--aguacero)" }}>Ley 1581 de 2012</span>
        <h1 style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.6rem)", margin: "14px 0 10px" }}>
          Política de tratamiento de datos personales
        </h1>
        <p style={{ color: "var(--arcilla)", maxWidth: "58ch", marginBottom: 30 }}>
          Esta es la política que el asistente de WhatsApp le comparte antes de registrar
          cualquier dato. Está escrita para leerse en un celular, sin letra menuda.
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          {SECCIONES.map((s) => (
            <section key={s.t} className="tarjeta" style={{ padding: "20px 24px" }}>
              <h2 style={{ fontSize: "1.05rem", marginBottom: 6 }}>{s.t}</h2>
              <p style={{ fontSize: ".93rem", color: "var(--grafito)", lineHeight: 1.65 }}>{s.c}</p>
            </section>
          ))}
        </div>
        <p style={{ fontSize: ".8rem", color: "var(--arcilla)", marginTop: 22, maxWidth: "60ch" }}>
          Última actualización: 14 de agosto de 2026. Si esta política cambia, las nuevas
          autorizaciones citarán la versión nueva; la que usted aceptó queda archivada tal
          cual la leyó.
        </p>
      </main>
      <Pie />
    </>
  );
}
