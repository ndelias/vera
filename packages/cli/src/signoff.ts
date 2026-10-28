// The "Vera: sign-off" check. Vera's comment carries who it asked, hidden,
// so when someone approves or comments `/vera sign-off`, this re-reads it and
// updates the check without running the agents again: no API key, no cost.

import { parseSignoff, signoff, type Ask, type Signoff, type SignoffEvent } from "@vera/rules";
import type { Check, Comment, PullReview } from "@vera/tools/github";

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

export function toCheck(s: Signoff): Check {
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
    ...s.roles.map((r) => `| ${r.role} | ${r.asked.join(", ")} | ${r.by ? `✓ ${who(r)}` : "waiting"} |`),
    "",
    HOW,
    "",
    "This check is information only: it doesn't block merging.",
  ].join("\n");
  return { conclusion: s.done ? "success" : "neutral", title: title.length > 200 ? `${title.slice(0, 197)}...` : title, summary };
}

export const status = (asks: Ask[], author: string, reviews: PullReview[], comments: Comment[], marker: string) =>
  signoff(asks, author, events(reviews, comments, marker));
