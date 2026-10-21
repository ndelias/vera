// Records the demo for the portfolio: the full run as a video, with a
// visible cursor and the page following the action, 2x stills at each key
// moment, short loops of the home and /why heroes, and phone shots. Plays
// the static export (npm run build -w panel && npm run preview -w panel).
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node apps/panel/scripts/capture-demo.mjs
//
// Everything is 2x. Browsers only record video at 1x (Playwright's recorder
// and Chrome's screencast both), which reads blurry on a retina screen, so
// videos are filmed frame by frame instead: the page's clock is frozen, and
// for each frame the timers and every CSS animation move on by 1/30 s, then
// a 2x screenshot is taken. Smooth scrolls and cursor moves are tweened on
// the same clock. The result is a crisp 2880x1800 video at an even 30 fps,
// however long each screenshot takes.
//
// Writes to captures/ at the repo root (gitignored).

import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const OUT = join(ROOT, "captures");
const BASE = process.env.SITE ?? "http://localhost:3200";
const pw = process.env.PLAYWRIGHT_CORE;
if (!pw) {
  console.error("Set PLAYWRIGHT_CORE to a playwright-core install.");
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(join(pw, "index.mjs")).href);

const W = 1440;
const H = 900;
const FPS = 30;
const FRAME = 1000 / FPS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A visible cursor: a ring that follows the mouse and pulses on click.
const CURSOR = `
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "cap-cursor";
    Object.assign(c.style, {
      position: "fixed", left: "0", top: "0", width: "22px", height: "22px", margin: "-11px 0 0 -11px",
      borderRadius: "50%", background: "rgba(201,242,60,0.55)", boxShadow: "0 0 0 2px #0b0b0b",
      pointerEvents: "none", zIndex: "2147483647", transform: "translate(-100px,-100px)",
      transition: "width 120ms, height 120ms, margin 120ms",
    });
    document.body.append(c);
    addEventListener("mousemove", (e) => (c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"), true);
    addEventListener("mousedown", () => Object.assign(c.style, { width: "14px", height: "14px", margin: "-7px 0 0 -7px" }), true);
    addEventListener("mouseup", () => Object.assign(c.style, { width: "22px", height: "22px", margin: "-11px 0 0 -11px" }), true);
  });
`;

// While filming: smooth scrolls (ours and the page's own) run on
// requestAnimationFrame, which the frozen clock drives, instead of on the
// browser's real-time scroller.
const SMOOTH_ON_CLOCK = `
  (() => {
    const native = window.scrollTo.bind(window);
    const tween = (top) => {
      const from = scrollY, d = top - from, start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 800);
        const e = 1 - Math.pow(1 - t, 3);
        native(0, from + d * e);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    window.scrollTo = (a, b) => (a && typeof a === "object" && a.behavior === "smooth" ? tween(a.top) : native(a, b));
    const into = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) {
      if (!o || typeof o !== "object" || o.behavior !== "smooth") return into.call(this, o);
      const r = this.getBoundingClientRect();
      const margin = parseFloat(getComputedStyle(this).scrollMarginTop) || 0;
      const top = scrollY + r.top - (o.block === "center" ? (innerHeight - r.height) / 2 : margin);
      tween(top);
    };
  })();
`;

function scrollTarget([sel, off, smooth]) {
  const el = [...document.querySelectorAll(sel)].at(-1);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - off, behavior: smooth ? "smooth" : "instant" });
}

// The two ways to drive a page. Both offer the same moves, so one script of
// the demo serves the stills (real time) and the video (frame by frame).
function realtime(page) {
  return {
    page,
    hold: (ms) => sleep(ms),
    until: (fn, arg) => page.waitForFunction(fn, arg, { timeout: 240_000 }),
    async moveTo(locator) {
      await locator.scrollIntoViewIfNeeded();
      const b = await locator.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
      await sleep(250);
    },
    async click(locator) {
      await this.moveTo(locator);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      await sleep(350);
    },
    async scrollTo(selector, offset = 90) {
      await page.evaluate(scrollTarget, [selector, offset, true]);
      await sleep(1100);
    },
  };
}

