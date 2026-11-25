// Verify, Also changed and Cleared (Nahuel's calls, 25 Nov 2026): Vera
// shrinks what people read. The Briefer's spots are what a reviewer verifies,
// one tick each; what Triage cleared is folded away with a reason; everything
// else is listed as also changed, to read as they see fit.
//
// A hunk the Briefer points at is always Verify, even if Triage would clear it.
// Docs and wording are cleared for engineers only (clearedFor), so the comment
// says so next to them.

import { clearedFor, type FileHunk, type Skip, type SkipReason } from "@vera/agents/triage";

export type Range = { file: string; label: string; ranges: string; lines: number; url: string | null };
export type Cleared = Range & { reason: SkipReason; note: string; engineersOnly: boolean };
export type VerifyView = {
  /** Changed lines in the whole change, and in the spots to verify. */
  total: number;
  spotLines: number;
  also: Range[];
  alsoLines: number;
  cleared: Cleared[];
  clearedLines: number;
  /** False when Triage gave no answer: nothing is cleared, and the comment says why. */
  triaged: boolean;
};

/** The lines a spot covers, from the Briefer's "180-207", "L180–207" or "42". */
export function span(lines: string): [number, number] | null {
  const nums = (lines.match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return null;
  const [a, b] = [nums[0]!, nums[1] ?? nums[0]!];
  return [Math.min(a, b), Math.max(a, b)];
}

const join = (hs: FileHunk[]) => hs.map((h) => (h.start === h.end ? `L${h.start}` : `L${h.start}–${h.end}`)).join(", ");

export function verifyView(
  hunks: FileHunk[],
  skips: Skip[] | null,
  spots: { file: string; lines: string }[],
  label: (file: string) => string,
  link: (file: string, line: number) => string | null,
): VerifyView {
  const spans = spots.map((s) => ({ file: s.file, at: span(s.lines) }));
  const inSpot = (h: FileHunk) => spans.some((s) => s.file === h.path && s.at && h.start <= s.at[1] && s.at[0] <= h.end);
  const why = new Map((skips ? clearedFor(skips, "engineer") : []).map((s) => [s.hunk, s]));

  const also: FileHunk[] = [];
  const cleared: FileHunk[] = [];
  for (const h of hunks) {
    if (!h.changed || inSpot(h)) continue;
    (why.has(h.id) ? cleared : also).push(h);
  }

  // One row per file for Also changed; one per file and reason for Cleared.
  const byFile = new Map<string, FileHunk[]>();
  for (const h of also) byFile.set(h.path, [...(byFile.get(h.path) ?? []), h]);
  const alsoRows = [...byFile].map(([file, hs]) => ({ file, label: label(file), ranges: join(hs), lines: hs.reduce((n, h) => n + h.changed, 0), url: link(file, hs[0]!.start) }));

  const byReason = new Map<string, FileHunk[]>();
  for (const h of cleared) {
    const k = `${h.path}\u0000${why.get(h.id)!.reason}`;
    byReason.set(k, [...(byReason.get(k) ?? []), h]);
  }
  const clearedRows = [...byReason].map(([k, hs]) => {
    const [file, reason] = k.split("\u0000") as [string, SkipReason];
    const first = why.get(hs[0]!.id)!;
    return {
      file, label: label(file), ranges: join(hs), lines: hs.reduce((n, h) => n + h.changed, 0), url: link(file, hs[0]!.start),
      reason, note: first.note, engineersOnly: clearedFor([first], "any").length === 0,
    };
  });

  return {
    total: hunks.reduce((n, h) => n + h.changed, 0),
    spotLines: spans.reduce((n, s) => n + (s.at ? s.at[1] - s.at[0] + 1 : 0), 0),
    also: alsoRows.sort((a, b) => b.lines - a.lines),
    alsoLines: also.reduce((n, h) => n + h.changed, 0),
    cleared: clearedRows.sort((a, b) => b.lines - a.lines),
    clearedLines: cleared.reduce((n, h) => n + h.changed, 0),
    triaged: skips !== null,
  };
}

// —— As markdown ——

const REASON: Record<SkipReason, string> = {
  generated: "Generated",
  lockfile: "Lockfile",
  moved: "Moved, same code",
  formatting: "Formatting only",
  imports: "Imports only",
  "test-mirrors-code": "Test follows the code",
  "test-setup": "Test setup",
  docs: "Docs",
  comments: "Code comments only",
  "config-value": "Config value",
  mechanical: "Same edit repeated",
  "removed-unused": "Removed, unused",
  copy: "Wording only",
};
const MAX_ROWS = 25;
const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString("en-US")} ${x === 1 ? one : many}`;
/** Model-written text as plain text on one line, safe in a table cell. */
const cell = (s: string) => s.replace(/</g, "&lt;").replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
const where = (r: Range) => (r.url ? `[\`${r.label}\`](${r.url} "${r.file}") ${r.ranges}` : `\`${r.label}\` ${r.ranges}`);
const more = (rows: unknown[]) => (rows.length > MAX_ROWS ? [`- and ${n(rows.length - MAX_ROWS, "more file")}`] : []);

/** The hidden id on a spot's tick box: which spot, and whose box it is, so an edit to the
 * comment can be read back as "this person verified this spot". */
export const tickId = (spot: number, who: string) => `<!-- vera-tick:${spot}:${who.replace(/^@/, "")} -->`;
export const TICK = /^- \[( |x|X)\] .*<!-- vera-tick:(\d+):([A-Za-z0-9-]+) -->/gm;

/** The line under the summary: what to verify, and how much Vera cleared. */
export function headline(v: VerifyView, spots: number): string {
  const verify = spots ? `**Verify ${n(spots, "spot")}** (${n(v.spotLines, "line")})` : "**Nothing flagged to verify**";
  const cleared = !v.triaged ? "Vera couldn't clear anything this time" : `${v.clearedLines.toLocaleString("en-US")} of ${n(v.total, "changed line")} cleared by Vera`;
  return `${verify} · ${cleared}`;
}

/** Also changed and Cleared, folded away under the people's blocks. */
export function sections(v: VerifyView): string[] {
  const out: string[] = [];
  if (v.also.length) {
    out.push(
      `<details><summary><b>Also changed</b> · ${n(v.alsoLines, "line")} in ${n(v.also.length, "file")}, not flagged</summary>`,
      "",
      ...v.also.slice(0, MAX_ROWS).map((r) => `- ${where(r)} · ${n(r.lines, "line")}`),
      ...more(v.also),
      "",
      "</details>",
      "",
    );
  }
  if (v.cleared.length) {
    const forEngineers = v.cleared.some((r) => r.engineersOnly);
    out.push(
      `<details><summary><b>Cleared by Vera</b> · ${n(v.clearedLines, "line")} in ${n(new Set(v.cleared.map((r) => r.file)).size, "file")}</summary>`,
      "",
      "| Where | Why it's cleared |",
      "|---|---|",
      ...v.cleared.slice(0, MAX_ROWS).map((r) => `| ${where(r)} | ${REASON[r.reason]}${r.engineersOnly ? " (for engineers)" : ""} · ${cell(r.note)} |`),
      ...(v.cleared.length > MAX_ROWS ? [`| and ${n(v.cleared.length - MAX_ROWS, "more file")} | |`] : []),
      "",
      ...(forEngineers ? ["<sub>Docs and wording are cleared for engineers only; whoever reviews docs, design or product still reads them.</sub>", ""] : []),
      "</details>",
      "",
    );
  }
  return out;
}
