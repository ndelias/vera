// Records the demo for the portfolio: a full run as a screen recording, with
// a visible cursor and the page following the action, plus 2x screenshots at
// each key moment, short loops of the home and /why heroes, and phone shots.
// Plays the static export (npm run build -w panel && npm run preview -w panel).
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node apps/panel/scripts/capture-demo.mjs
//
// Videos record at the page's own size (Playwright doesn't scale the
// screencast up), so they're 1440x900; screenshots are 2x.
//
// Writes to captures/ at the repo root (gitignored). Videos come out as
// .webm and are converted to .mp4 (H.264) with ffmpeg.

import { execFileSync } from "node:child_process";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

let mouse = { x: W * 0.7, y: H * 0.5 };
async function moveTo(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 28 });
  mouse = { x, y };
  await sleep(250);
}
async function click(page, locator) {
  await moveTo(page, locator);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await sleep(350);
}
// Scroll smoothly so the element's top sits `offset` px below the top.
async function scrollTo(page, selector, offset = 90) {
  await page.evaluate(
    ([sel, off]) => {
      const el = [...document.querySelectorAll(sel)].at(-1);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - off, behavior: "smooth" });
    },
    [selector, offset],
  );
  await sleep(1100);
}
async function shot(page, name, opts = {}) {
  await page.evaluate(() => document.getElementById("cap-cursor")?.style.setProperty("opacity", "0"));
  await page.screenshot({ path: join(OUT, "screens", `${name}.png`), ...opts });
  await page.evaluate(() => document.getElementById("cap-cursor")?.style.setProperty("opacity", "1"));
  console.log("  screen", name);
}
const phase = (page, p) => page.waitForFunction((want) => document.querySelector(".demo")?.dataset.phase === want, p, { timeout: 240_000 });
const appears = (page, sel) => page.waitForSelector(sel, { timeout: 120_000 });

async function videoContext(browser, name) {
  const dir = join(OUT, "tmp", name);
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir, size: { width: W, height: H } },
  });
  await ctx.addInitScript(CURSOR);
  return { ctx, dir };
}
async function finishVideo(ctx, dir, name, trimStart = 0) {
  await ctx.close();
  const [file] = (await readdir(dir)).filter((f) => f.endsWith(".webm"));
  const webm = join(OUT, "video", `${name}.webm`);
  await rename(join(dir, file), webm);
  const mp4 = join(OUT, "video", `${name}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(trimStart), "-i", webm, "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
  await rm(webm);
  console.log("  video", `${name}.mp4`);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "screens"), { recursive: true });
await mkdir(join(OUT, "video"), { recursive: true });
const browser = await chromium.launch();

// The demo, played like a person would: start, watch, ask Vera two
// questions, answer, approve, and follow the sign-offs to the end.
// `snap` takes a still at each key moment (a no-op while recording).
async function playDemo(page, snap) {
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await page.mouse.move(mouse.x, mouse.y);
  await sleep(1800);
  await snap("demo-01-start");
  await click(page, page.getByRole("button", { name: "Start the demo" }));
  await scrollTo(page, ".demo-bar", 24);

  await appears(page, ".demo-areas");
  await sleep(800);
  await snap("demo-02-mapped");
  await appears(page, ".demo-rules li:nth-child(4)");
  await scrollTo(page, ".demo-comment", 24);
  await sleep(1200);
  await snap("demo-03-rules");
  await appears(page, ".demo-briefs");
  await scrollTo(page, ".demo-briefs", 120);
  await sleep(1500);
  await snap("demo-04-briefs");

  await phase(page, "review");
  await sleep(1500);
  await snap("demo-05-your-turn");
  for (const q of ["What happens if the pricing service is down?", "Who calls applyDiscount, and could any of them break?"]) {
    const asks = await page.locator(".demo-ask .demo-msg").count();
    await click(page, page.getByRole("button", { name: q }));
    await page.waitForFunction((n) => document.querySelectorAll(".demo-ask .demo-msg").length >= n + 2, asks, { timeout: 30_000 });
    await sleep(1800);
  }
  await scrollTo(page, ".demo-ask", 90);
  await snap("demo-06-ask-vera");

  await click(page, page.locator('label:has(input[name="timeout"][value="b"])'));
  await click(page, page.locator('label:has(input[name="rounding"][value="b"])'));
  await sleep(600);
  await click(page, page.getByRole("button", { name: "Approve with these answers" }));
  await appears(page, ".demo-explain");
  await sleep(2200);
  await snap("demo-07-graded");

  await appears(page, ".demo-signoffs");
  await scrollTo(page, ".demo-signoffs", 140);
  for (const n of [1, 2, 3]) {
    await appears(page, `.demo-thread:nth-child(${n + 1})`);
    await scrollTo(page, ".demo-thread", 160);
    await sleep(2000);
  }
  await phase(page, "done");
  await scrollTo(page, ".demo-threads", 24);
  await sleep(1200);
  await snap("demo-08-slack");
  await scrollTo(page, ".demo-pr", 24);
  await sleep(1500);
  await snap("demo-09-signed-off");
  await scrollTo(page, ".demo-done", 420);
  await sleep(2500);
  await snap("demo-10-summary");
}

// 1. The full demo, recorded at 1x, then played again at 2x pixels for stills.
{
  console.log("demo, recording");
  const { ctx, dir } = await videoContext(browser, "demo-full");
  await playDemo(await ctx.newPage(), async () => {});
  await finishVideo(ctx, dir, "demo-full");
  console.log("demo, stills");
  const still = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await still.addInitScript(CURSOR);
  const page = await still.newPage();
  await playDemo(page, (name) => shot(page, name));
  await still.close();
}

// 2. Short loops of the home hero (the turning mark) and the /why halftone.
// Each loop is centred on its moving piece; the moment before it scrolls
// into place is trimmed off.
for (const [name, path, wait, ms] of [
  ["home-turning-mark", "/", ".flow", 9000],
  ["why-halftone", "/why", ".halftone-mark", 9000],
]) {
  console.log(name);
  const { ctx, dir } = await videoContext(browser, name);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.mouse.move(-50, -50);
  await page.waitForSelector(wait);
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "center" }), wait);
  const t0 = Date.now();
  await sleep(ms);
  await finishVideo(ctx, dir, name, Math.max(0, (Date.now() - t0 - ms) / 1000) + 1.2);
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
    await page.evaluate(([s, o]) => {
      const el = document.querySelector(s);
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - o);
    }, [sel, offset]);
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
  await phase(page, "review");
  await sleep(1500);
  await shot(page, "phone-02-your-turn");
  await ctx.close();
}

await browser.close();
await rm(join(OUT, "tmp"), { recursive: true, force: true });
console.log(`done: ${OUT}`);
