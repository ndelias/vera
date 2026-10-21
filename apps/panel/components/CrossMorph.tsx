"use client";

import { useEffect, useRef } from "react";

// An icon drawn in cross-stitch cells, two tones: a light body and ink
// detail. When the icon changes, the old cells scatter outward and fade in
// a random order while the new ones land, so one object breaks apart into
// the next. Lime marks the cells an icon wants to stand out (the check).

export type CrossIcon = (g: OffscreenCanvasRenderingContext2D) => void;

const GRID = 30;
const MORPH_MS = 950;

// Icons are drawn on a 30x30 canvas: red = body, green = detail, blue = lime.
export const ICONS: Record<string, CrossIcon> = {
  map: (g) => {
    g.fillStyle = "#f00";
    g.beginPath();
    g.moveTo(3, 7);
    g.lineTo(10, 4);
    g.lineTo(19, 7);
    g.lineTo(27, 4);
    g.lineTo(27, 24);
    g.lineTo(19, 27);
    g.lineTo(10, 24);
    g.lineTo(3, 27);
    g.closePath();
    g.fill();
    g.strokeStyle = "#0f0";
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(6, 22);
    g.lineTo(11, 15);
    g.lineTo(17, 19);
    g.lineTo(22, 11);
    g.stroke();
    g.fillStyle = "#00f";
    g.beginPath();
    g.arc(22, 10, 3.2, 0, Math.PI * 2);
    g.fill();
  },
  brief: (g) => {
    g.fillStyle = "#f00";
    g.beginPath();
    g.moveTo(6, 2);
    g.lineTo(19, 2);
    g.lineTo(25, 8);
    g.lineTo(25, 28);
    g.lineTo(6, 28);
    g.closePath();
    g.fill();
    g.fillStyle = "#0f0";
    g.beginPath();
    g.moveTo(18, 2);
    g.lineTo(25, 9);
    g.lineTo(18, 9);
    g.closePath();
    g.fill();
    for (const [y, w] of [[13, 14], [17, 12], [21, 14], [25, 8]] as const) g.fillRect(9, y - 1, w, 2);
  },
  examine: (g) => {
    g.fillStyle = "#f00";
    g.beginPath();
    g.arc(12.5, 12.5, 9.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#0f0";
    g.lineWidth = 2.6;
    g.beginPath();
    g.arc(12.5, 12.5, 9.5, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4.5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(20, 20);
    g.lineTo(26.5, 26.5);
    g.stroke();
    g.fillStyle = "#0f0";
    g.font = "bold 13px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("?", 12.5, 13.5);
  },
  signoff: (g) => {
    g.fillStyle = "#f00";
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? 12 : 13.8;
      g.lineTo(15 + Math.cos(a) * r, 15 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = "#0f0";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(15, 15, 9.5, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#00f";
    g.lineWidth = 3.2;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(10, 15.5);
    g.lineTo(13.5, 19);
    g.lineTo(20.5, 11);
    g.stroke();
  },
};

// 0 empty, 1 body, 2 detail, 3 lime.
function rasterize(icon: CrossIcon): Uint8Array {
  const off = new OffscreenCanvas(GRID, GRID);
  const g = off.getContext("2d")!;
  icon(g);
  const data = g.getImageData(0, 0, GRID, GRID).data;
  const out = new Uint8Array(GRID * GRID);
  for (let i = 0; i < out.length; i++) {
    const [r, gr, b, a] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!];
    if (a < 110) continue;
    out[i] = b > 110 ? 3 : gr > 110 ? 2 : r > 0 ? 1 : 0;
  }
  return out;
}

export function CrossMorph({ icon, still, label }: { icon: string; still: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ cells: Uint8Array | null; raf: number }>({ cells: null, raf: 0 });

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    const draw = ICONS[icon];
    if (!c || !ctx || !draw) return;
    const size = c.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size * dpr)) {
      c.width = Math.round(size * dpr);
      c.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const tone = ["", css.getPropertyValue("--line-strong").trim() || "#d3d3cc", css.getPropertyValue("--ink").trim() || "#0b0b0b"];
    const lime = css.getPropertyValue("--lime").trim() || "#c9f23c";
    const cell = size / GRID;

    const cross = (cx: number, cy: number, kind: number, scale: number, alpha: number) => {
      if (kind === 0 || scale <= 0 || alpha <= 0) return;
      ctx.globalAlpha = alpha;
      const h = cell * 0.36 * scale;
      if (kind === 3) {
        ctx.fillStyle = lime;
        ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
      }
      ctx.strokeStyle = kind === 1 ? tone[1]! : tone[2]!;
      ctx.lineWidth = Math.max(1, cell * 0.24 * scale);
      ctx.beginPath();
      ctx.moveTo(cx - h, cy - h);
      ctx.lineTo(cx + h, cy + h);
      ctx.moveTo(cx + h, cy - h);
      ctx.lineTo(cx - h, cy + h);
      ctx.stroke();
    };

    const to = rasterize(draw);
    const from = state.current.cells;
    cancelAnimationFrame(state.current.raf);

    const paint = (cells: Uint8Array) => {
      ctx.clearRect(0, 0, size, size);
      ctx.lineCap = "round";
      for (let i = 0; i < cells.length; i++) cross(((i % GRID) + 0.5) * cell, (Math.floor(i / GRID) + 0.5) * cell, cells[i]!, 1, 1);
      ctx.globalAlpha = 1;
    };

    if (!from || still) {
      paint(to);
      state.current.cells = to;
      return;
    }

    const n = to.length;
    const outAt = Float32Array.from({ length: n }, () => Math.random() * 0.5);
    const inAt = Float32Array.from({ length: n }, () => 0.3 + Math.random() * 0.55);
    const swapAt = Float32Array.from({ length: n }, () => 0.2 + Math.random() * 0.5);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / MORPH_MS);
      ctx.clearRect(0, 0, size, size);
      ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const a = from[i]!;
        const b = to[i]!;
        const gx = i % GRID;
        const gy = Math.floor(i / GRID);
        let x = (gx + 0.5) * cell;
        let y = (gy + 0.5) * cell;
        if (a && b) {
          cross(x, y, t < swapAt[i]! ? a : b, 1, 1);
        } else if (a) {
          // Leaving: drift away from the centre, shrink and fade.
          const k = Math.min(1, Math.max(0, (t - outAt[i]!) / 0.25));
          if (k >= 1) continue;
          const dx = gx - GRID / 2;
          const dy = gy - GRID / 2;
          const len = Math.hypot(dx, dy) || 1;
          x += (dx / len) * k * cell * 2.2;
          y += (dy / len) * k * cell * 2.2;
          cross(x, y, a, 1 - k * 0.6, 1 - k);
        } else if (b) {
          const k = Math.min(1, Math.max(0, (t - inAt[i]!) / 0.15));
          cross(x, y, b, k, k);
        }
      }
      ctx.globalAlpha = 1;
      if (t < 1) state.current.raf = requestAnimationFrame(step);
      else paint(to);
    };
    state.current.raf = requestAnimationFrame(step);
    state.current.cells = to;
    return () => cancelAnimationFrame(state.current.raf);
  }, [icon, still]);

  return <canvas ref={canvas} className="cross-morph" role="img" aria-label={label} />;
}
