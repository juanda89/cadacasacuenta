export function Simbolo({ size = 28, color = "#1F3A5F", punto }: { size?: number; color?: string; punto?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="4,13 12,4 20,13" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16" r="3.2" fill={punto ?? color} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: "var(--tinta)" }}>
      Cada Casa <em style={{ fontWeight: 500 }}>Cuenta</em>
    </span>
  );
}
