// Each spot to verify is a thread on its lines (Nahuel's calls, 25 Nov 2026).
// Reviewers answer in the thread: ✓ to verify, a question for Vera to answer,
// or a suggested change for the author. Someone is signed off as engineer
// once every spot of theirs has their ✓ as their latest answer.
//
// The answers are GitHub's own replies, so GitHub says who wrote each one:
// nothing Vera keeps hidden decides who verified what.

import { slackAnswerer, type SignoffEvent } from "@vera/rules";
import type { FileHunk } from "@vera/agents/triage";
import type { LineComment, NewLineComment } from "@vera/tools/github";
import type { Spot } from "./people.ts";
import { span } from "./verify.ts";
import { sentHere } from "./signoff.ts";
import type { Sent } from "./slack.ts";

export type Verdict = "verified" | "change" | "question" | null;
export type SpotStatus = { verified: string[]; change: string[]; asked: boolean };

const MARK = "<!-- vera-spot -->";
// How far (in lines) an old thread can sit from a spot and still be reused for it.
const NEAR = 3;
const handle = (who: string) => who.replace(/^@/, "").toLowerCase();
const isBot = (who: string) => who.endsWith("[bot]");

/** Where a spot's thread goes: its lines, kept inside one hunk of the diff (GitHub only
 * takes comments on lines the diff shows), or null when none of them are. */
export function placement(spot: { file: string; lines: string }, hunks: FileHunk[]): { line: number; start?: number } | null {
  const at = span(spot.lines);
  if (!at) return null;
  const h = hunks.find((x) => x.path === spot.file && x.start <= at[1] && at[0] <= x.end);
  if (!h) return null;
  const start = Math.max(at[0], h.start);
  const line = Math.min(at[1], h.end);
  return start < line ? { line, start } : { line };
}

const ROLE = { high: "High", medium: "Medium", low: "Low" } as const;
/** Model-written text as plain text on one line. */
const plain = (s: string) => s.replace(/</g, "&lt;").replace(/\s*\n\s*/g, " ").trim();
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? plain(s) : `${plain(s)}.`);

export function threadBody(spot: Spot, k: number, n: number): string {
  const who = spot.who.length ? ` · for ${spot.who.join(", ")}` : "";
  return [
    MARK,
    `**Verify ${k} of ${n}** · ${ROLE[spot.risk]} risk${who}`,
    "",
    `${sentence(spot.what)} ${sentence(spot.why)}`,
    "",
    "<sub>Reply ✓ when you've checked it · ask a question and Vera answers · or suggest the change (the ± button) for the author.</sub>",
  ].join("\n");
}

/** Threads Vera started before, on lines the new spot still covers, are reused, so a push
 * doesn't lose the conversation. Returns each spot's thread id, or null when it needs one. */
export function reuse(spots: Spot[], comments: LineComment[]): (number | null)[] {
  const roots = comments.filter((c) => !c.replyTo && isBot(c.who) && c.body.includes(MARK) && c.line !== null);
  const taken = new Set<number>();
  return spots.map((s) => {
    const at = span(s.lines);
    const hit = at && roots.find((r) => !taken.has(r.id) && r.path === s.file && r.line! >= at[0] - NEAR && r.line! <= at[1] + NEAR);
    if (!hit) return null;
    taken.add(hit.id);
    return hit.id;
  });
}

/** The threads to start for spots without one. */
export function newThreads(spots: Spot[], hunks: FileHunk[], ids: (number | null)[]): (NewLineComment & { spot: number })[] {
  return spots.flatMap((s, i) => {
    if (ids[i] !== null && ids[i] !== undefined) return [];
    const at = placement(s, hunks);
    return at ? [{ spot: i, path: s.file, line: at.line, ...(at.start ? { start: at.start } : {}), body: threadBody(s, i + 1, spots.length) }] : [];
  });
}

/** What a reply says: ✓ (verified), a suggested change, a question, or nothing Vera acts on. */
export function verdict(body: string): Verdict {
  const text = body.split("\n").filter((l) => !l.trimStart().startsWith(">") && !/^\s*<!--.*-->\s*$/.test(l)).join("\n").trim();
  if (/```suggestion/.test(text)) return "change";
  const first = text.split("\n")[0]!.trim().toLowerCase();
  if (/^(✓|✔|✅|👍|\+1\b|verified\b|lgtm\b|looks good\b|looks right\b|ok\b|okay\b)/u.test(first) && !text.includes("?")) return "verified";
  if (/^(needs a change|please change|change (this|it|to)\b|should be\b)/.test(first)) return "change";
  if (text.includes("?") || /^(explain|why|what|how|can you|could you)\b/.test(first) || /^\*\*[\w-]+\*\* asked in slack:/.test(first)) return "question";
  return null;
}

/** Answers from Slack, posted by the team's GitHub App (`app`), as the person who gave them:
 * only from the Slack conversation Vera's signed record (`sent`) has for that person, since
 * the server reads who a message went to from a comment anyone with write access can edit.
 * Any other stays the app's own reply, which isn't anyone's answer. */
function fromSlack(comments: LineComment[], app: string | undefined, sent: Sent): LineComment[] {
  if (!app) return comments;
  return comments.map((c) => {
    const a = slackAnswerer(c.who, c.body, app);
    return a && sentHere(sent, a.who, a.channel) ? { ...c, who: a.who, trusted: false } : c;
  });
}

/** Each spot's answers so far, and who has verified all of theirs (handle → when).
 * `app`: the team's GitHub App for Slack (the `slack-app` input); `sent`: which Slack message
 * went to whom, as Vera signed it (slack.ts). */
export function answers(spots: Spot[], all: LineComment[], app?: string, sent: Sent = {}): { status: SpotStatus[]; verified: Record<string, string> } {
  const comments = fromSlack(all, app, sent);
  const latest = new Map<string, { v: "verified" | "change"; at: string }>();
  const status = spots.map((s, i) => {
    const out: SpotStatus = { verified: [], change: [], asked: false };
    if (!s.thread) return out;
    const mine = new Set(s.who.map(handle));
    for (const c of comments.filter((x) => x.replyTo === s.thread && !isBot(x.who)).sort((a, b) => a.at.localeCompare(b.at))) {
      const v = verdict(c.body);
      if (v === "question") out.asked = true;
      if ((v === "verified" || v === "change") && mine.has(handle(c.who))) latest.set(`${i}:${handle(c.who)}`, { v, at: c.at });
    }
    for (const who of mine) {
      const l = latest.get(`${i}:${who}`);
      if (l?.v === "verified") out.verified.push(who);
      if (l?.v === "change") out.change.push(who);
    }
    return out;
  });
  const verified: Record<string, string> = {};
  for (const who of new Set(spots.flatMap((s) => s.who.map(handle)))) {
    const theirs = spots.map((s, i) => [s, i] as const).filter(([s]) => s.thread && s.who.some((w) => handle(w) === who));
    if (theirs.length && theirs.every(([, i]) => status[i]!.verified.includes(who))) {
      verified[who] = theirs.map(([, i]) => latest.get(`${i}:${who}`)!.at).sort().at(-1)!;
    }
  }
  return { status, verified };
}

/** Each person who verified all their spots, as an engineer sign-off at the time of their last ✓. */
export function verifiedEvents(verified: Record<string, string>, comments: LineComment[]): (SignoffEvent & { at: string })[] {
  return Object.entries(verified).map(([who, at]) => ({
    kind: "comment" as const, who, roles: ["engineer" as const], at,
    trusted: comments.some((c) => handle(c.who) === who && c.trusted),
  }));
}
