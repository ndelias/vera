"use client";

import { useEffect, useState } from "react";
import { useMotion } from "@/lib/motion";

// The home headline. A lime block sits behind one line at a time and moves
// down the three, the way Vera works through a change: understood, signed
// off, shipped. It wipes in left to right in steps, like the dot matrix.
// Still (reduced motion, Pause), it rests on the first line.

const LINES = ["Understood.", "Signed off.", "Shipped."];
const HOLD_MS = 2600;

export function HeroTitle() {
  const motion = useMotion();
  const [lit, setLit] = useState(0);

  useEffect(() => {
    if (!motion) {
      setLit(0);
      return;
    }
    const id = window.setInterval(() => setLit((l) => (l + 1) % LINES.length), HOLD_MS);
    return () => window.clearInterval(id);
  }, [motion]);

  return (
    <h1 className="hero-title" id="hero-title">
      {LINES.map((line, i) => (
        <span key={line} className={i === lit ? "is-lit" : undefined}>
          {line}
        </span>
      ))}
    </h1>
  );
}
