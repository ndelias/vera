"use client";

import { useEffect, useRef, useState } from "react";

// The page background, in characters, the way the portrait on Nahuel's About
// page is drawn: a sparse grid of dots, and patches of code that scramble
// through noise and settle, cell by cell, roughly top to bottom with
// scatter. Each patch is a few diff lines, a + or - and then a run from the
// same ramp of characters. It holds, scrambles back out to the dots, and a
// new one lands somewhere else, mostly toward the edges so text stays clear.
// Reduced motion draws one still frame; the footer's Pause stops the loop.

const RAMP = ".:-=+*xzYX%#"; // as in the portrait, light to dense
const NOISE = "zyx*?=+:/|%#ZYX";
const DOT = "·";
const CW = 12; // cell, CSS px
const CH = 16;
const FONT_PX = 12;
const IN_MS = 1100;
const OUT_MS = 900;
const SCRAMBLE = 0.25; // how long before its moment a cell starts scrambling
const FRAME_MS = 1000 / 30;

type Patch = {
  col: number;
  row: number;
  w: number;
  h: number;
  cells: string[];
  settle: Float32Array;
  born: number;
  hold: number;
};

const MOTION_EVENT = "vera:motion";
const motionOff = () => document.documentElement.dataset.motion === "off";

export function CodeField() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cols = 0;
    let rows = 0;
    let w = 0;
    let h = 0;
    let patches: Patch[] = [];
    let raf = 0;
    let lastFrame = 0;
    let dots: HTMLCanvasElement | null = null;
    let ink = "#0b0b0b";
    let muted = "#5c5c57";
    const narrow = () => window.innerWidth < 768;
    const font = () => `${FONT_PX}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono") || "monospace"}`;

    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      ink = css.getPropertyValue("--ink").trim() || ink;
      muted = css.getPropertyValue("--muted").trim() || muted;
    };

    // The dot grid, painted once per size: every other cell, every other row.
    const paintDots = () => {
      const dpr = window.devicePixelRatio || 1;
      dots = document.createElement("canvas");
      dots.width = c.width;
      dots.height = c.height;
      const d = dots.getContext("2d")!;
      d.setTransform(dpr, 0, 0, dpr, 0, 0);
      d.font = font();
      d.textAlign = "center";
      d.textBaseline = "middle";
      d.fillStyle = muted;
      d.globalAlpha = narrow() ? 0.18 : 0.28;
      for (let y = 0; y < rows; y += 2) for (let x = 0; x < cols; x += 2) d.fillText(DOT, (x + 0.5) * CW, (y + 0.5) * CH);
    };

    const makePatch = (now: number, settled = false): Patch | null => {
      for (let tries = 0; tries < 30; tries++) {
        const pw = 6 + Math.floor(Math.random() * 10);
        const ph = 2 + Math.floor(Math.random() * 4);
        const col = Math.floor(Math.random() * Math.max(1, cols - pw));
        const row = Math.floor(Math.random() * Math.max(1, rows - ph));
        // Never in the header; on wide screens, never over the middle half
        // (where headlines and text sit), and likelier the nearer the edge.
        if (row * CH < 72) continue;
        const left = col / cols;
        const right = (col + pw) / cols;
        if (!narrow() && right > 0.25 && left < 0.75) continue;
        const edge = Math.abs((col + pw / 2) / cols - 0.5) * 2;
        if (Math.random() > (narrow() ? 0.5 : edge * edge * edge)) continue;
        const clash = patches.some(
          (p) => col < p.col + p.w + 2 && col + pw + 2 > p.col && row < p.row + p.h + 1 && row + ph + 1 > p.row,
        );
        if (clash) continue;
        // Diff lines: a sign, a space, then a run of characters from the ramp.
        const cells: string[] = [];
        for (let y = 0; y < ph; y++) {
          const len = 3 + Math.floor(Math.random() * (pw - 2));
          const sign = Math.random() < 0.5 ? "+" : "-";
          const base = Math.random();
          for (let x = 0; x < pw; x++) {
            if (x === 0) cells.push(sign);
            else if (x === 1 || x > len) cells.push(" ");
            else {
              const v = Math.min(0.999, Math.max(0, base * 0.6 + Math.random() * 0.5));
              cells.push(RAMP[Math.floor(v * RAMP.length)]!);
            }
          }
        }
        const settle = new Float32Array(pw * ph);
        for (let i = 0; i < settle.length; i++) settle[i] = Math.min(0.98, (Math.floor(i / pw) / ph) * 0.6 + Math.random() * 0.4);
        const hold = 3500 + Math.random() * 4000;
        return { col, row, w: pw, h: ph, cells, settle, born: settled ? now - IN_MS - Math.random() * hold : now, hold };
      }
      return null;
    };

    const target = () => {
      if (narrow()) return 2;
      return Math.max(3, Math.round((cols * rows) / 700));
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CW);
      rows = Math.ceil(h / CH);
      patches = patches.filter((p) => p.col + p.w <= cols && p.row + p.h <= rows);
      paintDots();
      const now = performance.now();
      for (let i = 0; patches.length < target() && i < 20; i++) {
        const p = makePatch(now, true);
        if (p) patches.push(p);
      }
    };

    const noise = () => NOISE[(Math.random() * NOISE.length) | 0]!;

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      if (dots) ctx.drawImage(dots, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const still = reduced.matches || motionOff();
      const fade = narrow() ? 0.6 : 1;
      for (const p of patches) {
        const age = now - p.born;
        const kIn = still ? 1 : age / IN_MS;
        const kOut = still ? 0 : (age - IN_MS - p.hold) / OUT_MS;
        for (let i = 0; i < p.cells.length; i++) {
          const s = p.settle[i]!;
          let ch = "";
          let settled = false;
          if (kOut > 0) {
            // Out: bottom rows first, each scrambling before it goes.
            const o = 1 - s;
            if (kOut < o - SCRAMBLE) {
              ch = p.cells[i]!;
              settled = true;
            } else if (kOut < o) ch = noise();
          } else if (kIn >= s) {
            ch = p.cells[i]!;
            settled = true;
          } else if (kIn > s - SCRAMBLE) ch = noise();
          if (!ch) continue;
          const x = p.col + (i % p.w);
          const y = p.row + Math.floor(i / p.w);
          ctx.clearRect(x * CW, y * CH, CW, CH);
          if (ch === " ") continue;
          ctx.globalAlpha = (settled ? 0.42 : 0.3) * fade;
          ctx.fillStyle = settled ? ink : muted;
          ctx.fillText(ch, (x + 0.5) * CW, (y + 0.5) * CH);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      patches = patches.filter((p) => now - p.born < IN_MS + p.hold + OUT_MS);
      if (patches.length < target() && Math.random() < 0.05) {
        const p = makePatch(now);
        if (p) patches.push(p);
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
    // The mono face may arrive after the first paint; redraw with it.
    document.fonts.ready.then(() => {
      paintDots();
      draw(performance.now());
    });
    const onResize = () => {
      resize();
      draw(performance.now());
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

  return <canvas ref={canvas} className="code-field" aria-hidden="true" />;
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
