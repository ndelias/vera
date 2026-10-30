// Vera's review as a GitHub comment, laid out like the mock-up on the site
// (Nahuel's call, 30 Oct 2026): what the change touches, the likely-AI flag,
// the questions, then who has to sign off; how Vera decided is folded away.
// The hidden marker lets a later run find and update the same comment; the
// hidden plan and the status block let a sign-off update it without running
// the agents again.

import { createHash } from "node:crypto";
import { totals } from "@vera/core";
import { checkerFor, signoff, type Signoff } from "@vera/rules";
import type { Review } from "./review.ts";
import { aiFlag, dot } from "./dots.ts";
import { planMarker, statusBlock } from "./signoff.ts";
import { examMarker, type Understanding } from "./understanding.ts";

export const MARKER = "<!-- vera-review -->";

const RISK = { high: "High", medium: "Medium", low: "Low" } as const;
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

/** `secret` seals what a good answer covers (see understanding.ts); without one, the questions aren't posted. */
export function toMarkdown(r: Review, s: Signoff = signoff(r.plan.asks, r.pull.author, []), secret?: string, u?: Understanding): string {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const owners = r.ownership.source === "none" ? "nothing declared (no `.vera.yml` or CODEOWNERS)" : `\`${r.ownership.source}\``;
  const exam = r.exam && secret ? r.exam : null;
  const lines = [MARKER, planMarker(r.plan.asks), ...(exam ? [examMarker(exam.questions, exam.why, secret!)] : []), "", "###### WHAT THIS TOUCHES", ""];

  if (!r.brief) lines.push("_The Briefer gave no answer this time._");
  else {
    if (r.brief.summary) lines.push(`_${plain(r.brief.summary)}_`, "");
    for (const p of r.brief.places) {
      // A linked place shows the file's name; the link and its hover text carry the full path.
      const at = p.lines.startsWith("L") ? p.lines : `L${p.lines}`;
      const url = linesLink(r, p.file, p.lines);
      const where = url ? `[\`${p.file.split("/").pop()}\` ${at}](${url} "${p.file}")` : `\`${p.file}\` ${plain(at)}`;
      const who = checkerFor(r.ownership, r.plan.asks, p.file).join(" or ");
      // Two lines, as the mock-up's place and its grey detail; GitHub breaks comment lines where they break here.
      lines.push(
        `${dot(p.risk, RISK[p.risk])} ${where} · ${plain(sentence(p.what))}`,
        `<sub>${plain(sentence(p.why))}${who ? ` · ${who} checks this` : ""}</sub>`,
        "",
      );
    }
  }
  if (r.ai.length) lines.push(`> ${aiFlag()} ${plain(sentence(r.ai.join(", ")))}`);

  if (exam) {
    const engineers = [...new Set(r.plan.asks.filter((a) => a.role === "engineer").map((a) => a.who))].join(" or ");
    lines.push(
      "",
      "###### BEFORE YOU SIGN OFF",
      "",
      ...exam.questions.map((q, i) => `${i + 1}. ${plain(q.question)}`),
      "",
      `<sub>For ${engineers}, because ${exam.why}. Answer where you sign off, numbered: in your approval or under \`/vera sign-off\`. A sentence or two each; Vera shows the result next to your sign-off and never blocks the merge.</sub>`,
    );
  }

  lines.push("", statusBlock(s, r.plan.asks, u), "");
  if (r.plan.asks.length) lines.push("<sub>Sign off by approving, or comment `/vera sign-off` (add a role, like `/vera sign-off design`, for just that one).</sub>");
  else lines.push(...(r.plan.notes.length ? r.plan.notes : ["Vera couldn't name anyone for this change."]).map((n) => `> ${n}`));

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
