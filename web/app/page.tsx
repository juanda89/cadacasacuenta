import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import MapaSituacion, { type PuntoMapa } from "@/components/MapaSituacion";
import { Cabecera, WHATSAPP_URL } from "@/components/Cabecera";
import { Pie } from "@/components/Pie";
import { Revela, Contador } from "@/components/Revela";

export const revalidate = 60; // el mapa público se refresca cada minuto

async function datosPublicos() {
  // Vista pública anonimizada: seguro con anon key, sin sesión.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // caso_publico incluye también los reportes sin ubicación (p. ej. descritos
  // por texto): las cifras deben contarlos aunque el mapa no pueda dibujarlos.
  const { data } = await db
    .from("caso_publico")
    .select(
      "codigo_publico, lat, lng, estado, dictamen, municipio_nombre, sin_vivienda, es_colectivo, num_familias, necesidades_abiertas, hay_necesidad_urgente"
    )
    .limit(1000);
  const todos = (data ?? []) as PuntoMapa[];
  const puntos = todos.filter((p) => p.lat != null);
  const familias = todos.reduce((s, p) => s + (p.num_familias || 1), 0);
  const conDictamen = todos.filter((p) => p.dictamen).length;
  const sinVivienda = todos.filter((p) => p.sin_vivienda).reduce((s, p) => s + (p.num_familias || 1), 0);
  return { puntos, familias, conDictamen, sinVivienda };
}

const PASOS = [
  {
    img: "/ilustraciones/paso-reportar.webp",
    n: "01",
    t: "La familia cuenta",
    d: "Un mensaje de WhatsApp basta: texto, notas de voz, fotos y el pin de ubicación. Con su autorización, el caso queda registrado con código único y evidencia que nadie puede borrar.",
  },
  {
    img: "/ilustraciones/paso-visita.webp",
    n: "02",
    t: "Un profesional visita",
    d: "Ingenieros y arquitectos voluntarios toman los casos de su zona, caminan hasta la puerta y emiten el dictamen de habitabilidad: el sello que dice si esa casa es segura.",
  },
  {
    img: "/ilustraciones/paso-mapa.webp",
    n: "03",
    t: "El país lo ve",
    d: "El mapa se dibuja en tiempo real, casa por casa. Las autoridades reciben cifras trazables hasta el último hogar — el censo que faltaba, a la vista de todos.",
  },
];

