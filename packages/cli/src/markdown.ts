// Vera's review as a GitHub comment: the change in a sentence, the likely-AI
// flag, then a block per person with what they sign off, where to look and
// their questions (Nahuel's call, 5 Nov 2026); how Vera decided is folded away.
// The hidden marker lets a later run find and update the same comment; the
// hidden plan and the status block let a sign-off update it without running
// the agents again.

import { createHash } from "node:crypto";
import { totals } from "@vera/core";
import { checkerFor, DOCS, signoff, type Signoff } from "@vera/rules";
import type { Review } from "./review.ts";
import { aiFlag } from "./dots.ts";
import { briefMarker, labels, type Brief } from "./people.ts";
import { planMarker, spotRow, statusBlock } from "./signoff.ts";
import { examMarker, type Understanding } from "./understanding.ts";
import type { Seal } from "./sealed.ts";
import { headline, sections, verifyView } from "./verify.ts";
import { answers } from "./threads.ts";
import type { Sent } from "./slack.ts";
import type { LineComment } from "@vera/tools/github";

export const MARKER = "<!-- vera-review -->";

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
/** Model-written text goes in as text: no HTML outside code spans, so it can't open a
 * <details> or hide a marker (inside backticks GitHub shows "<" as it is); one line, so
 * it stays on its line. */
const plain = (s: string) => s.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;"))).join("").replace(/\s*\n\s*/g, " ");

/** A link to the lines in the PR's "Files changed" view, which anchors each
 * file by the SHA-256 of its path and each line by R<number>. */
function linesLink(r: Review, file: string, lines: string): string | null {
  if (!r.pull.files.some((f) => f.path === file)) return null;
  const { owner, repo, number } = r.pull.ref;
  const first = /\d+/.exec(lines)?.[0];
  return `https://github.com/${owner}/${repo}/pull/${number}/files#diff-${createHash("sha256").update(file).digest("hex")}${first ? `R${first}` : ""}`;
}

/** With Verify: the comments on the code, and each spot's thread (by the brief's order). */
/** `sent`: which Slack message went to whom (slack.ts), so an answer from Slack counts only from there. */
export type Threads = { comments: LineComment[]; ids: (number | null)[]; app?: string; sent?: Sent };

/** The brief the blocks per person are drawn from: each place goes to the engineers who check it. */
export function briefOf(r: Review, threads?: Threads): Brief {
  const label = labels(r.brief?.places.map((p) => p.file) ?? []);
  return {
    spots: (r.brief?.places ?? []).map((p, i) => {
      const id = threads?.ids[i];
      const url = id ? threads!.comments.find((c) => c.id === id)?.url : undefined;
      return { ...p, label: label.get(p.file)!, url: linesLink(r, p.file, p.lines), who: checkerFor(r.ownership, r.plan.asks, p.file), ...(id ? { thread: id } : {}), ...(url ? { threadUrl: url } : {}) };
    }),
    design: r.design?.visible ? r.design.what : null,
    docs: r.pull.files.map((f) => f.path).filter((f) => DOCS.test(f)),
    ...(r.brief?.summary ? { summary: r.brief.summary } : {}),
    ...(r.ai.length ? { ai: r.ai } : {}),
    ...(r.triage ? { verify: true, ...(r.triage.about ? { about: r.triage.about } : {}) } : {}),
  };
}

/** Vera's mark and name at the top of the comment, light and dark. */
const HEADER = `<picture><source media="(prefers-color-scheme: dark)" srcset="https://vera-agent.vercel.app/brand/vera-lockup-on-dark.png"><img src="https://vera-agent.vercel.app/brand/vera-lockup.png" height="26" alt="Vera"></picture>`;

/** `seal` signs the hidden records (sealed.ts) and seals what a good answer covers (understanding.ts).
 * `threads`: with Verify, the spots' threads on the code and the answers in them. */
