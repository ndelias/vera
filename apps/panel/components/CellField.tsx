"use client";

import { useEffect, useRef } from "react";
import { MOTION_EVENT, motionAllowed } from "@/lib/motion";

// The page background: plain, with now and then a few small cells in the
// side margins that drift together into a tiny block, hold, and drift
// apart again. At most two at a time, never over the text column, none on
// phones. Reduced motion and Pause leave the background plain.

const CELL = 5; // px
const GAP = 2;
const SIZE = 3; // a block is 3x3 cells
const GATHER_MS = 1600;
const HOLD_MS = 2600;
const PART_MS = 1800;
const LIFE = GATHER_MS + HOLD_MS + PART_MS;
const FRAME_MS = 1000 / 30;
const MAX = 2;

type Cluster = {
  x: number; // block's top-left, CSS px
  y: number;
  born: number;
  // Per cell: where it starts, where it ends up after parting, lime or not.
  from: [number, number][];
  to: [number, number][];
  lime: number;
};

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

export function CellField() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let clusters: Cluster[] = [];
    let raf = 0;
    let last = 0;
    let nextAt = 0;
    let w = 0;
    let h = 0;
    let colors = { cell: "#d3d3cc", lime: "#c9f23c" };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(document.documentElement);
      colors = {
        cell: css.getPropertyValue("--line-strong").trim() || colors.cell,
        lime: css.getPropertyValue("--lime").trim() || colors.lime,
      };
    };

    // The margins beside the 1160px content column, if there's room.
    const spawn = (now: number) => {
      const margin = (w - 1160) / 2;
      if (margin < 60) return;
      const block = SIZE * (CELL + GAP);
      const left = Math.random() < 0.5;
      const x = left ? 16 + Math.random() * (margin - block - 32) : w - margin + 16 + Math.random() * (margin - block - 32);
      const y = 90 + Math.random() * (h - 180);
      if (clusters.some((k) => Math.abs(k.y - y) < 120 && Math.abs(k.x - x) < 120)) return;
      const n = SIZE * SIZE;
      const scatter = () => {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 50;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
      };
      clusters.push({
        x,
        y,
        born: now,
        from: Array.from({ length: n }, scatter),
        to: Array.from({ length: n }, scatter),
        lime: Math.random() < 0.6 ? Math.floor(Math.random() * n) : -1,
      });
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const k of clusters) {
        const age = now - k.born;
        for (let i = 0; i < k.from.length; i++) {
          const gx = k.x + (i % SIZE) * (CELL + GAP);
          const gy = k.y + Math.floor(i / SIZE) * (CELL + GAP);
          let ox = 0;
          let oy = 0;
          let alpha = 1;
          if (age < GATHER_MS) {
            const t = ease(age / GATHER_MS);
            ox = k.from[i]![0] * (1 - t);
            oy = k.from[i]![1] * (1 - t);
            alpha = t;
          } else if (age > GATHER_MS + HOLD_MS) {
            const t = easeIn(Math.min(1, (age - GATHER_MS - HOLD_MS) / PART_MS));
            ox = k.to[i]![0] * t;
            oy = k.to[i]![1] * t;
            alpha = 1 - t;
          }
          ctx.globalAlpha = alpha;
          ctx.fillStyle = i === k.lime ? colors.lime : colors.cell;
          ctx.fillRect(gx + ox, gy + oy, CELL, CELL);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      clusters = clusters.filter((k) => now - k.born < LIFE);
      if (clusters.length < MAX && now >= nextAt) {
        spawn(now);
        nextAt = now + 1800 + Math.random() * 2600;
      }
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (motionAllowed()) raf = requestAnimationFrame(tick);
      else {
        clusters = [];
        ctx.clearRect(0, 0, w, h);
      }
    };

    resize();
    start();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("resize", resize);
    window.addEventListener(MOTION_EVENT, start);
    reduced.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener(MOTION_EVENT, start);
      reduced.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvas} className="cell-field" aria-hidden="true" />;
}
