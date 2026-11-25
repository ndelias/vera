import { test } from "node:test";
import assert from "node:assert/strict";
import { createTrace } from "@vera/core";
import { fileHunks } from "@vera/agents/triage";
import { toMarkdown } from "../src/markdown.ts";
import { readBrief } from "../src/people.ts";
import type { Review } from "../src/review.ts";
import { span, verifyView } from "../src/verify.ts";
import { sealFor } from "../src/sealed.ts";

const SEAL = sealFor("sk-test", { owner: "o", repo: "r", number: 1 });

const files = [
  { path: "src/cart.ts", patch: "@@ -8,4 +8,6 @@\n a\n-b\n+c\n+d\n+e\n f\n@@ -60,2 +62,2 @@\n-x\n+y" },
  { path: "src/cart.test.ts", patch: "@@ -1,2 +1,3 @@\n a\n+expect(total).toBe(9)\n b" },
  { path: "yarn.lock", patch: "@@ -1,3 +1,3 @@\n-a@1\n+a@2\n z" },
  { path: "docs/coupons.md", patch: "@@ -0,0 +1,2 @@\n+# Coupons\n+Apply one at checkout." },
];
const hunks = fileHunks(files);
// h0 cart L8-13 (spot), h1 cart L62-63, h2 test, h3 lockfile, h4 docs
const skips = [
  { hunk: 3, reason: "lockfile" as const, note: "bumps a" },
  { hunk: 4, reason: "docs" as const, note: "new coupons page" },
  { hunk: 0, reason: "formatting" as const, note: "the Briefer's spot wins" },
];

const base: Review = {
  pull: { ref: { owner: "o", repo: "r", number: 1, url: "u" }, title: "t", body: "", baseRef: "main", headSha: "abc", author: "ben",
    files: files.map((f) => ({ ...f, status: "modified", additions: 3, deletions: 1 })), commitMessages: [] },
  ownership: { source: ".vera.yml", areas: [], people: [] },
  areas: { teams: [] },
  design: { visible: false, confidence: "high", what: "No design decision" },
  brief: { summary: "Adds coupons.", places: [{ file: "src/cart.ts", lines: "10-12", what: "Applies the discount", why: "A negative total is possible", risk: "high" }] },
  exam: null,
  triage: { hunks, skips },
  ai: [],
  plan: { asks: [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }], notes: [] },
  trace: createTrace(),
};

test("a spot's lines come from the Briefer's range, however it's written", () => {
  assert.deepEqual(span("180-207"), [180, 207]);
  assert.deepEqual(span("L180–207"), [180, 207]);
  assert.deepEqual(span("42"), [42, 42]);
  assert.equal(span("near the top"), null);
});

test("spots are Verify, cleared hunks are Cleared, and the rest is Also changed", () => {
  const v = verifyView(hunks, skips, [{ file: "src/cart.ts", lines: "10-12" }], (f) => f, () => null);
  assert.equal(v.total, 11);
  assert.equal(v.spotLines, 3);
  assert.deepEqual(v.also.map((r) => [r.file, r.ranges, r.lines]), [["src/cart.ts", "L62–63", 2], ["src/cart.test.ts", "L1–3", 1]]);
  assert.deepEqual(v.cleared.map((r) => [r.file, r.reason, r.engineersOnly]), [["yarn.lock", "lockfile", false], ["docs/coupons.md", "docs", true]]);
  assert.equal(v.clearedLines, 4);
});

test("when Triage gives no answer, nothing is cleared and the headline says so", () => {
  const md = toMarkdown({ ...base, triage: { hunks, skips: null } }, SEAL);
  assert.match(md, /\*\*Verify 1 spot\*\* \(3 lines\) · Vera couldn't clear anything this time/);
  assert.ok(!md.includes("Cleared by Vera"));
});

test("the comment: Vera's header, the headline, what it does, the engineer's spots, then Also changed and Cleared", () => {
  const md = toMarkdown({ ...base, triage: { hunks, skips, about: "Adds coupons to the cart. Totals can't go below zero." } }, SEAL);
  assert.match(md, /^<picture>.*vera-lockup\.png" height="26" alt="Vera"><\/picture>$/m);
  assert.match(md, /^\*\*Verify 1 spot\*\* \(3 lines\) · 4 of 11 changed lines cleared by Vera$/m);
  assert.match(md, /^\*\*What this change does:\*\* Adds coupons to the cart\. Totals can't go below zero\.$/m);
  assert.match(md, /\*\*Engineering · verify in each thread\*\*\n\n- <picture>.*alt="High"><\/picture> \[`cart\.ts` L10-12\]\(.*\) · Applies the discount\. \*\*to verify\*\*$/m);
  assert.ok(!md.includes("| Look at | Why |"), "no table when the spots are threads");
  assert.match(md, /✓ on all of yours signs you off as engineer/);
  const order = ["#### @ana", "<summary><b>Also changed</b> · 3 lines in 2 files", "<summary><b>Cleared by Vera</b> · 4 lines in 2 files", "How Vera decided"].map((x) => md.indexOf(x));
  assert.ok(!order.includes(-1), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(md, /\| Docs \(for engineers\) · new coupons page \|/);
  assert.equal(readBrief(md, SEAL)?.verify, true);
});

test("with threads, each spot links to its thread and shows where its person is", () => {
  const comments = [
    { id: 7, who: "github-actions[bot]", body: "<!-- vera-spot -->", path: "src/cart.ts", line: 12, replyTo: null, trusted: false, at: "1", url: "https://github.com/o/r/pull/1#discussion_r7" },
    { id: 8, who: "ana", body: "✓", path: "src/cart.ts", line: 12, replyTo: 7, trusted: true, at: "2", url: "u8" },
  ];
  const md = toMarkdown(base, SEAL, undefined, undefined, { comments, ids: [7] });
  assert.match(md, /\[`cart\.ts` L10-12\]\(https:\/\/github\.com\/o\/r\/pull\/1#discussion_r7 "src\/cart\.ts"\) · Applies the discount\. \*\*✓ verified\*\*$/m);
  assert.equal(readBrief(md, SEAL)?.spots[0]?.thread, 7);
});

test("without the switch, the comment is as before", () => {
  const { triage: _, ...off } = base;
  const md = toMarkdown(off, SEAL);
  assert.ok(md.includes("| Look at | Why |"));
  assert.ok(!md.includes("Verify 1 spot") && !md.includes("vera-lockup"));
});
