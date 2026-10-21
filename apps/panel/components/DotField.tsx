"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// One dot per coded post. The dots drift in and settle into a grid in a fixed
// shuffled order, then sort themselves by category and back, every few
// seconds. Calm easing, about 1.4s per move. Reduced motion shows the grid
// with no movement; Pause stops the auto-advance.

type Counts = { firstHand: number; discussed: number; other: number };
type Layout = "mixed" | "sorted";

const COLS = 50;
const MOVE_MS = 1400;
const HOLD_MS = 4200;
const STAGGER_MS = 500;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function DotField({ counts, label }: { counts: Counts; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout>("mixed");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [started, setStarted] = useState(false);

  // Static data: category per dot, and its slot in each layout.
  const model = useRef<{
    cat: Uint8Array;
    slot: Record<Layout, Uint16Array>;
    x: Float32Array;
    y: Float32Array;
    fromX: Float32Array;
    fromY: Float32Array;
    alpha: Float32Array;
  } | null>(null);
  const anim = useRef<{ start: number; raf: number; intro: boolean } | null>(null);
  const size = useRef({ w: 0, cell: 0, rows: 0 });

  if (!model.current) {
    const n = counts.firstHand + counts.discussed + counts.other;
    const cat = new Uint8Array(n);
    for (let i = 0; i < n; i++) cat[i] = i < counts.firstHand ? 0 : i < counts.firstHand + counts.discussed ? 1 : 2;
    const order = Array.from({ length: n }, (_, i) => i);
    const rand = seeded(20261021);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const mixed = new Uint16Array(n);
    order.forEach((dot, slotIndex) => (mixed[dot] = slotIndex));
    const sorted = new Uint16Array(n);
    for (let i = 0; i < n; i++) sorted[i] = i; // dots are already grouped by category
    model.current = {
      cat,
      slot: { mixed, sorted },
      x: new Float32Array(n),
      y: new Float32Array(n),
      fromX: new Float32Array(n),
      fromY: new Float32Array(n),
      alpha: new Float32Array(n).fill(1),
    };
  }

  const colors = useRef(["#c9f23c", "#0b0b0b", "#d3d3cc"]);
  const layoutRef = useRef<Layout>("mixed");
  layoutRef.current = layout;

  const readColors = useCallback(() => {
    const css = getComputedStyle(document.documentElement);
    colors.current = [
      css.getPropertyValue("--lime").trim() || "#c9f23c",
      css.getPropertyValue("--ink").trim() || "#0b0b0b",
      css.getPropertyValue("--dot").trim() || "#d3d3cc",
    ];
  }, []);

  const target = useCallback((slot: number) => {
    const { cell } = size.current;
    return [(slot % COLS) * cell, Math.floor(slot / COLS) * cell] as const;
  }, []);

  const draw = useCallback(() => {
    const c = canvas.current;
    const m = model.current;
    if (!c || !m) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { cell } = size.current;
    const dot = Math.max(2, cell * 0.74);
    const r = Math.min(2.5, dot / 3);
    ctx.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < m.cat.length; i++) {
      ctx.globalAlpha = m.alpha[i]!;
      ctx.fillStyle = colors.current[m.cat[i]!]!;
      ctx.beginPath();
      ctx.roundRect(m.x[i]!, m.y[i]!, dot, dot, r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, []);

  const place = useCallback(
    (to: Layout) => {
      const m = model.current!;
      for (let i = 0; i < m.cat.length; i++) {
        const [tx, ty] = target(m.slot[to][i]!);
        m.x[i] = tx;
        m.y[i] = ty;
        m.alpha[i] = 1;
      }
      draw();
    },
    [draw, target],
  );

  const moveTo = useCallback(
    (to: Layout, intro = false) => {
      const m = model.current!;
      if (anim.current) cancelAnimationFrame(anim.current.raf);
      const { w } = size.current;
      const height = size.current.rows * size.current.cell;
      const rand = seeded(7);
      for (let i = 0; i < m.cat.length; i++) {
        if (intro) {
          m.fromX[i] = rand() * w;
          m.fromY[i] = rand() * height;
          m.alpha[i] = 0;
        } else {
          m.fromX[i] = m.x[i]!;
          m.fromY[i] = m.y[i]!;
        }
      }
      const start = performance.now();
      const step = (now: number) => {
        let running = false;
        for (let i = 0; i < m.cat.length; i++) {
          const slot = m.slot[to][i]!;
          const [tx, ty] = target(slot);
          const delay = (((slot % COLS) + Math.floor(slot / COLS)) / (COLS + size.current.rows)) * STAGGER_MS;
          const t = Math.min(1, Math.max(0, (now - start - delay) / MOVE_MS));
          if (t < 1) running = true;
          const e = ease(t);
          m.x[i] = m.fromX[i]! + (tx - m.fromX[i]!) * e;
          m.y[i] = m.fromY[i]! + (ty - m.fromY[i]!) * e;
          if (intro) m.alpha[i] = e;
        }
        draw();
        if (running) anim.current = { start, raf: requestAnimationFrame(step), intro };
        else anim.current = null;
      };
      anim.current = { start, raf: requestAnimationFrame(step), intro };
    },
    [draw, target],
  );

  // Size the canvas to its box (and to the screen's pixel density).
  const resize = useCallback(() => {
    const c = canvas.current;
    const box = wrap.current;
    const m = model.current;
    if (!c || !box || !m) return;
    const w = box.clientWidth;
    const cell = w / COLS;
    const rows = Math.ceil(m.cat.length / COLS);
    size.current = { w, cell, rows };
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(rows * cell * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${rows * cell}px`;
    c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    setReduced(mq.matches);
    readColors();
    resize();
    place("mixed");
    if (!mq.matches) {
      model.current!.alpha.fill(0);
      draw();
    }
    const onScheme = () => {
      readColors();
      draw();
    };
    const onMotion = () => setReduced(mq.matches);
    const ro = new ResizeObserver(() => {
      resize();
      place(layoutRef.current);
    });
    if (wrap.current) ro.observe(wrap.current);
    scheme.addEventListener("change", onScheme);
    mq.addEventListener("change", onMotion);
    return () => {
      ro.disconnect();
      scheme.removeEventListener("change", onScheme);
      mq.removeEventListener("change", onMotion);
      if (anim.current) cancelAnimationFrame(anim.current.raf);
    };
  }, [draw, place, readColors, resize]);

  // Intro: drift in the first time the field scrolls into view.
  useEffect(() => {
    if (reduced || started || !wrap.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          moveTo("mixed", true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [moveTo, reduced, started]);

  // Auto-advance between mixed and sorted.
  useEffect(() => {
    if (reduced || paused || !started) return;
    const id = window.setInterval(() => {
      setLayout((l) => (l === "mixed" ? "sorted" : "mixed"));
    }, MOVE_MS + HOLD_MS);
    return () => window.clearInterval(id);
  }, [paused, reduced, started]);

  // Move whenever the layout changes (instantly with reduced motion).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) place(layout);
    else moveTo(layout);
  }, [layout, moveTo, place, reduced]);

  return (
    <figure className="dotfield">
      <div ref={wrap} className="dotfield-canvas">
        <canvas ref={canvas} role="img" aria-label={label} />
      </div>
      <figcaption className="dotfield-controls">
        <div className="segmented" role="group" aria-label="Arrange dots">
          <button type="button" aria-pressed={layout === "mixed"} onClick={() => setLayout("mixed")}>
            As sampled
          </button>
          <button type="button" aria-pressed={layout === "sorted"} onClick={() => setLayout("sorted")}>
            Sorted
          </button>
        </div>
        {!reduced ? (
          <button type="button" className="text-button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? "Play" : "Pause"}
          </button>
        ) : null}
      </figcaption>
    </figure>
  );
}
