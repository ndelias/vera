// Writes Vera's logo files: the mark as SVG (colour, on dark, black, white),
// and, rendered in headless Chromium with the site's own fonts, PNG lockups,
// avatars, app icons, favicon.ico and the social preview image.
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node apps/panel/scripts/render-brand.mjs
//
// playwright-core isn't a dependency of this repo; point PLAYWRIGHT_CORE at
// any install that has its Chromium downloaded.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(APP, "public/brand");
const INK = "#0b0b0b";
const WHITE = "#ffffff";
const LIME = "#c9f23c";

// The mark, as in components/Mark.tsx (48-unit box).
const mark = (stroke, square) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <path d="M9.5 9 L19 29" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>
  <path d="M38.5 9 L29 29" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>
  <rect x="19" y="34" width="10" height="10" rx="2.6" fill="${square}"/>
</svg>
`;

const SVGS = {
  "vera-mark.svg": mark(INK, LIME),
  "vera-mark-on-dark.svg": mark(WHITE, LIME),
  "vera-mark-black.svg": mark(INK, INK),
  "vera-mark-white.svg": mark(WHITE, WHITE),
};

async function dotoFile() {
  return join(APP, "app/fonts/doto-latin.woff2");
}

// Fonts go in as data URLs: a page set from a string can't load file:// URLs.
const dataUrl = async (file) => `data:font/woff2;base64,${(await readFile(file)).toString("base64")}`;
const fontFaces = async (doto) => `
@font-face { font-family: "Instrument Sans"; src: url(${await dataUrl(join(APP, "public/fonts/instrument-sans-latin-500-normal.woff2"))}); font-weight: 500; }
@font-face { font-family: "Instrument Sans"; src: url(${await dataUrl(join(APP, "public/fonts/instrument-sans-latin-400-normal.woff2"))}); font-weight: 400; }
@font-face { font-family: "Fragment Mono"; src: url(${await dataUrl(join(APP, "public/fonts/fragment-mono-latin-400-normal.woff2"))}); }
@font-face { font-family: "Doto"; src: url(${await dataUrl(doto)}); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { background: transparent; }
`;

// The mark beside "vera", sized from the mark's height.
const lockup = (h, text, square) => `
<div id="shot" style="display:inline-flex;align-items:center;gap:${h * 0.16}px;padding:${h * 0.25}px">
  ${mark(text, square).replace('width="48" height="48"', `width="${h}" height="${h}"`)}
  <span style="font:500 ${h * 1.02}px/1 'Instrument Sans';letter-spacing:-0.035em;color:${text};transform:translateY(-${h * 0.04}px)">vera</span>
</div>`;

// A 16:10 card with the lockup centred, for project cards (the portfolio's
// homepage poster and index cover sit beside vers1ons' wordmark on black).
const card = (bg, text) => `
<div id="shot" style="width:1440px;height:900px;background:${bg};display:grid;place-items:center">
  ${lockup(120, text, LIME).replace('id="shot"', "")}
</div>`;

// A square tile with the mark centred, for avatars and app icons.
const tile = (size, bg, stroke, radius = 0) => `
<div id="shot" style="width:${size}px;height:${size}px;background:${bg};border-radius:${radius}px;display:grid;place-items:center">
  ${mark(stroke, LIME).replace('width="48" height="48"', `width="${size * 0.62}" height="${size * 0.62}"`)}
</div>`;

// The social preview: the headline in Doto, the lockup, and the mark in cells.
const og = () => `
<div id="shot" style="width:1200px;height:630px;background:${WHITE};position:relative;overflow:hidden;font-family:'Instrument Sans'">
  <div style="position:absolute;left:72px;top:64px">${lockup(44, INK, LIME).replace('id="shot"', "").replace(/padding:[^;"]+/, "padding:0")}</div>
  <div style="position:absolute;left:72px;top:186px;font:900 74px/0.98 'Doto';letter-spacing:0.01em;color:${INK}">Understood.<br>Signed off.<br>Shipped.</div>
  <div style="position:absolute;left:72px;bottom:64px;font:400 18px/1 'Fragment Mono';letter-spacing:0.08em;text-transform:uppercase;color:#5c5c57">Review for the AI era</div>
  <canvas id="cells" width="360" height="360" style="position:absolute;right:72px;top:135px;width:360px;height:360px"></canvas>
</div>
<script>
  // The mark sampled onto a 24x24 grid and drawn as square cells.
  const N = 24, S = 360 / N;
  const off = new OffscreenCanvas(N * 8, N * 8), g = off.getContext("2d");
  g.scale((N * 8) / 48, (N * 8) / 48);
  g.lineCap = "round"; g.lineWidth = 8; g.strokeStyle = "#f00";
  g.beginPath(); g.moveTo(9.5, 9); g.lineTo(19, 29); g.moveTo(38.5, 9); g.lineTo(29, 29); g.stroke();
  g.fillStyle = "#0f0"; g.beginPath(); g.roundRect(19, 34, 10, 10, 2.6); g.fill();
  const px = g.getImageData(0, 0, N * 8, N * 8).data;
  const ctx = document.getElementById("cells").getContext("2d");
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = 0, green = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const k = ((y * 8 + j) * N * 8 + x * 8 + i) * 4;
      a += px[k + 3]; if (px[k + 1] > 128) green++;
    }
    ctx.fillStyle = a / 64 > 128 ? (green > 20 ? "${LIME}" : "${INK}") : "#ececE6";
    ctx.fillRect(x * S + 1.5, y * S + 1.5, S - 3, S - 3);
  }
</script>`;

// favicon.ico holding PNGs (supported everywhere current).
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

const pwPath = process.env.PLAYWRIGHT_CORE;
if (!pwPath) {
  console.error("Set PLAYWRIGHT_CORE to a playwright-core install (see the top of this file).");
  process.exit(1);
}
const { chromium } = await import(pathToFileURL(join(pwPath, "index.mjs")).href);

await mkdir(OUT, { recursive: true });
for (const [name, svg] of Object.entries(SVGS)) await writeFile(join(OUT, name), svg);

const faces = await fontFaces(await dotoFile());
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shoot(html, transparent = false, scale = 1) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const p = scale === 1 ? page : await browser.newPage({ deviceScaleFactor: scale });
  await p.setContent(`<!doctype html><style>${faces}</style>${html}`, { waitUntil: "load" });
  // Make sure every face is in before the shot; a fallback would slip through silently.
  const missing = await p.evaluate(async () => {
    const want = ["500 20px 'Instrument Sans'", "20px 'Fragment Mono'", "900 20px Doto"];
    await Promise.all(want.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return want.filter((f) => !document.fonts.check(f));
  });
  if (missing.length) throw new Error(`fonts not loaded: ${missing.join(", ")}`);
  const buf = await p.locator("#shot").screenshot({ omitBackground: transparent });
  if (p !== page) await p.close();
  return buf;
}

const files = {
  "vera-lockup.png": await shoot(lockup(96, INK, LIME), true, 2),
  "vera-lockup-on-dark.png": await shoot(lockup(96, WHITE, LIME), true, 2),
  "vera-avatar-light-400.png": await shoot(tile(400, WHITE, INK)),
  "vera-avatar-light-1024.png": await shoot(tile(1024, WHITE, INK)),
  "vera-avatar-dark-400.png": await shoot(tile(400, INK, WHITE)),
  "vera-avatar-dark-1024.png": await shoot(tile(1024, INK, WHITE)),
  "icon-192.png": await shoot(tile(192, WHITE, INK)),
  "icon-512.png": await shoot(tile(512, WHITE, INK)),
  "og.png": await shoot(og()),
  "vera-card-dark.png": await shoot(card(INK, WHITE), false, 2),
  "vera-card-light.png": await shoot(card(WHITE, INK), false, 2),
};
for (const [name, buf] of Object.entries(files)) await writeFile(join(OUT, name), buf);

// Next serves these from app/: the tab icon and the home-screen icon.
await writeFile(join(APP, "app/apple-icon.png"), await shoot(tile(180, WHITE, INK)));
const favicon = [];
for (const size of [16, 32, 48]) favicon.push({ size, data: await shoot(tile(size, WHITE, INK, size * 0.18), true) });
await writeFile(join(APP, "app/favicon.ico"), ico(favicon));

await browser.close();
console.log(`wrote ${Object.keys(SVGS).length + Object.keys(files).length} files to public/brand, plus app/apple-icon.png and app/favicon.ico`);