export default async function Home() {
  const { puntos, familias, conDictamen, sinVivienda } = await datosPublicos();

  return (
    <>
      <Cabecera conMapa />

      {/* ============ Hero: el diorama del Atrato ============ */}
      <section style={{ position: "relative", overflow: "hidden", background: "var(--tinta)" }}>
        <video
          autoPlay
          muted
          loop
          playsInline
          poster="/hero.jpg"
          style={{ width: "100%", height: "min(92vh, 780px)", objectFit: "cover", opacity: 0.94 }}
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(31,58,95,.28) 0%, rgba(31,58,95,0) 26%, rgba(31,58,95,0) 42%, rgba(31,58,95,.86) 100%)",
          }}
        />
        <div
          className="contenedor hero-entra"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            paddingBottom: 72,
            color: "#FBF7EF",
          }}
        >
          <span className="kicker" style={{ color: "rgba(251,247,239,.85)" }}>
            Terremoto del Chocó · 2026
          </span>
          <h1
            style={{
              color: "#FBF7EF",
              fontSize: "clamp(2.5rem, 7vw, 4.6rem)",
              maxWidth: "14ch",
              marginTop: 14,
              textShadow: "0 2px 24px rgba(31,58,95,.45)",
            }}
          >
            Ninguna familia sin contar.
          </h1>
          <p style={{ maxWidth: "54ch", marginTop: 16, fontSize: "1.12rem", lineHeight: 1.65, color: "rgba(251,247,239,.92)" }}>
            Tras el terremoto no existía un censo de las familias afectadas. Este es el registro que se
            construye casa por casa, voz por voz — por WhatsApp, con evidencia, a la vista del país.
          </p>
          <div style={{ marginTop: 26, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <a className="boton" href={WHATSAPP_URL} style={{ background: "#FBF7EF", color: "var(--tinta)" }}>
              Reportar por WhatsApp
            </a>
            <a
              className="boton"
              href="#mapa"
              style={{
                background: "rgba(251,247,239,.14)",
                color: "#FBF7EF",
                border: "1px solid rgba(251,247,239,.35)",
                boxShadow: "none",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              Ver la sala de situación
            </a>
          </div>
        </div>
        {/* El borde del papel: el hero es una lámina rasgada sobre la página */}
        <svg
          className="borde-rasgado"
          style={{ position: "absolute", bottom: -1, left: 0 }}
          viewBox="0 0 1440 26"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,26 L0,14 C60,8 120,18 190,12 C260,6 330,16 400,10 C470,4 540,15 610,11 C680,7 750,17 820,12 C890,7 960,16 1030,10 C1100,4 1170,15 1240,11 C1310,7 1380,14 1440,9 L1440,26 Z"
            fill="var(--papel)"
          />
        </svg>
      </section>

      {/* ============ Cifras vivas: el dato dictamina ============ */}
      <section className="contenedor" style={{ padding: "56px 24px 8px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { n: familias, l: "familias registradas", d: "cada una con código y evidencia" },
            { n: puntos.length, l: "hogares en el mapa", d: "con ubicación verificable" },
            { n: conDictamen, l: "con dictamen técnico", d: "visitados por profesionales" },
            { n: sinVivienda, l: "familias sin vivienda", d: "la cifra que más urge" },
          ].map((s, i) => (
            <Revela key={s.l} retraso={i * 110}>
              <div className="tarjeta" style={{ padding: "22px 24px", height: "100%" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "2.6rem",
                    color: "var(--tinta)",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  <Contador hasta={s.n} />
                </div>
                <div style={{ fontWeight: 700, fontSize: ".95rem", marginTop: 6, color: "var(--grafito)" }}>{s.l}</div>
                <div style={{ fontSize: ".8rem", color: "var(--arcilla)", marginTop: 2 }}>{s.d}</div>
              </div>
            </Revela>
          ))}
        </div>
      </section>

      {/* ============ La sala de situación ============ */}
      <section id="mapa" className="contenedor" style={{ padding: "64px 24px 30px", scrollMarginTop: 72 }}>
        <Revela>
          <span className="kicker" style={{ color: "var(--aguacero)" }}>La sala de situación</span>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", marginTop: 12, maxWidth: "22ch" }}>
            El mapa que el país no tenía.
          </h2>
          <p style={{ maxWidth: "58ch", color: "var(--arcilla)", margin: "14px 0 26px", fontSize: "1.02rem" }}>
            Colombia, recortada en papel. Cada marcador lleva el techo de tinta y un punto con el color del
            dictamen — verde, ámbar o rojo — y el epicentro respira donde empezó todo, en San José del Palmar.
          </p>
        </Revela>
        <Revela retraso={140}>
          <MapaSituacion puntos={puntos} />
        </Revela>
      </section>

      {/* ============ Cómo funciona: tres láminas de papel ============ */}
      <section style={{ background: "var(--bruma)", padding: "72px 0 80px", marginTop: 48, position: "relative" }}>
        <svg
          className="borde-rasgado"
          style={{ position: "absolute", top: -25, left: 0, transform: "scaleY(-1)" }}
          viewBox="0 0 1440 26"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,26 L0,14 C60,8 120,18 190,12 C260,6 330,16 400,10 C470,4 540,15 610,11 C680,7 750,17 820,12 C890,7 960,16 1030,10 C1100,4 1170,15 1240,11 C1310,7 1380,14 1440,9 L1440,26 Z"
            fill="var(--bruma)"
          />
        </svg>
        <div className="contenedor">
          <Revela>
            <span className="kicker" style={{ color: "var(--aguacero)" }}>Cómo funciona</span>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", marginTop: 12, maxWidth: "24ch" }}>
              De la voz de una familia al mapa de todos.
            </h2>
          </Revela>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 22,
              marginTop: 40,
            }}
          >
            {PASOS.map((p, i) => (
              <Revela key={p.n} retraso={i * 140}>
                <article className="tarjeta" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{ position: "relative", background: "var(--papel)" }}>
                    <Image
                      src={p.img}
                      alt=""
                      width={720}
                      height={720}
                      style={{ width: "100%", height: "auto" }}
                      sizes="(max-width: 700px) 100vw, 360px"
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: 14,
                        left: 16,
                        fontFamily: "var(--font-display)",
                        fontSize: "1.5rem",
                        fontWeight: 600,
                        color: "var(--tinta)",
                        opacity: 0.8,
                      }}
                    >
                      {p.n}
                    </span>
                  </div>
                  <div style={{ padding: "20px 22px 24px" }}>
                    <h3 style={{ fontSize: "1.3rem", marginBottom: 8 }}>{p.t}</h3>
                    <p style={{ fontSize: ".95rem", color: "var(--arcilla)", lineHeight: 1.65 }}>{p.d}</p>
                  </div>
                </article>
              </Revela>
            ))}
          </div>
        </div>
      </section>

      {/* ============ La razón de ser ============ */}
      <section style={{ padding: "88px 0", background: "var(--papel)" }}>
        <div className="contenedor" style={{ maxWidth: 880 }}>
          <Revela>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.5rem, 3.4vw, 2.3rem)",
                lineHeight: 1.35,
                color: "var(--tinta)",
                textWrap: "balance",
              }}
            >
              «No existe un censo de las familias afectadas ni evaluaciones estructurales de sus
              viviendas.»
            </p>
            <p style={{ marginTop: 18, color: "var(--arcilla)", fontSize: ".95rem" }}>
              La alerta de la Defensoría del Pueblo tras el terremoto. Este registro existe para cerrar ese
              vacío: <strong style={{ color: "var(--tinta)" }}>lo que no se cuenta, no se atiende.</strong>
            </p>
          </Revela>
          <Revela retraso={160}>
            <div
              className="tarjeta"
              style={{
                marginTop: 44,
                padding: "30px 32px",
                display: "flex",
                flexWrap: "wrap",
                gap: 22,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ maxWidth: "46ch" }}>
                <h3 style={{ fontSize: "1.35rem" }}>¿Es usted ingeniero/a o arquitecto/a?</h3>
                <p style={{ color: "var(--arcilla)", fontSize: ".95rem", marginTop: 6 }}>
                  Su firma puede decirle a una familia si puede volver a dormir bajo su techo. Regístrese con su
                  matrícula y empiece hoy mismo.
                </p>
              </div>
              <Link className="boton" href="/profesionales">
                Quiero ser voluntario/a
              </Link>
            </div>
          </Revela>
        </div>
      </section>

      <Pie />
    </>
  );
}
