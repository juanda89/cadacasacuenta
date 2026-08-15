import { Simbolo } from "./Logo";

export function Pie() {
  return (
    <footer style={{ background: "var(--tinta)", color: "var(--papel)", position: "relative", zIndex: 2 }}>
      <div
        className="contenedor"
        style={{ padding: "44px 24px 36px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Simbolo size={26} color="#FBF7EF" punto="#4A7BA6" />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 600 }}>
              Cada Casa <em style={{ fontWeight: 500 }}>Cuenta</em>
            </span>
          </div>
          <p style={{ fontSize: ".9rem", opacity: 0.78, maxWidth: "34ch" }}>
            Registro humanitario de vivienda y necesidades. Terremoto del Chocó, 2026.
          </p>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", marginTop: 14, fontSize: "1.05rem" }}>
            Ninguna familia sin contar.
          </p>
        </div>
        <div style={{ fontSize: ".85rem", opacity: 0.78, lineHeight: 1.7 }}>
          <div className="etiqueta" style={{ color: "rgba(251,247,239,.55)", marginBottom: 8 }}>
            Número oficial de WhatsApp
          </div>
          <strong style={{ fontSize: "1.05rem", letterSpacing: ".04em", opacity: 1 }}>
            {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "+57 313 7821926"}
          </strong>
          <p style={{ marginTop: 6 }}>Es el único número del registro — desconfíe de imitaciones.</p>
        </div>
        <div style={{ fontSize: ".8rem", opacity: 0.66, lineHeight: 1.7 }}>
          <div className="etiqueta" style={{ color: "rgba(251,247,239,.55)", marginBottom: 8 }}>
            Sus datos
          </div>
          Los datos personales se tratan conforme a la Ley 1581 de 2012, con autorización verificable de cada
          familia. El mapa público solo muestra ubicaciones redondeadas (~110 m) y jamás nombres ni teléfonos.
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(251,247,239,.14)" }}>
        <div
          className="contenedor"
          style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: ".75rem", opacity: 0.6 }}
        >
          <span>Hecho con cuidado para las familias del Chocó.</span>
          <span style={{ fontStyle: "italic" }}>Lo que no se cuenta, no se atiende.</span>
        </div>
      </div>
    </footer>
  );
}
