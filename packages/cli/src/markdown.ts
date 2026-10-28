// Vera's review as a GitHub comment, action first (Nahuel's call, 28 Oct
// 2026): who has to sign off, then where to look, then how Vera decided,
// folded away. The hidden marker lets a later run find and update the same
// comment; the hidden plan and the status block let a sign-off update it
// without running the agents again.

import { createHash } from "node:crypto";
import { totals } from "@vera/core";
import { signoff, type Signoff } from "@vera/rules";
import type { Review } from "./review.ts";
import { planMarker, statusBlock } from "./signoff.ts";

export const MARKER = "<!-- vera-review -->";

const ACTION = { ask: "ask", "ask-lead": "ask, as lead (Vera isn't sure who should review)", suggest: "possible owner (Vera isn't sure)" } as const;
const RISK = { high: "High", medium: "Medium", low: "Low" } as const;
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
/** Model-written text goes in as text: no HTML, so it can't open a <details> or hide a marker. */
const plain = (s: string) => s.replace(/</g, "&lt;");

/** A link to the lines in the PR's "Files changed" view, which anchors each
 * file by the SHA-256 of its path and each line by R<number>. */
function linesLink(r: Review, file: string, lines: string): string | null {
  if (!r.pull.files.some((f) => f.path === file)) return null;
  const { owner, repo, number } = r.pull.ref;
  const first = /\d+/.exec(lines)?.[0];
  return `https://github.com/${owner}/${repo}/pull/${number}/files#diff-${createHash("sha256").update(file).digest("hex")}${first ? `R${first}` : ""}`;
}

export function toMarkdown(r: Review, s: Signoff = signoff(r.plan.asks, r.pull.author, [])): string {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const owners = r.ownership.source === "none" ? "nothing declared (no `.vera.yml` or CODEOWNERS)" : `\`${r.ownership.source}\``;
  const lines = [MARKER, planMarker(r.plan.asks), statusBlock(s, r.plan.asks), ""];

  if (r.plan.asks.length) lines.push("Sign off by approving, or comment `/vera sign-off` (add a role, like `/vera sign-off design`, for just that one).", "");
  else lines.push(...(r.plan.notes.length ? r.plan.notes : ["Vera couldn't name anyone for this change."]).map((n) => `> ${n}`), "");

  lines.push("#### Where to look first", "");
  if (!r.brief) lines.push("_The Briefer gave no answer this time._");
  else {
    if (r.brief.summary) lines.push(`_${plain(r.brief.summary)}_`, "");
    r.brief.places.forEach((p, i) => {
      const label = `\`${p.file}\` ${p.lines.startsWith("L") ? p.lines : `L${p.lines}`}`;
      const url = linesLink(r, p.file, p.lines);
      lines.push(`${i + 1}. **${RISK[p.risk]}** · ${url ? `[${label}](${url})` : label}  `, `   ${plain(sentence(p.what))} ${plain(p.why)}`);
    });
  }

  lines.push(
    "",
    "<details><summary>How Vera decided</summary>",
    "",
    `${r.pull.files.length} ${r.pull.files.length === 1 ? "file" : "files"}, +${add} −${del}${r.ai.length ? ` · likely AI-written: ${r.ai.join("; ")}` : ""} · owners from ${owners}`,
    "",
    "**What it touches**",
    ...(!r.areas ? ["- (no answer)"] : r.areas.teams.length ? r.areas.teams.map((a) => `- **${a.team}** (${a.confidence}): ${a.reason}`) : ["- None of the declared areas fit this change."]),
    "",
    `**Design decision:** ${r.design ? `${r.design.visible ? "yes" : "no"} (${r.design.confidence}). ${r.design.what}` : "(no answer)"}`,
    "",
    "**Who was asked, and why**",
    ...(r.plan.asks.length ? r.plan.asks.map((a) => `- ${a.who}, ${a.role}: ${ACTION[a.action]}. ${sentence(a.why)}`) : ["- Nobody named."]),
    ...(r.plan.asks.length && r.plan.notes.length ? ["", ...r.plan.notes.map((n) => `> ${n}`)] : []),
    "",
    "</details>",
    "",
    `<sub>Vera reads and suggests: it never approves, blocks or changes the code. $${t.costUsd.toFixed(3)} · ${t.modelCalls} model calls · ${(t.latencyMs / 1000).toFixed(1)} s · [What is Vera?](https://vera-agent.vercel.app)</sub>`,
  );
  return lines.join("\n");
}
