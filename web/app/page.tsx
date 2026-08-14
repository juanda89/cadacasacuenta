import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import MapaPublico, { type PuntoMapa } from "@/components/MapaPublico";
import { Simbolo, Wordmark } from "@/components/Logo";

export const revalidate = 60; // el mapa público se refresca cada minuto

const WA = `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "+573137821926").replace("+", "")}`;

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

export default async function Home() {
  const { puntos, familias, conDictamen, sinVivienda } = await datosPublicos();

  return (
    <>
      <header className="contenedor" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Simbolo size={30} />
          <Wordmark />
        </div>
        <nav style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <a href="#mapa" style={{ textDecoration: "none", fontWeight: 600 }}>Mapa</a>
          <Link href="/profesionales" style={{ textDecoration: "none", fontWeight: 600 }}>Soy ingeniero/a o arquitecto/a</Link>
        </nav>
      </header>

      {/* Hero: el diorama de papel del Atrato, animado */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <video autoPlay muted loop playsInline poster="/hero.jpg" style={{ width: "100%", height: "min(58vh, 470px)", objectFit: "cover" }}>
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(31,58,95,0) 30%, rgba(31,58,95,.78) 100%)" }} />
        <div className="contenedor" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 42, color: "#FBF7EF" }}>
          <h1 style={{ color: "#FBF7EF", fontSize: "clamp(2rem, 5.5vw, 3.4rem)", maxWidth: "16ch" }}>
            Ninguna familia sin contar.
          </h1>
          <p style={{ maxWidth: "52ch", marginTop: 10, fontSize: "1.05rem" }}>
            Tras el terremoto del Chocó no existe un censo de las familias afectadas.
            Este es el registro que se construye casa por casa, voz por voz — por WhatsApp.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a className="boton" href={WA} style={{ background: "#FBF7EF", color: "#1F3A5F" }}>
              Reportar por WhatsApp
            </a>
            <a className="boton secundario" href="#mapa" style={{ background: "rgba(251,247,239,.18)", color: "#FBF7EF" }}>
              Ver el mapa
            </a>
          </div>
        </div>
      </section>

      {/* Cifras vivas — el dato dictamina: tipografía limpia, fondo plano */}
      <section className="contenedor" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, padding: "28px 20px" }}>
        {[
          { n: familias, l: "familias registradas" },
          { n: puntos.length, l: "casos en el mapa" },
          { n: conDictamen, l: "con dictamen técnico" },
          { n: sinVivienda, l: "familias sin vivienda" },
        ].map((s) => (
          <div key={s.l} className="tarjeta" style={{ padding: "16px 20px", background: "var(--bruma)", border: "none" }}>
            <div style={{ fontWeight: 700, fontSize: "1.9rem", color: "var(--tinta)", fontVariantNumeric: "tabular-nums" }}>
              {s.n.toLocaleString("es-CO")}
            </div>
            <div style={{ fontSize: ".85rem", color: "#4A5568" }}>{s.l}</div>
          </div>
        ))}
      </section>

      {/* El mapa: lo que el país no podía ver */}
      <section id="mapa" className="contenedor" style={{ paddingBottom: 40 }}>
        <h2 style={{ fontSize: "1.6rem", marginBottom: 6 }}>El mapa que faltaba</h2>
        <p style={{ maxWidth: "62ch", color: "#4A5568", marginBottom: 16 }}>
          Cada marcador es un hogar. El punto lleva el color del dictamen de habitabilidad
          — <span className="chip ok">✓ Habitable</span> <span className="chip warn">▲ Uso restringido</span>{" "}
          <span className="chip bad">✕ No habitable</span> <span className="chip proceso">Reportado</span> —
          y la ubicación pública está redondeada (~110 m) para proteger a cada familia.
        </p>
        <MapaPublico puntos={puntos.filter((p) => p.lat != null)} />
      </section>

      {/* Cómo funciona */}
      <section style={{ background: "var(--bruma)", padding: "44px 0" }}>
        <div className="contenedor" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          {[
            { t: "1. La familia reporta", d: "Escribe o manda notas de voz al WhatsApp, como le quede más fácil. Con su autorización, el caso queda registrado con código único y evidencia." },
            { t: "2. Un profesional responde", d: "Ingenieros y arquitectos voluntarios toman los casos de su zona, visitan la vivienda y emiten el dictamen: el sello que dice si es segura." },
            { t: "3. El país lo ve", d: "Este mapa se dibuja en tiempo real. Las autoridades reciben cifras trazables caso por caso — el censo que faltaba." },
          ].map((p) => (
            <div key={p.t} className="tarjeta" style={{ padding: "22px 24px" }}>
              <h3 style={{ fontSize: "1.15rem", marginBottom: 8 }}>{p.t}</h3>
              <p style={{ fontSize: ".95rem", color: "#4A5568" }}>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="contenedor" style={{ padding: "30px 20px", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Simbolo size={22} />
          <span style={{ fontSize: ".85rem", color: "#6B655C" }}>
            Cada Casa Cuenta · Registro humanitario de vivienda y necesidades
          </span>
        </div>
        <span style={{ fontSize: ".8rem", color: "#6B655C", maxWidth: "46ch" }}>
          Los datos personales se tratan conforme a la Ley 1581 de 2012, con autorización
          verificable de cada familia. Número oficial de WhatsApp:{" "}
          <strong>{process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "+57 313 7821926"}</strong> — desconfíe de imitaciones.
        </span>
      </footer>
    </>
  );
}
