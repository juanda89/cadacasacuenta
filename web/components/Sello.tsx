const CONF = {
  habitable: { color: "#2E7D32", palabra: "HABITABLE" },
  uso_restringido: { color: "#B97F0F", palabra: "USO RESTRINGIDO" },
  no_habitable: { color: "#C62828", palabra: "NO HABITABLE" },
} as const;

export type Dictamen = keyof typeof CONF;

/** El sello de dictamen: color + palabra + forma + fecha. El mismo artefacto
 *  en la página de caso, el dashboard y el PDF. Nunca color solo. */
export function Sello({ dictamen, fecha, size = 130 }: { dictamen: Dictamen; fecha?: string | null; size?: number }) {
  const c = CONF[dictamen];
  if (!c) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label={`Dictamen: ${c.palabra}`} style={{ transform: "rotate(-3deg)" }}>
      <circle cx="64" cy="64" r="60" fill="none" stroke={c.color} strokeWidth="3.5" strokeDasharray="1.5 2.6" />
      <circle cx="64" cy="64" r="49" fill="none" stroke={c.color} strokeWidth="1.6" />
      {dictamen === "habitable" && (
        <path d="M50 60 L60 70 L79 48" fill="none" stroke={c.color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {dictamen === "uso_restringido" && (
        <path d="M64 40 L82 68 H46 Z" fill="none" stroke={c.color} strokeWidth="5" strokeLinejoin="round" />
      )}
      {dictamen === "no_habitable" && (
        <path d="M50 46 L78 74 M78 46 L50 74" fill="none" stroke={c.color} strokeWidth="6" strokeLinecap="round" />
      )}
      <text x="64" y="92" textAnchor="middle" fill={c.color} fontFamily="var(--font-texto), sans-serif" fontWeight="700" fontSize={dictamen === "uso_restringido" ? 9 : 11} letterSpacing="1.4">
        {c.palabra}
      </text>
      {fecha && (
        <text x="64" y="105" textAnchor="middle" fill={c.color} fontFamily="var(--font-texto), sans-serif" fontSize="7.5">
          {new Date(fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
        </text>
      )}
    </svg>
  );
}
