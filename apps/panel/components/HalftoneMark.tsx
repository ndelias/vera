"use client";

import { useEffect, useRef } from "react";
import { useMotion, useOnScreen } from "@/lib/motion";

// Vera's mark as a halftone: a grid of small dots inside the shape, and a
// light that runs back and forth along the strokes and through the square,
// swelling the dots it passes. Where swollen dots overlap they cancel out
// (xor), which draws the lens shapes between them. Still, the light rests
// on the left stroke.

const GRID = 30;
const SAMPLE = 4; // supersampling for the shape's coverage
// The light's path, in the mark's 48-unit box: down the left stroke,
// through the square, up the right stroke, and back.
const PATH: [number, number][] = [
  [9.5, 9],
  [19, 29],
  [24, 39],
  [29, 29],
  [38.5, 9],
];
const LOOP_MS = 5200;

function pointAt(k: number): [number, number] {
  const lens = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i]![0], p[1] - PATH[i]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = k * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) {
      const t = Math.min(1, d / lens[i]!);
      const a = PATH[i]!;
      const b = PATH[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    d -= lens[i]!;
  }
  return PATH[0]!;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function HalftoneMark({ label = "Vera's mark in dots" }: { label?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useMotion();
  const onScreen = useOnScreen(wrap);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const size = c.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const paper = css.getPropertyValue("--bg").trim() || "#f4f4f1";
    const lime = css.getPropertyValue("--lime").trim() || "#c9f23c";

    // Coverage of each cell by the strokes (1) and by the square (2).
    const n = GRID * SAMPLE;
    const off = new OffscreenCanvas(n, n);
    const g = off.getContext("2d")!;
    g.scale(n / 48, n / 48);
    g.lineCap = "round";
    g.lineWidth = 8;
    g.strokeStyle = "#f00";
    g.beginPath();
    g.moveTo(9.5, 9);
    g.lineTo(19, 29);
    g.moveTo(38.5, 9);
    g.lineTo(29, 29);
    g.stroke();
    g.fillStyle = "#0f0";
    g.beginPath();
    g.roundRect(19, 34, 10, 10, 2.6);
    g.fill();
    const px = g.getImageData(0, 0, n, n).data;
    const cover = new Float32Array(GRID * GRID);
    const square = new Uint8Array(GRID * GRID);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        const cell = Math.floor(y / SAMPLE) * GRID + Math.floor(x / SAMPLE);
        cover[cell]! += px[i + 3]! / 255 / (SAMPLE * SAMPLE);
        if (px[i + 1]! > 128) square[cell] = 1;
      }

    const step = size / GRID;
    const render = (k: number) => {
      const [lx, ly] = pointAt(k);
      const hx = (lx / 48) * GRID;
      const hy = (ly / 48) * GRID;
      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = "xor";
      for (let i = 0; i < cover.length; i++) {
        const cv = cover[i]!;
        if (cv < 0.25) continue;
        const x = i % GRID;
        const y = Math.floor(i / GRID);
        const d2 = (x + 0.5 - hx) ** 2 + (y + 0.5 - hy) ** 2;
        const glow = Math.exp(-d2 / (2 * 3.6 * 3.6));
        const r = step * (0.14 + 0.1 * cv + 0.62 * glow);
        ctx.fillStyle = square[i] ? lime : paper;
        ctx.beginPath();
        ctx.arc((x + 0.5) * step, (y + 0.5) * step, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    if (!motion || !onScreen) {
      render(0.2);
      return;
    }
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / 30) return;
      last = now;
      // Back and forth, easing at each end.
      const t = ((now - start) / LOOP_MS) % 2;
      render(ease(t < 1 ? t : 2 - t));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motion, onScreen]);

  return (
    <div ref={wrap} className="halftone-mark">
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
