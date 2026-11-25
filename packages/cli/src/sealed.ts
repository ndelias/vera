// Vera's hidden records, signed (Nahuel's call, 25 Nov 2026). Between runs
// Vera keeps what it needs in its own comment on the pull request, as base64
// inside HTML comments: who it asked, the brief, the questions, the grades,
// which Slack message went to whom, and who ticked all their spots. Anyone who
// can write to the repo can edit that comment, so each record carries an HMAC
// keyed from the repo's Anthropic key, which only the Action has, and tied to
// the pull request and the record's name. A record that doesn't verify is read
// as missing, however it got there: an edit no run saw, a record copied from
// another pull request, one from a Vera that didn't sign them, or a key that was rotated
// since (the next push writes them again).
//
// What it can't stop: someone pasting back a record Vera itself wrote earlier
// on the same pull request (GitHub keeps a comment's edit history). That can
// bring back an older plan or tick record, never one Vera didn't write.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type Seal = { secret: string; pr: string };

/** The seal for one pull request. `secret` is the repo's Anthropic key. */
export const sealFor = (secret: string, ref: { owner: string; repo: string; number: number }): Seal =>
  ({ secret, pr: `${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase() });

/** The records Vera signs, as named in the comment. */
export const RECORDS = ["vera-plan", "vera-brief", "vera-exam", "vera-grades", "vera-slack", "vera-verified"] as const;
export type RecordName = (typeof RECORDS)[number];

// Its own key, so a signature is never also a valid exam seal (understanding.ts).
const keyFrom = (secret: string) => createHash("sha256").update(`vera-record:${secret}`).digest();
const mac = (name: RecordName, data: string, seal: Seal) =>
  createHmac("sha256", keyFrom(seal.secret)).update(`${name}\n${seal.pr}\n${data}`).digest("base64url");

/** Matches a record with or without a signature, so an unsigned one is found (and refused). */
export const pattern = (name: RecordName, flags = "") => new RegExp(`<!-- ${name}:([A-Za-z0-9+/=]*)(?:\\.([A-Za-z0-9_-]+))? -->`, flags);

/** Base64 keeps handles and reasons from ending the HTML comment early. */
export function record(name: RecordName, value: unknown, seal: Seal): string {
  const data = Buffer.from(JSON.stringify(value)).toString("base64");
  return `<!-- ${name}:${data}.${mac(name, data, seal)} -->`;
}

const verifies = (name: RecordName, data: string, sig: string | undefined, seal: Seal) => {
  if (!sig) return false;
  const want = Buffer.from(mac(name, data, seal));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
};

/** The first record of this name, when Vera signed it for this pull request; null otherwise. */
export function readRecord<T>(name: RecordName, body: string, seal: Seal): T | null {
  const m = pattern(name).exec(body);
  if (!m || !verifies(name, m[1]!, m[2], seal)) return null;
  try {
    return JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** The records in the comment that are there but don't verify, to say so in the run's log. */
export function refused(body: string, seal: Seal): RecordName[] {
  return RECORDS.filter((name) => {
    const m = pattern(name).exec(body);
    return m && !verifies(name, m[1]!, m[2], seal);
  });
}
