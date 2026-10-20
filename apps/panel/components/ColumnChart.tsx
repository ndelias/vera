"use client";

import { useState } from "react";

export type Series = { key: string; label: string };
export type Column = {
  key: string;
  label: string;
  /** Short axis label; falls back to label. */
  tick?: string;
  values: Record<string, number>;
  partial?: boolean;
};

const niceMax = (n: number) => {
  const step = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / step) * step;
};

const compact = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Columns over time, stacked by series in a fixed order (slot 1 at the
 * baseline). Each column is one hover/focus target; the tooltip lists every
 * series at that point.
 */
export function ColumnChart({
  columns,
  series,
  caption,
  everyNth = 3,
  unit = "",
}: {
  columns: Column[];
  series: Series[];
  caption: string;
  everyNth?: number;
  /** Appended to values in the tooltip and table, e.g. "%" or " h". */
  unit?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const totals = columns.map((c) => series.reduce((n, s) => n + (c.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [0, max / 2, max];
  const stacked = series.length > 1;

  return (
    <figure style={{ margin: 0 }}>
      {stacked ? (
        <ul className="legend" aria-label="Series">
          {series.map((s, i) => (
            <li key={s.key}>
              <span className="legend-key" style={{ background: `var(--s${i + 1})` }} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
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
                aria-label={`${c.label}: ${series.map((s) => `${s.label} ${fmt(c.values[s.key] ?? 0)}${unit}`).join(", ")}${c.partial ? " (partial month)" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <div className={`column-stack${c.partial ? " is-partial" : ""}`} style={{ height: `${(totals[i] / max) * 100}%` }}>
                  {series.map((s, si) =>
                    c.values[s.key] ? (
                      <div
                        key={s.key}
                        className="column-seg"
                        style={{ flexGrow: c.values[s.key], background: `var(--s${si + 1})` }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          {active !== null ? (
            <div
              className="tooltip"
              role="tooltip"
              style={{
                left: `${((active + 0.5) / columns.length) * 100}%`,
                top: `${100 - (totals[active] / max) * 100}%`,
              }}
            >
              <span className="tooltip-head">
                {columns[active].label}
                {columns[active].partial ? " · partial" : ""}
              </span>
              {series.map((s, si) => (
                <span key={s.key} className="tooltip-row">
                  {stacked ? <span className="tooltip-key" style={{ background: `var(--s${si + 1})` }} /> : null}
                  <strong>{fmt(columns[active].values[s.key] ?? 0)}{unit}</strong>
                  {stacked ? <span>{s.label}</span> : null}
                </span>
              ))}
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
            <thead>
              <tr>
                <th>Month</th>
                {series.map((s) => <th key={s.key} className="num">{s.label}</th>)}
                {stacked ? <th className="num">Total</th> : null}
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={c.key}>
                  <td>{c.label}{c.partial ? " (partial)" : ""}</td>
                  {series.map((s) => <td key={s.key} className="num">{fmt(c.values[s.key] ?? 0)}{unit}</td>)}
                  {stacked ? <td className="num">{fmt(totals[i])}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
