import { test } from "node:test";
import assert from "node:assert/strict";
import { slackSignoff, type Ask } from "@vera/rules";
import { MARKER } from "../src/markdown.ts";
import { latestAnswers } from "../src/understanding.ts";
import { fromSlack, planMarker, readPlan, status, statusBlock, toCheck, withStatus } from "../src/signoff.ts";

const asks: Ask[] = [
  { who: "@ana", role: "engineer", action: "ask", why: "owns Checkout -- and <!-- tricky -->" },
  { who: "@dev", role: "design", action: "ask-lead", why: "Might be a design decision (medium)" },
];

test("the plan survives the round trip through the comment", () => {
  assert.deepEqual(readPlan(`${MARKER}\n${planMarker(asks)}\n### Vera's review`), asks);
  assert.equal(readPlan("no plan here"), null);
});

test("waiting is neutral and names who's left; all signed off is green", () => {
  const vera = { id: 1, who: "github-actions[bot]", body: `${MARKER}\nTo sign off, comment \`/vera sign-off\``, trusted: false, at: "2026-10-28T10:00:00Z" };
  const waiting = toCheck(status(asks, "ana", [], [vera, { id: 2, who: "ana", body: "/vera sign-off", trusted: true, at: "2026-10-28T10:05:00Z" }], MARKER));
  assert.equal(waiting.conclusion, "neutral");
  assert.equal(waiting.title, "Waiting on 1 of 2: design (@dev)");
  assert.match(waiting.summary, /\| engineer \| @ana \| ✓ @ana \(author\) \|/);

  const done = toCheck(status(asks, "ana", [{ id: 1, who: "dev", state: "APPROVED", body: "", trusted: true, at: "2026-10-28T11:00:00Z" }], [], MARKER));
  assert.equal(done.conclusion, "neutral");
  const all = toCheck(status(asks, "ana", [{ id: 1, who: "dev", state: "APPROVED", body: "", trusted: true, at: "2026-10-28T11:00:00Z" }],
    [{ id: 2, who: "ana", body: "/vera sign-off", trusted: true, at: "2026-10-28T10:05:00Z" }], MARKER));
  assert.equal(all.conclusion, "success");
  assert.equal(all.title, "Signed off: engineer by @ana (author), design by @dev");
});

test("nobody asked means nothing to sign off", () => {
  assert.equal(toCheck(status([], "ana", [], [], MARKER)).title, "Nobody to sign off");
});

test("the blocks name who's left and are swapped in place on a sign-off", () => {
  const before = statusBlock(status(asks, "ana", [], [], MARKER), asks);
  assert.match(before, /###### WHO SIGNS OFF · WAITING ON 2 OF 2/);
  assert.match(before, /#### @dev\n\n<picture>.*alt="Waiting"><\/picture> \*\*Design\*\* \(as lead\) · waiting/);
  const after = statusBlock(status(asks, "ana", [{ id: 1, who: "dev", state: "APPROVED", body: "", trusted: true, at: "t" }], [], MARKER), asks);
  assert.match(after, /###### WHO SIGNS OFF · WAITING ON 1 OF 2/);
  assert.match(after, /done\.svg" width="16" height="10" alt="Signed off"><\/picture> \*\*Design\*\* \(as lead\) · signed off( · |$)/m);
  const body = `${MARKER}\n${before}\n\nthe rest`;
  assert.equal(withStatus(body, after), `${MARKER}\n${after}\n\nthe rest`);
  assert.equal(withStatus("an old comment", after), null);
});

test("redrawn on a sign-off, the blocks keep their places, and the questions go once the engineer has signed off", () => {
  const eng: Ask[] = [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }];
  const view = { brief: { spots: [{ file: "a.ts", label: "a.ts", lines: "1", url: null, what: "w", why: "y", risk: "high" as const, who: ["@ana"] }], design: null, docs: [] }, exam: { questions: ["Why?"], why: "it's likely AI-written" } };
  const before = statusBlock(status(eng, "bo", [], [], MARKER), eng, undefined, {}, view);
  assert.match(before, /`a\.ts` L1 · w\. \| y\. \|/);
  assert.match(before, /\*\*Before you sign off\*\*\n\n1\. Why\?/);
  const after = statusBlock(status(eng, "bo", [{ id: 1, who: "ana", state: "APPROVED", body: "", trusted: true, at: "t" }], [], MARKER), eng, undefined, {}, view);
  assert.match(after, /`a\.ts` L1/);
  assert.ok(!after.includes("Before you sign off"));
});

test("a sign-off the GitHub App posted from Slack counts for that person, answers included; a pasted one doesn't", () => {
  const at = "2026-10-28T10:05:00Z";
  const fromApp = { id: 2, who: "vera-slack[bot]", body: slackSignoff("@ana", "all", ["It retries."]), trusted: false, at };
  const pasted = { id: 3, who: "mallory", body: slackSignoff("@dev", "all", []), trusted: false, at };
  const comments = fromSlack([fromApp, pasted], "vera-slack");
  assert.deepEqual(comments.map((c) => [c.who, c.trusted]), [["ana", true], ["mallory", false]]);
  const s = status(asks, "bo", [], comments, MARKER);
  assert.deepEqual(s.roles.map((r) => r.by), ["@ana", undefined]);
  assert.deepEqual(latestAnswers("@ana", "2026-10-28T10:00:00Z", [], comments, MARKER)?.answers, new Map([[1, "It retries."]]));
  assert.equal(fromSlack([fromApp], undefined)[0]!.who, "vera-slack[bot]", "without the slack-app input it's just a comment");
});
