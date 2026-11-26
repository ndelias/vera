// Vera's comment, one block per person (Nahuel's call, 5 Nov 2026): what
// each person is asked for, what they should look at, and their questions,
// together, so nobody has to piece their part together from three lists.
// Slack (M6) sends each person the same block. What the blocks need is kept
// hidden in the comment, so a sign-off redraws them without the agents.

import type { Ask } from "@vera/rules";
import { record, readRecord, type Seal } from "./sealed.ts";

export type Risk = "high" | "medium" | "low";
/** A place from the engineer's brief, with who checks it and its link. */
export type Spot = { file: string; label: string; lines: string; url: string | null; what: string; why: string; risk: Risk; who: string[];
  /** With Verify: the thread Vera started on the spot's lines, and its link. */
  thread?: number; threadUrl?: string };
/** Everything the blocks show besides the sign-offs. `design` is the design call's description when there is one;
 * `summary` and `ai` are the change in a sentence and the likely-AI signals, for Slack. */
export type Brief = { spots: Spot[]; design: string | null; docs: string[]; summary?: string; ai?: string[];
  /** With the `verify` switch: each spot is a thread on its lines, and ✓ on all of yours is your sign-off. */
  verify?: boolean;
  /** With Verify: what the change does, in a few plain sentences. */
  about?: string;
  /** With Verify: the walkthrough's steps, counted by how much care they need (for Slack). */
  walk?: { steps: number; verify: number; skim: number; cleared: number } };
export type Person = { who: string; asks: Ask[]; spots: Spot[]; design: string | null; docs: string[]; questions: string[] };

export const briefMarker = (b: Brief, seal: Seal) => record("vera-brief", b, seal);

export function readBrief(body: string, seal: Seal): Brief | null {
  const b = readRecord<Brief>("vera-brief", body, seal);
  return b && Array.isArray(b.spots) && Array.isArray(b.docs) ? b : null;
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