async function film(browser, name) {
  const dir = join(OUT, "tmp", name);
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript(SMOOTH_ON_CLOCK);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
  let rolling = false;
  let n = 0;
  let mouse = { x: W * 0.7, y: H * 0.5 };

  // One frame: timers and animations move on by 1/30 s, then a shot.
  const frame = async () => {
    await page.clock.runFor(FRAME);
    await page.evaluate(async (dt) => {
      for (const a of document.getAnimations()) {
        try {
          a.pause();
          a.currentTime = (Number(a.currentTime) || 0) + dt;
        } catch {}
      }
      // Give React's scheduler (a MessageChannel, not on the frozen clock) a turn.
      for (let i = 0; i < 2; i++)
        await new Promise((r) => {
          const c = new MessageChannel();
          c.port1.onmessage = () => r();
          c.port2.postMessage(0);
        });
    }, FRAME);
    if (rolling) await page.screenshot({ path: join(dir, `f${String(n++).padStart(6, "0")}.jpg`), type: "jpeg", quality: 92 });
  };
  const frames = async (ms) => {
    for (let i = 0; i < Math.round(ms / FRAME); i++) await frame();
  };

  return {
    page,
    // Freeze the clock once the page has loaded, and start filming.
    async roll() {
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(new Date(now + 50));
      await page.mouse.move(mouse.x, mouse.y);
      rolling = true;
    },
    hold: frames,
    async until(fn, arg) {
      for (let i = 0; i < FPS * 240; i++) {
        if (await page.evaluate(fn, arg)) return;
        await frame();
      }
      throw new Error(`timed out waiting for ${fn}`);
    },
    async moveTo(locator) {
      const b = await locator.boundingBox();
      if (b.y < 0 || b.y + b.height > H) {
        await page.evaluate((y) => window.scrollTo({ top: scrollY + y - 900 / 2, behavior: "smooth" }), b.y + b.height / 2);
        await frames(900);
      }
      const t = await locator.boundingBox();
      const to = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
      const from = mouse;
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        const e = ease(i / steps);
        await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
        await frame();
      }
      mouse = to;
      await frames(200);
    },
    async click(locator) {
      await this.moveTo(locator);
      await page.mouse.down();
      await frames(100);
      await page.mouse.up();
      await frames(350);
    },
    async scrollTo(selector, offset = 90) {
      await page.evaluate(scrollTarget, [selector, offset, true]);
      await frames(1000);
    },
    async finish() {
      await ctx.close();
      const mp4 = join(OUT, "video", `${name}.mp4`);
      execFileSync("ffmpeg", [
        "-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "f%06d.jpg"),
        "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4,
      ]);
      console.log("  video", `${name}.mp4`, `(${n} frames, ${(n / FPS).toFixed(1)} s)`);
    },
  };
}

async function shot(page, name, opts = {}) {
  await page.evaluate(() => document.getElementById("cap-cursor")?.style.setProperty("opacity", "0"));
  await page.screenshot({ path: join(OUT, "screens", `${name}.png`), ...opts });
  await page.evaluate(() => document.getElementById("cap-cursor")?.style.setProperty("opacity", "1"));
  console.log("  screen", name);
}

const phaseIs = (want) => document.querySelector(".demo")?.dataset.phase === want;
const exists = (sel) => Boolean(document.querySelector(sel));
const atLeast = ([sel, n]) => document.querySelectorAll(sel).length >= n;

