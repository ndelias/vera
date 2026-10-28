// Vera's review as a GitHub comment. The hidden marker lets a later run find
// and update the same comment instead of adding another; the hidden plan
// lets the sign-off check be updated without running the agents again.

import { totals } from "@vera/core";
import type { Review } from "./review.ts";
import { planMarker } from "./signoff.ts";

export const MARKER = "<!-- vera-review -->";

const ACTION = { ask: "ask", "ask-lead": "ask, as lead (Vera isn't sure who should review)", suggest: "possible owner (Vera isn't sure)" } as const;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function toMarkdown(r: Review): string {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const owners = r.ownership.source === "none" ? "nothing declared (no `.vera.yml` or CODEOWNERS)" : `\`${r.ownership.source}\``;
  const lines = [
    MARKER,
    planMarker(r.plan.asks),
    "### Vera's review",
    "",
    `${r.pull.files.length} ${r.pull.files.length === 1 ? "file" : "files"}, +${add} −${del}${r.ai.length ? ` · likely AI-written: ${r.ai.join("; ")}` : ""} · owners from ${owners}`,
    "",
    "**What it touches**",
    ...(!r.areas ? ["- (no answer)"] : r.areas.teams.length ? r.areas.teams.map((a) => `- **${a.team}** (${a.confidence}): ${a.reason}`) : ["- None of the declared areas fit this change."]),
    "",
    `**Design decision:** ${r.design ? `${r.design.visible ? "yes" : "no"} (${r.design.confidence}). ${r.design.what}` : "(no answer)"}`,
    "",
    "**Who to ask**",
  ];
  if (r.plan.asks.length) {
    lines.push("", "| Who | Role | | Why |", "|---|---|---|---|", ...r.plan.asks.map((a) => `| ${cell(a.who)} | ${a.role} | ${ACTION[a.action]} | ${cell(a.why)} |`),
      "", "To sign off, approve the pull request or comment `/vera sign-off` (add a role, like `/vera sign-off design`, for just that one). The **Vera: sign-off** check shows who still needs to.");
  } else lines.push("Nobody named.");
  if (r.plan.notes.length) lines.push("", ...r.plan.notes.map((n) => `> ${n}`));
  lines.push("", `<sub>Vera only reads and suggests: it doesn't approve, block or change anything. $${t.costUsd.toFixed(3)} · ${t.modelCalls} model calls · ${(t.latencyMs / 1000).toFixed(1)} s · [What is Vera?](https://vera-agent.vercel.app)</sub>`);
  return lines.join("\n");
}
