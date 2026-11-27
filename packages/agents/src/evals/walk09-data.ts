// Study 09: the data Nahuel rates. For each sampled PR, the Guide's walkthrough
// (batch walk09) with each step's level worked out exactly as in the product
// (packages/cli/src/verify.ts) from study 08's Briefer and Triage runs on the same
// diff, each step's code, and the spots that mattered outside the Verify steps.
// No rating or lean from Claude is included.
//
//   node packages/agents/src/evals/walk09-data.ts <out.json>          round 1
//   node packages/agents/src/evals/walk09-data.ts <out.json> b        round 2 (Guide v2, sample-b, steps only)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import type { FileHunk, Skip } from "../triage.ts";
import { walkthrough } from "../../../cli/src/verify.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const db = new DatabaseSync(join(ROOT, "research/data/research.sqlite"));
const BATCHES = join(ROOT, "research/data/batches");
const cid = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
const read = <T>(system: string, pr: string): T | null => {
  try {
    return JSON.parse(readFileSync(join(BATCHES, system, `${cid(pr)}.json`), "utf8")) as T;
  } catch {
    return null;
  }
};

type Line = { t: " " | "+" | "-"; text: string; old: number | null; new: number | null };
function lines(text: string): { start: number; lines: Line[] } {
  const [head, ...rest] = text.split("\n");
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(head ?? "");
  let o = Number(m?.[1] ?? 0), n = Number(m?.[2] ?? 0);
  const out: Line[] = [];
  for (const l of rest) {
    if (l.startsWith("\\")) continue;
    const t = (l[0] === "+" || l[0] === "-" ? l[0] : " ") as Line["t"];
    out.push({ t, text: l.slice(1), old: t === "+" ? null : o, new: t === "-" ? null : n });
    if (t !== "+") o++;
    if (t !== "-") n++;
  }
  return { start: Number(m?.[2] ?? 0), lines: out };
}

