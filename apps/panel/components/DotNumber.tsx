"use client";

import { useEffect, useRef, useState } from "react";
import { useMotion, useOnScreen } from "@/lib/motion";

// A number in a 5x7 dot font, some dots square and some round. The first
// time it scrolls into view the dots fly in from scattered places and
// settle into the figure. Without JavaScript, or with motion off, the
// figure is simply there. Screen readers get the plain text.

const FONT: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "%": ["##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"],
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  "-": ["....", "....", "....", "####", "....", "....", "...."],
  ".": ["..", "..", "..", "..", "..", "##", "##"],
  ",": ["..", "..", "..", "..", "##", "##", ".#"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
};

const CELL = 10;
const GAP = 1; // empty columns between glyphs

type Dot = { x: number; y: number; round: boolean; dx: number; dy: number; delay: number };

function layout(text: string): { dots: Dot[]; width: number } {
  let seed = [...text].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const dots: Dot[] = [];
  let col = 0;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) continue;
    glyph.forEach((row, y) =>
      [...row].forEach((on, x) => {
        if (on !== "#") return;
        dots.push({
          x: col + x,
          y,
          round: rand() < 0.35,
          dx: (rand() - 0.5) * 16,
          dy: (rand() - 0.5) * 10,
          delay: rand() * 380,
        });
      }),
    );
    col += glyph[0]!.length + GAP;
  }
  return { dots, width: col - GAP };
}

export function DotNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motion = useMotion();
  const onScreen = useOnScreen(ref);
  // "idle" until JS decides; "scattered" waits off screen; "settled" is home.
  const [phase, setPhase] = useState<"idle" | "scattered" | "settled">("idle");
  const { dots, width } = layout(value);

  useEffect(() => {
    if (phase === "idle" && motion && onScreen === false) setPhase("scattered");
    if (phase === "scattered" && onScreen) {
      const id = requestAnimationFrame(() => setPhase("settled"));
      return () => cancelAnimationFrame(id);
    }
    if (!motion && phase === "scattered") setPhase("settled");
  }, [motion, onScreen, phase]);

  const s = CELL * 0.82;
  return (
    <span ref={ref} className="dot-number" data-phase={phase}>
      <svg
        viewBox={`0 0 ${width * CELL} ${7 * CELL}`}
        width={width * CELL}
        height={7 * CELL}
        preserveAspectRatio="xMinYMax meet"
        aria-hidden="true"
      >
        {dots.map((d, i) => {
          const scattered = phase === "scattered";
          const style = {
            transform: scattered ? `translate(${d.dx * CELL}px, ${d.dy * CELL}px)` : undefined,
            opacity: scattered ? 0 : undefined,
            transitionDelay: phase === "settled" ? `${d.delay}ms` : undefined,
          };
          const cx = d.x * CELL + CELL / 2;
          const cy = d.y * CELL + CELL / 2;
          return d.round ? (
            <circle key={i} cx={cx} cy={cy} r={s / 2} style={style} />
          ) : (
            <rect key={i} x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={1.5} style={style} />
          );
        })}
      </svg>
      <span className="sr-only">{value}</span>
    </span>
  );
}
