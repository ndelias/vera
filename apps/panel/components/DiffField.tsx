"use client";

import { useEffect, useRef, useState } from "react";

// The page background: a diff in pixels. Plus and minus signs fade in and
// out, mostly toward the edges so text stays readable. Short trains of
// pixels run along the rows and flip the signs they pass, like edits landing.
// Now and then one lights up lime: someone checked it.
// Reduced motion draws one still frame; the footer's Pause stops the loop.

const PIX = 4; // one pixel of the grid, in CSS px
const LATTICE = 7; // a sign every 7 pixels (28px)
const PLUS: [number, number][] = [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]];
const MINUS: [number, number][] = [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]];
const FADE_MS = 1200;
const STEP_MS = 55;
const FRAME_MS = 1000 / 30;

type Glyph = { col: number; row: number; plus: boolean; born: number; life: number; checked: number };
type Train = { row: number; x: number; dir: 1 | -1; len: number; step: number; max: number; last: number };

const MOTION_EVENT = "vera:motion";

function motionOff() {
  return document.documentElement.dataset.motion === "off";
}

export function DiffField() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cols = 0;
    let rows = 0;
    let glyphs = new Map<string, Glyph>();
    let trains: Train[] = [];
    let raf = 0;
    let lastFrame = 0;
    let colors = { sign: "#d3d3cc", train: "#c4c4bc", lime: "#c9f23c" };

    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      colors = {
        sign: css.getPropertyValue("--dot").trim() || colors.sign,
        train: css.getPropertyValue("--line-strong").trim() || colors.train,
        lime: css.getPropertyValue("--lime").trim() || colors.lime,
      };
    };

    // Phones have no margins to spare, so the signs there are fewer and fainter.
    const narrow = () => window.innerWidth < 768;
    const target = () => Math.round(cols * rows * (narrow() ? 0.03 : 0.07));

    // More signs toward the edges, fewer behind the text column.
    const spawn = (now: number, settled = false) => {
      for (let tries = 0; tries < 20; tries++) {
        const col = Math.floor(Math.random() * cols);
        const row = Math.floor(Math.random() * rows);
        const edge = Math.abs(col / Math.max(1, cols - 1) - 0.5) * 2;
        if (Math.random() > 0.15 + 0.85 * edge * edge) continue;
        const key = `${col},${row}`;
        if (glyphs.has(key)) continue;
        const life = 5000 + Math.random() * 7000;
        glyphs.set(key, { col, row, plus: Math.random() < 0.55, born: settled ? now - Math.random() * life * 0.6 : now, life, checked: 0 });
        return;
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / (PIX * LATTICE));
      rows = Math.ceil(h / (PIX * LATTICE));
      glyphs = new Map([...glyphs].filter(([, g]) => g.col < cols && g.row < rows));
      trains = trains.filter((t) => t.row < rows);
      const now = performance.now();
      while (glyphs.size < target()) spawn(now, true);
    };

    const alphaOf = (g: Glyph, now: number) => {
      if (reduced.matches) return 1;
      const age = now - g.born;
      if (age < FADE_MS) return age / FADE_MS;
      if (age > g.life - FADE_MS) return Math.max(0, (g.life - age) / FADE_MS);
      return 1;
    };

    const pixel = (px: number, py: number) => ctx.fillRect(px * PIX, py * PIX, PIX - 1, PIX - 1);

    const draw = (now: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const g of glyphs.values()) {
        const a = alphaOf(g, now);
        if (a <= 0) continue;
        const ox = g.col * LATTICE + 1;
        const oy = g.row * LATTICE + 1;
        const lit = g.checked > now;
        ctx.globalAlpha = a * (narrow() ? 0.55 : 1);
        ctx.fillStyle = lit ? colors.lime : colors.sign;
        for (const [x, y] of g.plus ? PLUS : MINUS) pixel(ox + x, oy + y);
      }
      for (const t of trains) {
        const y = t.row * LATTICE + 3;
        const fade = Math.min(1, (t.max - t.step) / 12);
        for (let i = 0; i < t.len; i++) {
          ctx.globalAlpha = fade * (1 - i / t.len) * 0.9;
          ctx.fillStyle = i === 0 ? colors.lime : colors.train;
          pixel(t.x - i * t.dir, y);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;

      for (const [key, g] of glyphs) if (now - g.born > g.life) glyphs.delete(key);
      while (glyphs.size < target()) spawn(now);

      if (trains.length < 3 && Math.random() < 0.02) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const span = cols * LATTICE;
        trains.push({
          row: Math.floor(Math.random() * rows),
          x: dir === 1 ? Math.floor(Math.random() * span * 0.3) : Math.floor(span - Math.random() * span * 0.3),
          dir,
          len: 6 + Math.floor(Math.random() * 6),
          step: 0,
          max: 50 + Math.floor(Math.random() * 60),
          last: now,
        });
      }
      for (const t of trains) {
        while (now - t.last >= STEP_MS && t.step < t.max) {
          t.last += STEP_MS;
          t.step++;
          t.x += t.dir;
          // Passing through a sign's centre flips it.
          const local = t.x - 1;
          if (local % LATTICE === 2) {
            const g = glyphs.get(`${Math.floor(local / LATTICE)},${t.row}`);
            if (g) g.plus = !g.plus;
          }
        }
      }
      trains = trains.filter((t) => t.step < t.max);

      if (Math.random() < 0.01) {
        const all = [...glyphs.values()];
        const g = all[Math.floor(Math.random() * all.length)];
        if (g) g.checked = now + 1600;
      }
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reduced.matches || motionOff()) draw(performance.now());
      else raf = requestAnimationFrame(tick);
    };

    readColors();
    resize();
    start();
    const onResize = () => {
      resize();
      if (reduced.matches || motionOff()) draw(performance.now());
    };
    window.addEventListener("resize", onResize);
    window.addEventListener(MOTION_EVENT, start);
    reduced.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(MOTION_EVENT, start);
      reduced.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvas} className="diff-field" aria-hidden="true" />;
}

/** Pauses the background (and remembers it, where storage works). */
export function MotionToggle() {
  const [off, setOff] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("vera:motion");
    } catch {}
    if (saved === "off") {
      document.documentElement.dataset.motion = "off";
      setOff(true);
      window.dispatchEvent(new Event(MOTION_EVENT));
    }
  }, []);

  const toggle = () => {
    const next = !off;
    setOff(next);
    if (next) document.documentElement.dataset.motion = "off";
    else delete document.documentElement.dataset.motion;
    try {
      window.localStorage.setItem("vera:motion", next ? "off" : "on");
    } catch {}
    window.dispatchEvent(new Event(MOTION_EVENT));
  };

  return (
    <button type="button" className="text-button" aria-pressed={off} onClick={toggle}>
      {off ? "Play background" : "Pause background"}
    </button>
  );
}
