"use client";

import { useEffect, useState } from "react";

// One switch for every moving thing on the site: the visitor's
// reduced-motion setting, or the footer's Pause (data-motion="off" on <html>).

export const MOTION_EVENT = "vera:motion";

export function motionAllowed() {
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.motion !== "off"
  );
}

/** True while things may move. Starts false so the server render is still. */
export function useMotion() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(motionAllowed());
    update();
    mq.addEventListener("change", update);
    window.addEventListener(MOTION_EVENT, update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener(MOTION_EVENT, update);
    };
  }, []);
  return allowed;
}

/** Whether the element is on screen (null until the first reading), so
 * loops only run when seen and entrances only play for things below the fold. */
export function useOnScreen(ref: React.RefObject<Element | null>) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => setOn(Boolean(e?.isIntersecting)));
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref]);
  return on;
}
