"use client";

import { useEffect, useRef } from "react";
import { useMotion, useOnScreen } from "@/lib/motion";

// Vera's mark in 3D, turning slowly: the two strokes extruded, the lime
// square a cube. Ray-marched on a coarse grid; each cell is shaded with a
// 4x4 pattern, from solid ink in shadow through checker, grid and bars to
// bare paper in the light. Still, it rests at a three-quarter turn.

const CELLS = 26;
const SUB = 4; // pattern pixels per cell side
const PATTERNS = [
  "1111111111111111", // shadow
  "1111101111111011",
  "1010010110100101", // checker
  "1111100010001000", // grid
  "1000100010001000", // bars
  "0000000000000000", // light
].map((p) => [...p].map((c) => c === "1"));

type V3 = [number, number, number];

// The mark in its 48-unit box, centred and flipped so y points up.
const S = 1 / 18;
const pt = (x: number, y: number): [number, number] => [(x - 24) * S, -(y - 26.5) * S];
const STROKES: [[number, number], [number, number]][] = [
  [pt(9.5, 9), pt(19, 29)],
  [pt(38.5, 9), pt(29, 29)],
];
const R = 4 * S;
const DEPTH = 4 * S;
const CUBE_C = pt(24, 39);
const CUBE_B = 5 * S;
const CUBE_R = 1.3 * S;

function segment(px: number, py: number, a: [number, number], b: [number, number]) {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const h = Math.min(1, Math.max(0, ((px - a[0]) * bax + (py - a[1]) * bay) / (bax * bax + bay * bay)));
  return Math.hypot(px - a[0] - bax * h, py - a[1] - bay * h);
}

// Distance to the mark, and whether the nearest part is the cube.
function sdf(x: number, y: number, z: number): [number, boolean] {
  let d2 = Infinity;
  for (const [a, b] of STROKES) d2 = Math.min(d2, segment(x, y, a, b) - R);
  const wx = d2;
  const wy = Math.abs(z) - DEPTH;
  const strokes = Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0));
  const qx = Math.abs(x - CUBE_C[0]) - (CUBE_B - CUBE_R);
  const qy = Math.abs(y - CUBE_C[1]) - (CUBE_B - CUBE_R);
  const qz = Math.abs(z) - (CUBE_B - CUBE_R);
  const cube =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - CUBE_R;
  return cube < strokes ? [cube, true] : [strokes, false];
}

function rotate([x, y, z]: V3, ay: number, ax: number): V3 {
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

const LIGHT: V3 = (() => {
  const l: V3 = [-0.6, 0.45, -0.66];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

export function DitherMark({ label = "Vera's mark, turning" }: { label?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useMotion();
  const onScreen = useOnScreen(wrap);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#0b0b0b";
    const paper = css.getPropertyValue("--surface").trim() || "#ffffff";
    const lime = css.getPropertyValue("--lime").trim() || "#c9f23c";
    const size = c.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = size / CELLS;
    const sub = cell / SUB;

    const render = (t: number) => {
      // The object turns; the view stays put (orthographic, looking down +z).
      const ay = -0.6 + t * 0.0007;
      const ax = 0.3 + Math.sin(t * 0.0004) * 0.25;
      ctx.clearRect(0, 0, size, size);
      for (let j = 0; j < CELLS; j++) {
        for (let i = 0; i < CELLS; i++) {
          const x = ((i + 0.5) / CELLS - 0.5) * 2.5;
          const y = -((j + 0.5) / CELLS - 0.5) * 2.5;
          let z = -2;
          let hit = false;
          let cube = false;
          for (let k = 0; k < 48; k++) {
            const [d, isCube] = sdf(...rotate([x, y, z], ay, ax));
            if (d < 0.002) {
              hit = true;
              cube = isCube;
              break;
            }
            z += d;
            if (z > 2) break;
          }
          if (!hit) continue;
          // Normal by central differences, in object space, then back to view.
          const e = 0.01;
          const p = rotate([x, y, z], ay, ax);
          const n: V3 = [
            sdf(p[0] + e, p[1], p[2])[0] - sdf(p[0] - e, p[1], p[2])[0],
            sdf(p[0], p[1] + e, p[2])[0] - sdf(p[0], p[1] - e, p[2])[0],
            sdf(p[0], p[1], p[2] + e)[0] - sdf(p[0], p[1], p[2] - e)[0],
          ];
          const lightObj = rotate(LIGHT, ay, ax);
          const len = Math.hypot(...n) || 1;
          const lit = Math.max(0, (n[0] * lightObj[0] + n[1] * lightObj[1] + n[2] * lightObj[2]) / len);
          const level = Math.min(PATTERNS.length - 1, Math.floor(Math.pow(lit, 0.8) * PATTERNS.length * 0.999));
          const pattern = PATTERNS[level]!;
          const ox = i * cell;
          const oy = j * cell;
          ctx.fillStyle = cube ? lime : paper;
          ctx.fillRect(ox, oy, cell, cell);
          ctx.fillStyle = ink;
          for (let s = 0; s < 16; s++) if (pattern[s]) ctx.fillRect(ox + (s % SUB) * sub, oy + Math.floor(s / SUB) * sub, sub, sub);
        }
      }
    };

    // Rest pose when still: a three-quarter turn.
    if (!motion || !onScreen) {
      render(800);
      return;
    }
    let raf = 0;
    let last = 0;
    const start = performance.now() - 800;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / 24) return;
      last = now;
      render(now - start);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motion, onScreen]);

  return (
    <div ref={wrap} className="dither-mark">
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
