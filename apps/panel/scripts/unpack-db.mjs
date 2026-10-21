// Unpacks data/site.sqlite.gz (the committed research snapshot) before dev
// and build. Skips the work when the unpacked file is already current.
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const gz = new URL("../data/site.sqlite.gz", import.meta.url);
const db = new URL("../data/site.sqlite", import.meta.url);

if (!existsSync(gz)) {
  console.error("data/site.sqlite.gz is missing. Run: python3 research/pipeline/export_site.py");
  process.exit(1);
}
if (existsSync(db) && statSync(db).mtimeMs >= statSync(gz).mtimeMs) process.exit(0);
await pipeline(createReadStream(gz), createGunzip(), createWriteStream(db));
console.log("unpacked data/site.sqlite");
