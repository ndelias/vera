// Reads secrets from the environment, falling back to the repo's .env file.
// Values are never logged or put in errors: a missing secret says which name
// is missing and where to put it, nothing more.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function findEnvFile(from: string): string | null {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

export function secret(name: string, cwd = process.cwd()): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  const file = findEnvFile(cwd);
  const value = file ? parseEnv(readFileSync(file, "utf8"))[name] : undefined;
  if (value) return value;
  throw new Error(`${name} is not set. Export it, or add "${name}=..." to the .env file at the repo root.`);
}
