// Serves the static export (out/) the way Vercel does: /why -> why.html.
// For checking the built site locally: npm run preview -w panel
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("../out/", import.meta.url).pathname;
const port = Number(process.env.PORT) || 3200;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = [join(root, path), join(root, `${path}.html`), join(root, path, "index.html")];
  const file = candidates.find(isFile);
  const status = file ? 200 : 404;
  const served = file ?? join(root, "404.html");
  res.writeHead(status, { "content-type": TYPES[extname(served)] ?? "application/octet-stream" });
  createReadStream(served).pipe(res);
}).listen(port, () => console.log(`serving out/ on http://localhost:${port}`));
