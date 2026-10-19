"use client";

import { useState } from "react";

export type Bar = {
  label: string;
  value: number;
  /** Shown at the bar tip instead of the raw value. */
  display?: string;
  /** Extra line in the tooltip. */
  detail?: string;
  variant?: "estimate" | "muted";
  href?: string;
};

/** Horizontal bars, one series. Each row is its own hover/focus target. */
export function BarChart({ bars, caption }: { bars: Bar[]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <figure style={{ margin: 0 }}>
      <div className="bars" role="list" aria-label={caption}>
        {bars.map((b, i) => {
          const width = `${(b.value / max) * 100}%`;
          const row = (
            <>
              <span className="bar-label">{b.label}</span>
              <span className="bar-track">
                <span
                  className={`bar-fill${b.variant ? ` is-${b.variant}` : ""}`}
                  style={b.value === 0 ? { width: 0, minWidth: 0 } : { width }}
                />
                <span className="bar-value">{b.display ?? b.value.toLocaleString("en-US")}</span>
              </span>
              {active === i && b.detail ? (
                <span className="tooltip" role="tooltip" style={{ left: "50%", top: 0 }}>
                  <strong>{b.display ?? b.value.toLocaleString("en-US")}</strong>
                  {b.detail}
                </span>
              ) : null}
            </>
          );
          const handlers = {
            onPointerEnter: () => setActive(i),
            onPointerLeave: () => setActive(null),
            onFocus: () => setActive(i),
            onBlur: () => setActive(null),
          };
          return b.href ? (
            <a key={b.label} href={b.href} className="bar-row" role="listitem" style={{ position: "relative", color: "inherit" }} {...handlers}>
              {row}
            </a>
          ) : (
            <div key={b.label} className="bar-row" role="listitem" tabIndex={0} style={{ position: "relative" }} {...handlers}>
              {row}
            </div>
          );
        })}
      </div>
      <details className="table-view">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <caption className="muted" style={{ textAlign: "left", paddingBottom: 8 }}>{caption}</caption>
            <tbody>
              {bars.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td className="num">{b.display ?? b.value.toLocaleString("en-US")}</td>
                  <td className="muted">{b.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
