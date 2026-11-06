// The "Vera: sign-off" check. Vera's comment carries who it asked, hidden,
// so when someone approves or comments `/vera sign-off`, this re-reads it and
// updates the check without running the agents again. Grading answers to
// the understanding check is the only model call on this path.

import { parseSignoff, signoff, slackSigner, type Ask, type Signoff, type SignoffEvent } from "@vera/rules";
import type { Check, Comment, PullReview } from "@vera/tools/github";
import { dot } from "./dots.ts";
import { people, type Brief, type Spot } from "./people.ts";
import { describe, gradesMarker, type Grades, type Understanding } from "./understanding.ts";

export const CHECK = "Vera: sign-off";
const PLAN = /<!-- vera-plan:([A-Za-z0-9+/=]*) -->/;

/** Base64 keeps handles and reasons from ending the HTML comment early. */
export const planMarker = (asks: Ask[]) => `<!-- vera-plan:${Buffer.from(JSON.stringify(asks)).toString("base64")} -->`;

export function readPlan(body: string): Ask[] | null {
  const m = PLAN.exec(body);
  if (!m) return null;
  try {
    const asks = JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8")) as unknown;
    return Array.isArray(asks) ? (asks as Ask[]) : null;
  } catch {
    return null;
  }
}

/** Sign-offs posted from Slack by the team's GitHub App (its slug, the
 * `slack-app` input), as if the person had commented themselves. The server
 * only posts them for someone Vera messaged, for roles they're asked for.
 * `trusted` stays false: GitHub hasn't said this person can write to the
 * repo, so a Slack sign-off never counts for a team's part. Without the
 * input, or from anyone else, they're ordinary comments. */
export function fromSlack(comments: Comment[], app: string | undefined): Comment[] {
  if (!app) return comments;
  return comments.map((c) => {
    const who = slackSigner(c.who, c.body, app);
    return who ? { ...c, who, trusted: false } : c;
  });
}

/** Reviews and sign-off comments in the order they happened. Vera's own
 * comment is skipped (it explains the command). */
export function events(reviews: PullReview[], comments: Comment[], marker: string): SignoffEvent[] {
  const timed: (SignoffEvent & { at: string })[] = [
    ...reviews.map((r) => ({ kind: "review" as const, who: r.who, state: r.state, trusted: r.trusted, at: r.at })),
    ...comments.flatMap((c) => {
      const roles = c.body.includes(marker) ? null : parseSignoff(c.body);
      return roles ? [{ kind: "comment" as const, who: c.who, roles, trusted: c.trusted, at: c.at }] : [];
    }),
  ];
  return timed.sort((a, b) => a.at.localeCompare(b.at)).map(({ at: _, ...e }) => e);
}

const HOW = "**To sign off:** approve the pull request, or comment `/vera sign-off`. To sign off for one role only, name it: `/vera sign-off design`. Requesting changes takes a sign-off back.";

/** The engineer's understanding, shown next to their sign-off. */
const withUnderstanding = (r: Signoff["roles"][number], u?: Understanding) => (u && r.by && r.role === "engineer" ? ` · ${describe(u)}` : "");

export function toCheck(s: Signoff, u?: Understanding): Check {
  if (!s.roles.length) {
    return { conclusion: "neutral", title: "Nobody to sign off", summary: "Vera didn't name anyone to ask about this change (its comment says why), so there's nothing to sign off." };
  }
  const who = (r: Signoff["roles"][number]) => `${r.by}${r.byAuthor ? " (author)" : ""}`;
  const waiting = s.roles.filter((r) => !r.by);
  const title = s.done
    ? `Signed off: ${s.roles.map((r) => `${r.role} by ${who(r)}`).join(", ")}`
    : `Waiting on ${waiting.length} of ${s.roles.length}: ${waiting.map((r) => `${r.role} (${r.asked.join(", ")})`).join(", ")}`;
  const summary = [
    "| Role | Asked | Signed off |",
    "|---|---|---|",
    ...s.roles.map((r) => `| ${r.role} | ${r.asked.join(", ")} | ${r.by ? `✓ ${who(r)}${withUnderstanding(r, u)}` : "waiting"} |`),
    "",
    HOW,
    ...(u ? ["", `**Understanding check:** ${u.questions} ${u.questions === 1 ? "question" : "questions"} for the engineer, answered where they sign off.`, ...u.reasons.map((x, n) => `${n + 1}. ${x}`)] : []),
    "",
    "This check is information only: it doesn't block merging.",
  ].join("\n");
  return { conclusion: s.done ? "success" : "neutral", title: title.length > 200 ? `${title.slice(0, 197)}...` : title, summary };
}