const round2 = process.argv[3] === "b";
const sample = JSON.parse(readFileSync(join(ROOT, `research/studies/09-walkthrough/${round2 ? "sample-b" : "sample"}.json`), "utf8")) as string[];
const rest = round2 ? [] : (db.prepare("SELECT id FROM sk_prs WHERE split = 'test' ORDER BY id").all() as { id: string }[]).map((r) => r.id).filter((id) => !sample.includes(id));
const out = [];
// The 15 sampled PRs: every step is rated. The other 90: only their spots outside the Briefer's places.
for (const id of [...sample, ...rest]) {
  const rate = sample.includes(id);
  const system = round2 ? "walk09b" : rate ? "walk09" : "walk09-rest";
  const [repo, num] = id.split("#") as [string, string];
  const title = execFileSync("gh", ["api", `repos/${repo}/pulls/${num}`, "-q", ".title"], { encoding: "utf8" }).trim();
  const rows = db.prepare("SELECT n, path, new_start, new_len, added, deleted, text FROM sk_hunks WHERE pr = ? ORDER BY n").all(id) as
    { n: number; path: string; new_start: number; new_len: number; added: number; deleted: number; text: string }[];
  const hunks: FileHunk[] = rows.map((h) => ({ id: h.n, path: h.path, text: h.text, start: h.new_start, end: h.new_start + Math.max(h.new_len, 1) - 1, changed: h.added + h.deleted }));
  const guide = read<{ steps?: { title: string; explain: string; hunks: number[] }[] }>(system, id);
  const skips = read<{ skip?: Skip[] }>("triage-v1-test", id)?.skip ?? null;
  const places = read<{ places?: { file: string; lines: string }[] }>("brief-skip-test", id)?.places ?? [];
  if (!guide?.steps?.length) {
    out.push({ id, title, url: `https://github.com/${repo}/pull/${num}`, rate, failed: true, steps: [], points: [] });
    continue;
  }
  // The same clean-up the product does (parseGuide): each hunk in one step, leftovers last.
  const seen = new Set<number>();
  const ids = hunks.map((h) => h.id);
  const steps = guide.steps.map((s) => ({ title: s.title, explain: s.explain, hunks: (s.hunks ?? []).filter((h) => ids.includes(h) && !seen.has(h) && (seen.add(h), true)) })).filter((s) => s.hunks.length);
  const left = ids.filter((h) => !seen.has(h));
  if (left.length) steps.push({ title: "Other changes", explain: "Smaller changes the walkthrough didn't group with the steps above.", hunks: left });
  const walk = walkthrough(hunks, skips, steps, places, (f) => f, () => null);
  // walkthrough() drops steps with no changed lines; keep the Guide's hunks for the ones it kept.
  const kept = steps.filter((s) => s.hunks.some((h) => (hunks.find((x) => x.id === h)?.changed ?? 0) > 0));
  const byHunk = new Map<number, number>();
  kept.forEach((s, i) => s.hunks.forEach((h) => byHunk.set(h, i)));
  // Grafana and getsentry both start with g; their PR numbers don't collide here, and round 2 has its own prefix.
  const short = `${round2 ? "b-" : ""}${repo.split("/")[0]!.slice(0, 1).toLowerCase()}${num}`;
  const stepsOut = walk.map((w, i) => ({
    key: `${short}-s${i + 1}`, n: i + 1, title: w.title, explain: w.explain, level: w.level,
    hunks: kept[i]!.hunks.map((h) => rows.find((r) => r.n === h)!).map((r) => ({ path: r.path, ...lines(r.text) })),
  }));
  const spots = db.prepare("SELECT path, side, first, last, hunk FROM sk_spots WHERE pr = ? AND mattered = 1 AND hunk IS NOT NULL ORDER BY hunk, first").all(id) as
    { path: string; side: string; first: number; last: number; hunk: number }[];
  // Spots the Briefer's places don't cover (same file, within 3 lines, as study 08 scored
  // Verify): the walkthrough's explanation is all a reviewer has to go on there.
  const span = (l: string) => { const m = (l.match(/\d+/g) ?? []).map(Number); return m.length ? [Math.min(m[0]!, m[1] ?? m[0]!), Math.max(m[0]!, m[1] ?? m[0]!)] as const : null; };
  const covered = (s: { path: string; side: string; first: number; last: number; hunk: number }) => {
    let [a, b] = [s.first, s.last];
    if (s.side !== "RIGHT") { const r = rows.find((x) => x.n === s.hunk)!; [a, b] = [r.new_start, r.new_start + Math.max(r.new_len, 1) - 1]; }
    return places.some((pl) => { const sp = span(pl.lines); return pl.file === s.path && !!sp && sp[0] <= b + 3 && a - 3 <= sp[1]; });
  };
  const points = round2 ? [] : spots.flatMap((s, k) => {
    const i = byHunk.get(s.hunk);
    if (i === undefined || covered(s)) return [];
    const r = rows.find((x) => x.n === s.hunk)!;
    return [{ key: `${short}-p${k + 1}`, step: i + 1, path: s.path, side: s.side, first: s.first, last: s.last, hunk: lines(r.text) }];
  });
  if (rate) out.push({ id, title, url: `https://github.com/${repo}/pull/${num}`, rate, steps: stepsOut, points });
  // Only what the questions show: each point's step (title, explanation, level) and its own code.
  else if (points.length) out.push({ id, title, url: `https://github.com/${repo}/pull/${num}`, rate, points,
    steps: stepsOut.map((st) => ({ ...st, hunks: [] })) });
}
writeFileSync(process.argv[2]!, JSON.stringify(out));
const steps = out.filter((p) => p.rate).reduce((n, p) => n + p.steps.length, 0), points = out.reduce((n, p) => n + p.points.length, 0);
console.log(`${out.length} PRs to show, ${steps} steps to rate, ${points} spots outside the Briefer's places; failed: ${out.filter((p) => "failed" in p).length}`);
