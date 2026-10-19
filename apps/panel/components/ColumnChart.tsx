"use client";

import { useState } from "react";

export type Column = {
  key: string;
  label: string;
  /** Short axis label; falls back to label. */
  tick?: string;
  value: number;
  partial?: boolean;
};

const niceMax = (n: number) => {
  const step = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / step) * step;
};

const compact = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

/** Columns over time, one series. Each column is its own hover/focus target. */
export function ColumnChart({ columns, caption, everyNth = 3 }: { columns: Column[]; caption: string; everyNth?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...columns.map((c) => c.value)));
  const ticks = [0, max / 2, max];

  return (
    <figure style={{ margin: 0 }}>
      <div className="columns">
        <div className="columns-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>{compact(t)}</span>
          ))}
        </div>
        <div className="columns-plot">
          {ticks.slice(1).map((t) => (
            <div key={t} className="columns-grid" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="columns-bars" role="list" aria-label={caption}>
            {columns.map((c, i) => (
              <div
                key={c.key}
                className="column"
                role="listitem"
                tabIndex={0}
                aria-label={`${c.label}: ${c.value.toLocaleString("en-US")}${c.partial ? " (partial month)" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div
                  className={`column-fill${c.partial ? " is-partial" : ""}`}
                  style={{ height: `${(c.value / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          {active !== null ? (
            <div
              className="tooltip"
              role="tooltip"
              style={{
                left: `${((active + 0.5) / columns.length) * 100}%`,
                top: `${100 - (columns[active].value / max) * 100}%`,
              }}
            >
              <strong>{columns[active].value.toLocaleString("en-US")}</strong>
              {columns[active].label}
              {columns[active].partial ? " · partial" : ""}
            </div>
          ) : null}
        </div>
        <div className="columns-x" aria-hidden="true">
          {columns.map((c, i) =>
            i % everyNth === 0 ? (
              <span
                key={c.key}
                className={i % (everyNth * 2) === 0 ? undefined : "is-minor"}
                style={{ left: `${((i + 0.5) / columns.length) * 100}%` }}
              >
                {c.tick ?? c.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <details className="table-view">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <caption className="muted" style={{ textAlign: "left", paddingBottom: 8 }}>{caption}</caption>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key}>
                  <td>{c.label}{c.partial ? " (partial)" : ""}</td>
                  <td className="num">{c.value.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