export const status = (asks: Ask[], author: string, reviews: PullReview[], comments: Comment[], marker: string) =>
  signoff(asks, author, events(reviews, comments, marker));

// Who signs off, one block per person (people.ts): their roles and where
// each stands, what to look at, and their questions. It sits between these
// markers so a sign-off can redraw it without a new review.
const OPEN = "<!-- vera-status -->";
const CLOSE = "<!-- /vera-status -->";
const AS = { ask: "", "ask-lead": " (as lead)", suggest: " (possible owner)" } as const;
const ROLE = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
const RISK = { high: "High", medium: "Medium", low: "Low" } as const;
/** Model-written text: one line, no HTML outside code spans (as in markdown.ts). */
const text = (s: string) => s.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;"))).join("").replace(/\s*\n\s*/g, " ");
/** The same in a table cell, where a pipe would end the cell. */
const cell = (s: string) => text(s).replace(/\|/g, "\\|");
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const MAX_DOCS = 5;

/** What the blocks show besides the sign-offs. Without it (a comment from
 * before v0.6.0) each block is just the person and their roles. */
export type View = { brief: Brief; exam: { questions: string[]; why: string } | null };

export function spotRow(p: Spot): string {
  const at = p.lines.startsWith("L") ? p.lines : `L${p.lines}`;
  const where = p.url ? `[\`${p.label}\` ${cell(at)}](${p.url} "${p.file}")` : `\`${p.label}\` ${cell(at)}`;
  return `| ${dot(p.risk, RISK[p.risk])} ${where} · ${cell(sentence(p.what))} | ${cell(sentence(p.why))} |`;
}

export function statusBlock(s: Signoff, asks: Ask[], u?: Understanding, grades: Grades = {}, view?: View): string {
  const left = s.roles.filter((r) => !r.by).length;
  const heading = !s.roles.length ? "nobody to ask"
    : !left ? "done"
    : `waiting on ${left} of ${s.roles.length}`;
  const brief = view?.brief ?? { spots: [], design: null, docs: [] };
  const blocks = people(asks, brief, view?.exam?.questions ?? []).map((p) => {
    // One line per role (GitHub breaks comment lines where they break here).
    const roles = p.asks.map((a) => {
      const r = s.roles.find((x) => x.role === a.role);
      const someoneElse = r?.by && r.by.toLowerCase() !== p.who.toLowerCase();
      const state = r?.by ? `signed off${someoneElse ? ` by ${r.by}` : ""}${r.byAuthor ? " (author)" : ""}${r ? withUnderstanding(r, u) : ""}` : "waiting";
      const mark = r?.by ? dot("done", "Signed off") : dot("low", "Waiting");
      return `${mark} **${ROLE(a.role)}**${AS[a.action]} · ${state}${a.why ? ` · ${a.why.replace(/\.$/, "")}` : ""}`;
    });
    const docs = p.docs.slice(0, MAX_DOCS).map((f) => `\`${f}\``).join(", ") + (p.docs.length > MAX_DOCS ? ` and ${p.docs.length - MAX_DOCS} more` : "");
    const rows = [
      ...p.spots.map(spotRow),
      ...(p.design ? [`| **The design:** ${cell(sentence(p.design))} | Vera can't see screens yet, so it can't point at places for design. |`] : []),
      ...(p.docs.length ? [`| **The docs:** ${docs} | Documentation changed. |`] : []),
    ];
    // Once the engineer has signed off, the result shows on their line instead.
    const answered = !!s.roles.find((r) => r.role === "engineer")?.by;
    const exam = p.questions.length && view?.exam && !answered ? [
      "",
      "**Before you sign off**",
      "",
      ...p.questions.map((q, i) => `${i + 1}. ${text(q)}`),
      "",
      `<sub>Asked because ${view.exam.why}. Answer where you sign off, numbered: in your approval or under \`/vera sign-off\`. A sentence or two each; Vera shows the result next to your sign-off and never blocks the merge.</sub>`,
    ] : [];
    return ["", `#### ${p.who}`, "", ...roles, ...(rows.length ? ["", "| Look at | Why |", "|---|---|", ...rows] : []), ...exam];
  });
  const kept = Object.keys(grades).length ? [gradesMarker(grades)] : [];
  return [OPEN, ...kept, `###### WHO SIGNS OFF · ${heading.toUpperCase()}`, ...blocks.flat(), CLOSE].join("\n");
}

/** Vera's comment with its status block swapped for a fresh one, or null if it has none. */
export function withStatus(body: string, block: string): string | null {
  const start = body.indexOf(OPEN);
  const end = body.indexOf(CLOSE);
  return start >= 0 && end > start ? body.slice(0, start) + block + body.slice(end + CLOSE.length) : null;
}
