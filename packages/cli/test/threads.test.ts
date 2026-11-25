import { test } from "node:test";
import assert from "node:assert/strict";
import { fileHunks } from "@vera/agents/triage";
import type { LineComment } from "@vera/tools/github";
import type { Spot } from "../src/people.ts";
import { status } from "../src/signoff.ts";
import { answers, newThreads, placement, reuse, threadBody, verdict, verifiedEvents } from "../src/threads.ts";

const hunks = fileHunks([{ path: "a.ts", patch: "@@ -8,4 +8,6 @@\n a\n-b\n+c\n+d\n+e\n f\n@@ -60,2 +62,2 @@\n-x\n+y" }]);
const spot = (lines: string, who: string[], thread?: number): Spot => ({ file: "a.ts", label: "a.ts", lines, url: null, what: "Applies the discount", why: "Totals can go negative", risk: "high", who, ...(thread ? { thread } : {}) });
let n = 0;
const c = (who: string, body: string, replyTo: number | null, extra: Partial<LineComment> = {}): LineComment =>
  ({ id: ++n + 100, who, body, path: "a.ts", line: 10, replyTo, trusted: true, at: `2026-11-25T1${n % 10}:00:00Z`, url: `u${n}`, ...extra });

test("a spot's thread sits on its lines, kept inside one hunk of the diff", () => {
  assert.deepEqual(placement({ file: "a.ts", lines: "10-11" }, hunks), { line: 11, start: 10 });
  assert.deepEqual(placement({ file: "a.ts", lines: "5-30" }, hunks), { line: 13, start: 8 }, "clamped to the hunk");
  assert.deepEqual(placement({ file: "a.ts", lines: "62" }, hunks), { line: 62 });
  assert.equal(placement({ file: "a.ts", lines: "30-40" }, hunks), null, "not in the diff: no thread");
  assert.equal(placement({ file: "b.ts", lines: "10" }, hunks), null);
});

test("the thread says which spot it is, for whom, and how to answer", () => {
  const body = threadBody(spot("10-12", ["@ana"]), 1, 3);
  assert.match(body, /^<!-- vera-spot -->\n\*\*Verify 1 of 3\*\* · High risk · for @ana\n\nApplies the discount\. Totals can go negative\./);
  assert.match(body, /Reply ✓ when you've checked it/);
});

test("a push keeps Vera's threads on spots that are still there, and starts the rest", () => {
  const mine = c("github-actions[bot]", "<!-- vera-spot -->\n**Verify 1 of 1**", null, { line: 11 });
  const notVeras = c("ana", "<!-- vera-spot --> pasted", null, { line: 62 });
  const spots = [spot("10-12", ["@ana"]), spot("62", ["@ana"])];
  const ids = reuse(spots, [mine, notVeras]);
  assert.deepEqual(ids, [mine.id, null]);
  assert.deepEqual(newThreads(spots, hunks, ids).map((t) => [t.spot, t.line]), [[1, 62]]);
});

test("replies read as ✓, a change, a question, or nothing", () => {
  for (const b of ["✓", "✅ checked", "LGTM", "Verified, thanks", "looks good", "👍"]) assert.equal(verdict(b), "verified", b);
  assert.equal(verdict("```suggestion\nif (total < 0) total = 0\n```"), "change");
  assert.equal(verdict("Needs a change: clamp at zero"), "change");
  for (const b of ["Why does this skip the cache?", "explain the retry", "ok but what about admins?"]) assert.equal(verdict(b), "question", b);
  assert.equal(verdict("> ✓\nnice refactor"), null, "quoted text doesn't count");
  assert.equal(verdict("<!-- vera-slack-answer:ana:D1 -->\n**ana** asked in Slack:\n\n> what could break?\n\n**Vera:** a ```suggestion block still returns change."), "question", "a question from Slack, whatever Vera's answer quotes");
});

test("someone is signed off once their latest answer on every spot of theirs is ✓", () => {
  const spots = [spot("10-12", ["@ana", "@ben"], 1), spot("62", ["@ana"], 2)];
  const replies = [
    c("ana", "✓", 1),
    c("ana", "Needs a change: clamp it", 2),
    c("ben", "✓", 1),
    c("cy", "✓", 2), // not asked for this spot
    c("ana", "Why is this here?", 2),
  ];
  let a = answers(spots, replies);
  assert.deepEqual(a.status.map((x) => [x.verified, x.change, x.asked]), [[["ana", "ben"], [], false], [[], ["ana"], true]]);
  assert.deepEqual(Object.keys(a.verified), ["ben"]);

  a = answers(spots, [...replies, c("ana", "✓ fixed now", 2)]);
  assert.deepEqual(Object.keys(a.verified).sort(), ["ana", "ben"]);
  const asks = [{ who: "@ana", role: "engineer" as const, action: "ask" as const, why: "owns A" }];
  assert.equal(status(asks, "cy", [], [], "<!-- vera-review -->", verifiedEvents(a.verified, replies)).roles[0]?.by, "@ana");
});

test("a ✓ from Vera's own account, or on a spot with no thread, counts for nothing", () => {
  const spots = [spot("10-12", ["@ana"], 1), spot("30", ["@ana"])];
  const a = answers(spots, [c("github-actions[bot]", "✓", 1)]);
  assert.deepEqual(a.status[0]?.verified, []);
  assert.deepEqual(a.verified, {});
});
