// Ticking the spots is the sign-off (Nahuel's call, 25 Nov 2026). Each
// engineer has a tick box per spot in Vera's comment. GitHub sends the edit
// with who made it and the comment as it was, so Vera keeps the boxes people
// tick in their own name and puts back any they tick for someone else. Once
// someone has ticked all their spots, the time is kept hidden in the comment,
// and that counts as their engineer sign-off, in order with approvals and
// requests for changes.

import type { SignoffEvent } from "@vera/rules";
import type { Brief } from "./people.ts";
import { TICK } from "./verify.ts";

export type Box = { spot: number; who: string; ticked: boolean };

const VERIFIED = /<!-- vera-verified:([A-Za-z0-9+/=]*) -->/;
const key = (b: { spot: number; who: string }) => `${b.spot}:${b.who.toLowerCase()}`;
const handle = (who: string) => who.replace(/^@/, "").toLowerCase();

/** Every tick box in a comment, in order. */
export function boxes(body: string): Box[] {
  return [...body.matchAll(TICK)].map((m) => ({ spot: Number(m[2]), who: m[3]!, ticked: m[1] !== " " }));
}

/** The boxes ticked, as "spot:handle", for drawing the comment again. */
export const ticked = (bs: Box[]) => new Set(bs.filter((b) => b.ticked).map(key));

/** Who has ticked all their spots, and when: handle → ISO time. */
export function readVerified(body: string): Record<string, string> {
  const m = VERIFIED.exec(body);
  if (!m) return {};
  try {
    return JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}
export const verifiedMarker = (v: Record<string, string>) => `<!-- vera-verified:${Buffer.from(JSON.stringify(v)).toString("base64")} -->`;

/** The comment after someone's edit, with any box they changed that isn't theirs put back as it was. */
export function applyEdit(before: string, after: string, sender: string): { body: string; reverted: number } {
  const was = new Map(boxes(before).map((b) => [key(b), b.ticked]));
  let reverted = 0;
  const body = after.replace(TICK, (line, mark: string, spot: string, who: string) => {
    const now = mark !== " ";
    const then = was.get(key({ spot: Number(spot), who })) ?? false;
    if (now === then || handle(who) === handle(sender)) return line;
    reverted++;
    return line.replace(/^- \[( |x|X)\]/, `- [${then ? "x" : " "}]`);
  });
  return { body, reverted };
}

/** The people who have ticked every spot they were given (and were given at least one). */
export function complete(brief: Brief, bs: Box[]): Set<string> {
  const done = ticked(bs);
  const out = new Set<string>();
  const people = new Set(brief.spots.flatMap((s) => s.who.map(handle)));
  for (const who of people) {
    const mine = brief.spots.map((s, i) => [s, i] as const).filter(([s]) => s.who.some((w) => handle(w) === who));
    if (mine.length && mine.every(([, i]) => done.has(`${i}:${who}`))) out.add(who);
  }
  return out;
}

/** The verified record brought up to date: new finishers get the time now; anyone who unticked is dropped. */
export function update(verified: Record<string, string>, done: Set<string>, now: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const who of done) out[who] = verified[who] ?? now;
  return out;
}

/** Each finished person as an engineer sign-off. Editing Vera's comment takes write access, so it's trusted. */
export function tickEvents(verified: Record<string, string>): (SignoffEvent & { at: string })[] {
  return Object.entries(verified).map(([who, at]) => ({ kind: "comment" as const, who, roles: ["engineer" as const], trusted: true, at }));
}
