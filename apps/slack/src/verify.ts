// Every request from Slack is signed with the app's signing secret. Anything
// unsigned, signed wrong, or more than five minutes old is turned away, so
// nobody else can make Vera answer (and spend the team's Anthropic key).

import { createHmac, timingSafeEqual } from "node:crypto";

const WINDOW_S = 5 * 60;

export function verify(secret: string, timestamp: string | null, signature: string | null, body: string, nowMs = Date.now()): boolean {
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > WINDOW_S) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
