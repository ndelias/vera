// Vera's comment, one block per person (Nahuel's call, 5 Nov 2026): what
// each person is asked for, what they should look at, and their questions,
// together, so nobody has to piece their part together from three lists.
// Slack (M6) sends each person the same block. What the blocks need is kept
// hidden in the comment, so a sign-off redraws them without the agents.

import type { Ask } from "@vera/rules";

export type Risk = "high" | "medium" | "low";
/** A place from the engineer's brief, with who checks it and its link. */
export type Spot = { file: string; label: string; lines: string; url: string | null; what: string; why: string; risk: Risk; who: string[] };
/** Everything the blocks show besides the sign-offs. `design` is the design call's description when there is one. */
export type Brief = { spots: Spot[]; design: string | null; docs: string[] };
export type Person = { who: string; asks: Ask[]; spots: Spot[]; design: string | null; docs: string[]; questions: string[] };

const BRIEF = /<!-- vera-brief:([A-Za-z0-9+/=]*) -->/;

export const briefMarker = (b: Brief) => `<!-- vera-brief:${Buffer.from(JSON.stringify(b)).toString("base64")} -->`;

export function readBrief(body: string): Brief | null {
  const m = BRIEF.exec(body);
  if (!m) return null;
  try {
    const b = JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8")) as Brief;
    return Array.isArray(b.spots) && Array.isArray(b.docs) ? b : null;
  } catch {
    return null;
  }
}

/** The shortest end of each path that tells it apart from the others:
 * three piece.ts files become hold/piece.ts, spring/piece.ts and dither/piece.ts. */
export function labels(files: string[]): Map<string, string> {
  const unique = [...new Set(files)];
  const tail = (f: string, n: number) => f.split("/").slice(-n).join("/");
  return new Map(unique.map((f) => {
    let n = 1;
    while (n < f.split("/").length && unique.some((g) => g !== f && tail(g, n) === tail(f, n))) n++;
    return [f, tail(f, n)];
  }));
}

/** One entry per person asked, in the order they were asked: their roles,
 * the places they check (engineers), the design call (designers), the
 * changed docs (docs) and the questions (engineers). */
export function people(asks: Ask[], brief: Brief, questions: string[]): Person[] {
  const order = [...new Set(asks.map((a) => a.who))];
  return order.map((who) => {
    const mine = asks.filter((a) => a.who === who);
    const is = (role: string) => mine.some((a) => a.role === role);
    return {
      who,
      asks: mine,
      spots: is("engineer") ? brief.spots.filter((s) => s.who.includes(who)) : [],
      design: is("design") ? brief.design : null,
      docs: is("docs") ? brief.docs : [],
      questions: is("engineer") ? questions : [],
    };
  });
}
