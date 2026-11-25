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

// —— The walkthrough (Nahuel's call, 25 Nov 2026) ——
// Every change, grouped by the Guide into steps in reading order. How much care a step
// needs comes from the measured agents: one holding a Briefer place is Verify, one
// Triage cleared entirely (for engineers) is Cleared, the rest is Skim.

export type Level = "verify" | "skim" | "cleared";
export type WalkStep = {
  title: string; explain: string; level: Level; lines: number;
  places: Range[];
  /** Verify: the spots in this step, by their place in the brief. */
  spots: number[];
  /** Cleared: why, per file. */
  why: { label: string; reason: string }[];
};

export function walkthrough(
  hunks: FileHunk[],
  skips: Skip[] | null,
  steps: { title: string; explain: string; hunks: number[] }[],
  spots: { file: string; lines: string }[],
  label: (file: string) => string,
  link: (file: string, line: number) => string | null,
): WalkStep[] {
  const byId = new Map(hunks.map((h) => [h.id, h]));
  const cleared = new Map((skips ? clearedFor(skips, "engineer") : []).map((s) => [s.hunk, s]));
  const spans = spots.map((s) => ({ file: s.file, at: span(s.lines) }));
  const touches = (h: FileHunk, i: number) => spans[i]!.file === h.path && !!spans[i]!.at && h.start <= spans[i]!.at![1] && spans[i]!.at![0] <= h.end;
  return steps.flatMap((step) => {
    const hs = step.hunks.map((id) => byId.get(id)).filter((h): h is FileHunk => !!h && h.changed > 0);
    if (!hs.length) return [];
    const mine = spans.map((_, i) => i).filter((i) => hs.some((h) => touches(h, i)));
    const level: Level = mine.length ? "verify" : hs.every((h) => cleared.has(h.id)) ? "cleared" : "skim";
    const files = new Map<string, FileHunk[]>();
    for (const h of hs) files.set(h.path, [...(files.get(h.path) ?? []), h]);
    const places = [...files].map(([file, fh]) => ({ file, label: label(file), ranges: join(fh), lines: fh.reduce((n, h) => n + h.changed, 0), url: link(file, fh[0]!.start) }));
    const why = level === "cleared" ? [...files].map(([file, fh]) => ({ label: label(file), reason: [...new Set(fh.map((h) => REASON[cleared.get(h.id)!.reason]))].join(", ") })) : [];
    return [{ title: step.title, explain: step.explain, level, lines: hs.reduce((n, h) => n + h.changed, 0), places, spots: mine, why }];
  });
}

const LEVEL = { verify: "Verify", skim: "Skim", cleared: "Cleared" } as const;

/** The walkthrough as markdown: a heading with the counts, then each step in order. */
export function walkthroughSection(steps: WalkStep[], spots: { threadUrl?: string }[]): string[] {
  const count = (l: Level) => steps.filter((s) => s.level === l).length;
  const parts = [`${n(steps.length, "step")}`, ...(["verify", "skim", "cleared"] as const).filter((l) => count(l)).map((l) => (l === "cleared" ? `${count(l)} cleared` : `${count(l)} to ${l}`))];
  const out = [`#### Walkthrough · ${parts.join(" · ")}`, ""];
  steps.forEach((s, i) => {
    const threads = s.spots.map((x) => spots[x]?.threadUrl).filter((u): u is string => !!u);
    const how = s.level === "verify"
      ? `**Verify**${threads.length ? ` in ${threads.length === 1 ? `[its thread](${threads[0]})` : threads.map((u, k) => `[thread ${k + 1}](${u})`).join(", ")}` : ""}`
      : s.level === "cleared" ? `Cleared: ${s.why.map((w) => (s.why.length > 1 ? `\`${w.label}\` ${w.reason.toLowerCase()}` : w.reason)).join("; ")}` : "Skim";
    out.push(
      `**${i + 1}. ${cell(s.title)}** · ${how}`,
      cell(s.explain),
      `<sub>${s.places.slice(0, 6).map(where).join(" · ")}${s.places.length > 6 ? ` · and ${n(s.places.length - 6, "more file")}` : ""} · ${n(s.lines, "line")}</sub>`,
      "",
    );
  });
  return out;
}
