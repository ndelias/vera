// Who owns what, from the repo itself: `.vera.yml` when the team has one,
// GitHub's CODEOWNERS otherwise. Plain code: these decide who is asked;
// the agents only propose which areas a change touches.

import { parse } from "yaml";

export const ROLES = ["engineer", "design", "product", "docs", "security", "lead"] as const;
export type Role = (typeof ROLES)[number];

export type Person = { handle: string; role: Role; areas: string[] };
export type Area = { name: string; paths: string[]; description: string; lead?: string };

/** What Vera knows about a repo's people and areas, and where it came from. */
export type Ownership = {
  source: ".vera.yml" | "CODEOWNERS" | "none";
  lead?: string;
  areas: Area[];
  people: Person[];
};

export class ConfigError extends Error {}

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Reads `.vera.yml`. Throws ConfigError with a plain message when it can't. */
export function fromVeraYml(text: string): Ownership {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    throw new ConfigError(`.vera.yml isn't valid YAML: ${(e as Error).message.split("\n")[0]}`);
  }
  if (!doc || typeof doc !== "object") throw new ConfigError(".vera.yml is empty or not a map of settings");
  const d = doc as Record<string, unknown>;
  const areas: Area[] = [];
  for (const [i, a] of (Array.isArray(d.areas) ? d.areas : []).entries()) {
    const x = (a ?? {}) as Record<string, unknown>;
    if (!str(x.name)) throw new ConfigError(`areas[${i}] needs a name`);
    const paths = Array.isArray(x.paths) ? x.paths.filter(str) : [];
    areas.push({ name: x.name, paths, description: str(x.description) ? x.description : "", ...(str(x.lead) ? { lead: x.lead } : {}) });
  }
  const names = new Set(areas.map((a) => a.name));
  const people: Person[] = [];
  for (const [i, p] of (Array.isArray(d.people) ? d.people : []).entries()) {
    const x = (p ?? {}) as Record<string, unknown>;
    if (!str(x.handle)) throw new ConfigError(`people[${i}] needs a handle`);
    if (!ROLES.includes(x.role as Role)) throw new ConfigError(`people[${i}] (${x.handle}): role must be one of ${ROLES.join(", ")}`);
    const theirs = Array.isArray(x.areas) ? x.areas.filter(str) : [];
    const unknown = theirs.filter((a) => !names.has(a));
    if (unknown.length) throw new ConfigError(`people[${i}] (${x.handle}): no area named ${unknown.join(", ")}`);
    people.push({ handle: x.handle, role: x.role as Role, areas: theirs });
  }
  return { source: ".vera.yml", ...(str(d.lead) ? { lead: d.lead } : {}), areas, people };
}

/** Reads CODEOWNERS: each owner becomes an area holding the paths it owns. */
export function fromCodeowners(text: string): Ownership {
  const byOwner = new Map<string, string[]>();
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("[")) continue; // GitLab-style sections
    const [pattern, ...owners] = line.split(/\s+/);
    for (const o of owners) byOwner.set(o, [...(byOwner.get(o) ?? []), pattern!]);
  }
  const areas = [...byOwner].map(([owner, paths]) => ({ name: owner, paths, description: `Paths ${owner} owns in CODEOWNERS` }));
  const people = [...byOwner.keys()].map((owner) => ({ handle: owner, role: "engineer" as const, areas: [owner] }));
  return { source: "CODEOWNERS", areas, people };
}

/** Does a CODEOWNERS / gitignore-style pattern match a repo path? */
export function matches(pattern: string, path: string): boolean {
  let p = pattern.trim();
  if (!p) return false;
  const anchored = p.startsWith("/") || p.slice(0, -1).includes("/");
  p = p.replace(/^\//, "");
  if (p.endsWith("/")) p += "**";
  const re = p
    .split("**")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))
    .join(".*");
  return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${re}(?:/.*)?$`).test(path);
}

/** Which declared areas each changed path falls under (the last matching rule wins, as in CODEOWNERS). */
export function areasFor(o: Ownership, paths: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of paths) {
    let hit: string | undefined;
    for (const a of o.areas) if (a.paths.some((p) => matches(p, path))) hit = a.name;
    if (hit) counts.set(hit, (counts.get(hit) ?? 0) + 1);
  }
  return counts;
}
