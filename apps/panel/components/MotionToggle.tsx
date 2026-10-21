"use client";

import { useEffect, useState } from "react";
import { MOTION_EVENT } from "@/lib/motion";

/** The footer's Pause: stops everything that moves, and is remembered where storage works. */
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
      {off ? "Play motion" : "Pause motion"}
    </button>
  );
}
