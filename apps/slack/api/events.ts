// The Vercel side of Vera's Slack server, and the only file that knows it's on
// Vercel. Slack wants "got it" within 3 seconds and an answer takes longer, so
// the function has to keep running after it replies. Vercel offers that as
// waitUntil on a hook it puts on every request; this reads the hook directly,
// as Vercel's own @vercel/functions does, rather than add that package and
// its 24 others (Nahuel's call, 5 Nov 2026). If Vercel ever moves the hook,
// Vera answers before replying instead: slower, and Slack logs a timeout, but
// answers still arrive, and the log below says what to fix.
//
// On another host, write a file like this one with that host's way of doing
// the same (Cloudflare: ctx.waitUntil; a long-running Node server: don't wait).

import { envFrom, handle, type Later } from "../src/events.ts";

type VercelContext = { waitUntil?: (p: Promise<unknown>) => void };
const HOOK = Symbol.for("@vercel/request-context");

const later: Later = (work) => {
  const ctx = (globalThis as { [HOOK]?: { get?: () => VercelContext } })[HOOK]?.get?.();
  if (ctx?.waitUntil) return ctx.waitUntil(work);
  console.warn("Vercel's request hook (waitUntil) wasn't found, so Vera answered before replying to Slack. Check apps/slack/api/events.ts.");
  return work;
};

export function POST(request: Request): Promise<Response> {
  return handle(request, envFrom(process.env), later);
}