// The demo, played like a person would: start, watch, ask Vera two
// questions, answer, approve, and follow the sign-offs to the end.
// `snap` takes a still at each key moment (a no-op while filming).
async function playDemo(d, snap, roll) {
  const { page } = d;
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await roll();
  await d.hold(1800);
  await snap("demo-01-start");
  await d.click(page.getByRole("button", { name: "Start the demo" }));
  await d.scrollTo(".demo-bar", 24);

  await d.until(exists, ".demo-areas");
  await d.hold(800);
  await snap("demo-02-mapped");
  await d.until(exists, ".demo-rules li:nth-child(4)");
  await d.scrollTo(".demo-comment", 24);
  await d.hold(1200);
  await snap("demo-03-rules");
  await d.until(exists, ".demo-briefs");
  await d.scrollTo(".demo-briefs", 120);
  await d.hold(1500);
  await snap("demo-04-briefs");

  await d.until(phaseIs, "review");
  await d.hold(1500);
  await snap("demo-05-your-turn");
  for (const q of ["What happens if the pricing service is down?", "Who calls applyDiscount, and could any of them break?"]) {
    const asks = await page.locator(".demo-ask .demo-msg").count();
    await d.click(page.getByRole("button", { name: q }));
    await d.until(atLeast, [".demo-ask .demo-msg", asks + 2]);
    await d.hold(1800);
  }
  await d.scrollTo(".demo-ask", 90);
  await snap("demo-06-ask-vera");

  await d.click(page.locator('label:has(input[name="timeout"][value="b"])'));
  await d.click(page.locator('label:has(input[name="rounding"][value="b"])'));
  await d.hold(600);
  await d.click(page.getByRole("button", { name: "Approve with these answers" }));
  await d.until(exists, ".demo-explain");
  await d.hold(2200);
  await snap("demo-07-graded");

  await d.until(exists, ".demo-signoffs");
  await d.scrollTo(".demo-signoffs", 140);
  for (const n of [1, 2, 3]) {
    await d.until(exists, `.demo-thread:nth-child(${n + 1})`);
    await d.scrollTo(".demo-thread", 160);
    await d.hold(2000);
  }
  await d.until(phaseIs, "done");
  await d.scrollTo(".demo-threads", 24);
  await d.hold(1200);
  await snap("demo-08-slack");
  await d.scrollTo(".demo-pr", 24);
  await d.hold(1500);
  await snap("demo-09-signed-off");
  await d.scrollTo(".demo-done", 420);
  await d.hold(2500);
  await snap("demo-10-summary");
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "screens"), { recursive: true });
await mkdir(join(OUT, "video"), { recursive: true });
const browser = await chromium.launch();

// 1. The full demo, filmed, then played again in real time for the stills.
{
  console.log("demo, filming");
  const d = await film(browser, "demo-full");
  await playDemo(d, async () => {}, () => d.roll());
  await d.finish();
  console.log("demo, stills");
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  await playDemo(realtime(page), (name) => shot(page, name), () => page.mouse.move(W * 0.7, H * 0.5));
  await ctx.close();
}

// 2. Short loops of the home hero (the turning mark) and the /why halftone,
// each centred on its moving piece.
for (const [name, path, sel, ms] of [
  ["home-turning-mark", "/", ".flow", 9000],
  ["why-halftone", "/why", ".halftone-mark", 9000],
]) {
  console.log(name);
  const d = await film(browser, name);
  await d.page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await d.page.waitForSelector(sel);
  await d.page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel);
  await sleep(1500);
  await d.roll();
  await d.page.mouse.move(-50, -50);
  await d.hold(ms);
  await d.finish();
}

// 3. Still pages: the product page's sections and the case's charts.
{
  console.log("pages");
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const [name, path, sel, offset] of [
    ["home-hero", "/", "body", 0],
    ["home-flow", "/", ".flow", 220],
    ["why-halftone", "/why", "body", 0],
    ["home-agents", "/", "#how", 60],
    ["home-reviewer", "/", "#preview", 60],
    ["home-stats", "/", '[aria-label="The problem in numbers"]', 60],
    ["why-charts", "/why", "#why-now", 60],
    ["why-ranking", "/why", "#size", 60],
    ["why-quotes", "/why", ".rotator", 200],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.evaluate(
      ([s, o]) => {
        const el = document.querySelector(s);
        window.scrollTo(0, el.getBoundingClientRect().top + scrollY - o);
      },
      [sel, offset],
    );
    await sleep(3200); // entrances (charts, numbers) finish
    await shot(page, name);
  }
  await ctx.close();
}

// 4. The demo on a phone.
{
  console.log("phone");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start the demo" }).click();
  await page.getByRole("button", { name: "2x" }).click();
  await page.waitForSelector(".demo-briefs", { timeout: 120_000 });
  await page.evaluate(() => document.querySelector(".demo-bar").scrollIntoView());
  await sleep(1200);
  await shot(page, "phone-01-run");
  await page.waitForFunction(phaseIs, "review", { timeout: 240_000 });
  await sleep(1500);
  await shot(page, "phone-02-your-turn");
  await ctx.close();
}

await browser.close();
await rm(join(OUT, "tmp"), { recursive: true, force: true });
console.log(`done: ${OUT}`);