export function toMarkdown(r: Review, seal: Seal, s: Signoff = signoff(r.plan.asks, r.pull.author, []), u?: Understanding, threads?: Threads): string {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const owners = r.ownership.source === "none" ? "nothing declared (no `.vera.yml` or CODEOWNERS)" : `\`${r.ownership.source}\``;
  const exam = r.exam;
  const brief = briefOf(r, threads);
  const every = labels(r.pull.files.map((f) => f.path));
  const v = r.triage ? verifyView(r.triage.hunks, r.triage.skips, brief.spots, (f) => every.get(f) ?? f, (f, line) => linesLink(r, f, String(line))) : null;
  const lines = [MARKER, planMarker(r.plan.asks, seal), ...(exam ? [examMarker(exam.questions, exam.why, seal)] : []), briefMarker(brief, seal), ""];

  if (v) lines.push(HEADER, "");
  if (!r.brief) lines.push("_The Briefer gave no answer this time._");
  else if (r.brief.summary) lines.push(`_${plain(r.brief.summary)}_`);
  if (v) lines.push("", headline(v, brief.spots.length));
  if (brief.about) lines.push("", `**What this change does:** ${plain(brief.about)}`);
  if (r.ai.length) lines.push("", `> ${aiFlag()} ${plain(sentence(r.ai.join(", ")))}`);

  const view = { brief, exam: exam ? { questions: exam.questions.map((q) => q.question), why: exam.why } : null, ...(threads ? { status: answers(brief.spots, threads.comments, threads.app, threads.sent).status } : {}) };
  lines.push("", statusBlock(s, r.plan.asks, seal, u, {}, view), "");
  // With no engineer asked, the places have nobody's block to sit in.
  const unclaimed = brief.spots.filter((p) => !p.who.length);
  if (unclaimed.length) lines.push("###### WHERE TO LOOK", "", "| Look at | Why |", "|---|---|", ...unclaimed.map(spotRow), "");
  if (v && r.plan.asks.some((a) => a.role === "engineer") && brief.spots.length) lines.push("<sub>Answer each spot in its thread on the code: ✓ when you've checked it, a question for Vera, or a suggested change for the author. ✓ on all of yours signs you off as engineer. Approving, or commenting `/vera sign-off`, still works.</sub>");
  else if (r.plan.asks.length) lines.push("<sub>Sign off by approving, or comment `/vera sign-off` (add a role, like `/vera sign-off design`, for just that one).</sub>");
  else lines.push(...(r.plan.notes.length ? r.plan.notes : ["Vera couldn't name anyone for this change."]).map((n) => `> ${n}`));

  if (v) lines.push("", ...sections(v).slice(0, -1));
  lines.push(
    "",
    "<details><summary>How Vera decided</summary>",
    "",
    `${r.pull.files.length} ${r.pull.files.length === 1 ? "file" : "files"}, +${add} −${del}${r.ai.length ? ` · likely AI-written: ${r.ai.join("; ")}` : ""} · owners from ${owners}`,
    "",
    "**Areas**",
    ...(!r.areas ? ["- (no answer)"] : r.areas.teams.length ? r.areas.teams.map((a) => `- **${a.team}** (${a.confidence}): ${a.reason}`) : ["- None of the declared areas fit this change."]),
    "",
    `**Design decision:** ${r.design ? `${r.design.visible ? "yes" : "no"} (${r.design.confidence}). ${r.design.what}` : "(no answer)"}`,
    ...(r.plan.asks.length && r.plan.notes.length ? ["", ...r.plan.notes.map((n) => `> ${n}`)] : []),
    "",
    "</details>",
    "",
    `<sub>Vera reads and suggests: it never approves, blocks or changes the code. $${t.costUsd.toFixed(3)} · ${t.modelCalls} model calls · ${(t.latencyMs / 1000).toFixed(1)} s · [What is Vera?](https://vera-agent.vercel.app)</sub>`,
  );
  return lines.join("\n");
}
