"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Arrow } from "./Arrow";
import { useMotion } from "@/lib/motion";

// One quote at a time. Between quotes the text breaks into pixel cells that
// cover it, the quote changes underneath, and the cells clear in a new
// order. All quotes sit stacked in one grid cell, so the box is as tall as
// the longest and nothing below it moves. Reduced motion swaps instantly.

export type RotatorQuote = { id: string; text: string; pain: string; who: string; href: string };

const HOLD_MS = 7000;
const HALF_MS = 650;
const CELL = 14;

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function QuoteRotator({ quotes }: { quotes: RotatorQuote[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const motion = useMotion();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Cover the quote with cells, swap it, uncover.
  const go = useCallback(
    (next: number) => {
      const n = quotes.length;
      const to = ((next % n) + n) % n;
      const c = canvas.current;
      const b = box.current;
      const ctx = c?.getContext("2d");
      if (reduced || !c || !b || !ctx) {
        setIndex(to);
        return;
      }
      if (busy.current) return;
      busy.current = true;
      const w = b.clientWidth;
      const h = b.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(w / CELL);
      const rows = Math.ceil(h / CELL);
      const total = cols * rows;
      const css = getComputedStyle(document.documentElement);
      const bg = css.getPropertyValue("--bg").trim() || "#f4f4f1";
      const dot = css.getPropertyValue("--dot").trim() || "#d3d3cc";
      const lime = css.getPropertyValue("--lime").trim() || "#c9f23c";
      const lit = new Set(shuffled(total).slice(0, Math.round(total * 0.04)));
      const cover = shuffled(total);
      const clear = shuffled(total);
      const rank = new Int32Array(total);
      clear.forEach((cell, i) => (rank[cell] = i));
      const start = performance.now();
      let swapped = false;

      const cellAt = (i: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect((i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL);
        ctx.fillStyle = lit.has(i) ? lime : dot;
        ctx.beginPath();
        ctx.roundRect((i % cols) * CELL + 2, Math.floor(i / cols) * CELL + 2, CELL - 4, CELL - 4, 2);
        ctx.fill();
      };

      const step = (now: number) => {
        const t = now - start;
        ctx.clearRect(0, 0, w, h);
        if (t < HALF_MS) {
          const shown = Math.floor((t / HALF_MS) * total);
          for (let k = 0; k < shown; k++) cellAt(cover[k]!, bg);
        } else {
          if (!swapped) {
            swapped = true;
            setIndex(to);
          }
          const gone = Math.floor(((t - HALF_MS) / HALF_MS) * total);
          for (let i = 0; i < total; i++) if (rank[i]! >= gone) cellAt(i, bg);
        }
        if (t < HALF_MS * 2) requestAnimationFrame(step);
        else {
          ctx.clearRect(0, 0, w, h);
          busy.current = false;
        }
      };
      requestAnimationFrame(step);
    },
    [quotes.length, reduced],
  );

  useEffect(() => {
    if (paused || !motion) return;
    const id = window.setTimeout(() => go(index + 1), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [go, index, motion, paused]);

  return (
    <section className="rotator" aria-roledescription="carousel" aria-label="What people said">
      <div className="rotator-stage" ref={box} aria-live={paused ? "polite" : "off"}>
        {quotes.map((x, i) => (
          <figure key={x.id} className="rotator-quote" aria-hidden={i !== index} data-active={i === index || undefined}>
            <p className="rotator-pain">{x.pain}</p>
            <blockquote>&ldquo;{x.text}&rdquo;</blockquote>
            <figcaption>
              {x.who} · <Link href={x.href} tabIndex={i === index ? undefined : -1}>in context</Link>
            </figcaption>
          </figure>
        ))}
        <canvas ref={canvas} className="rotator-cells" aria-hidden="true" />
      </div>
      <div className="rotator-controls">
        <button type="button" className="rotator-button" onClick={() => go(index - 1)} aria-label="Previous quote">
          <Arrow dir="left" />
        </button>
        <ol className="rotator-dots" aria-label={`Quote ${index + 1} of ${quotes.length}`}>
          {quotes.map((x, i) => (
            <li key={x.id}>
              <button
                type="button"
                aria-label={`Quote ${i + 1}`}
                aria-current={i === index || undefined}
                onClick={() => i !== index && go(i)}
              />
            </li>
          ))}
        </ol>
        <button type="button" className="rotator-button" onClick={() => go(index + 1)} aria-label="Next quote">
          <Arrow />
        </button>
        <button type="button" className="text-button" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
    </section>
  );
}
