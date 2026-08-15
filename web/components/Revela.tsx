"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Revela su contenido al entrar en el viewport (una sola vez).
 * `retraso` escalona hermanos: 0, 120, 240…
 */
export function Revela({
  children,
  retraso = 0,
  as: Tag = "div",
  style,
  className,
}: {
  children: ReactNode;
  retraso?: number;
  as?: "div" | "section" | "article" | "figure" | "li";
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={`revela ${className ?? ""}`} style={{ ...style, ["--retraso" as string]: `${retraso}ms` }}>
      {children}
    </Tag>
  );
}

/** Número que cuenta desde 0 al entrar en pantalla. */
export function Contador({ hasta, sufijo = "" }: { hasta: number; sufijo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = hasta.toLocaleString("es-CO") + sufijo;
      return;
    }
    const io = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const dur = 1400;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const suavizado = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(hasta * suavizado).toLocaleString("es-CO") + sufijo;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasta, sufijo]);

  return <span ref={ref}>0{sufijo}</span>;
}
