import { test } from "node:test";
import assert from "node:assert/strict";
import { slackSignoff, type Ask } from "@vera/rules";
import { MARKER } from "../src/markdown.ts";
import { latestAnswers } from "../src/understanding.ts";
import { fromSlack, planMarker, readPlan, status, statusBlock, toCheck, withStatus } from "../src/signoff.ts";
import { sealFor } from "../src/sealed.ts";
const SEAL = sealFor("sk-test", { owner: "o", repo: "r", number: 1 });

const asks: Ask[] = [
  { who: "@ana", role: "engineer", action: "ask", why: "owns Checkout -- and <!-- tricky -->" },
  { who: "@dev", role: "design", action: "ask-lead", why: "Might be a design decision (medium)" },
];

test("the plan survives the round trip through the comment", () => {
  assert.deepEqual(readPlan(`${MARKER}\n${planMarker(asks, SEAL)}\n### Vera's review`, SEAL), asks);
  assert.equal(readPlan("no plan here", SEAL), null);
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
  const before = statusBlock(status(asks, "ana", [], [], MARKER), asks, SEAL);
  assert.match(before, /###### WHO SIGNS OFF · WAITING ON 2 OF 2/);
  assert.match(before, /#### @dev\n\n<picture>.*alt="Waiting"><\/picture> \*\*Design\*\* \(as lead\) · waiting/);
  const after = statusBlock(status(asks, "ana", [{ id: 1, who: "dev", state: "APPROVED", body: "", trusted: true, at: "t" }], [], MARKER), asks, SEAL);
  assert.match(after, /###### WHO SIGNS OFF · WAITING ON 1 OF 2/);
  assert.match(after, /done\.svg" width="16" height="10" alt="Signed off"><\/picture> \*\*Design\*\* \(as lead\) · signed off( · |$)/m);
  const body = `${MARKER}\n${before}\n\nthe rest`;
  assert.equal(withStatus(body, after), `${MARKER}\n${after}\n\nthe rest`);
  assert.equal(withStatus("an old comment", after), null);
});

test("redrawn on a sign-off, the blocks keep their places, and the questions go once the engineer has signed off", () => {
  const eng: Ask[] = [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }];
  const view = { brief: { spots: [{ file: "a.ts", label: "a.ts", lines: "1", url: null, what: "w", why: "y", risk: "high" as const, who: ["@ana"] }], design: null, docs: [] }, exam: { questions: ["Why?"], why: "it's likely AI-written" } };
  const before = statusBlock(status(eng, "bo", [], [], MARKER), eng, SEAL, undefined, {}, view);
  assert.match(before, /`a\.ts` L1 · w\. \| y\. \|/);
  assert.match(before, /\*\*Before you sign off\*\*\n\n1\. Why\?/);
  const after = statusBlock(status(eng, "bo", [{ id: 1, who: "ana", state: "APPROVED", body: "", trusted: true, at: "t" }], [], MARKER), eng, SEAL, undefined, {}, view);
  assert.match(after, /`a\.ts` L1/);
  assert.ok(!after.includes("Before you sign off"));
});

test("a sign-off the GitHub App posted from Slack counts for that person, answers included; a pasted one doesn't", () => {
  const at = "2026-10-28T10:05:00Z";
  const sent = { "@ana": { channel: "D1", ts: "100.1" }, "@dev": { channel: "D2", ts: "100.2" } };
  const fromApp = { id: 2, who: "vera-slack[bot]", body: slackSignoff("@ana", "D1", "all", ["It retries."]), trusted: false, at };
  const pasted = { id: 3, who: "mallory", body: slackSignoff("@dev", "D2", "all", []), trusted: false, at };
  const { comments, refused } = fromSlack([fromApp, pasted], "vera-slack", sent);
  assert.deepEqual(comments.map((c) => [c.who, c.trusted]), [["ana", false], ["mallory", false]]);
  assert.equal(refused, 0);
  const s = status(asks, "bo", [], comments, MARKER);
  assert.deepEqual(s.roles.map((r) => r.by), ["@ana", undefined]);
  assert.deepEqual(latestAnswers("@ana", "2026-10-28T10:00:00Z", [], comments, MARKER)?.answers, new Map([[1, "It retries."]]));
  assert.equal(fromSlack([fromApp], undefined, sent).comments[0]!.who, "vera-slack[bot]", "without the slack-app input it's just a comment");
});

test("a Slack sign-off counts only from the conversation Vera's signed record has for that person", () => {
  const at = "2026-10-28T10:05:00Z";
  const sent = { "@ana": { channel: "D1", ts: "100.1" }, "@dev": { channel: "D2", ts: "100.2" } };
  const app = (body: string) => ({ id: 2, who: "vera-slack[bot]", body, trusted: false, at });
  // Ana's own conversation, but posted as Dev: what the server does if someone rewrote its record.
  const asDev = fromSlack([app(slackSignoff("@dev", "D1", "all", []))], "vera-slack", sent);
  assert.deepEqual([asDev.comments[0]!.who, asDev.refused], ["vera-slack[bot]", 1]);
  assert.deepEqual(status(asks, "bo", [], asDev.comments, MARKER).roles.map((r) => r.by), [undefined, undefined]);
  // From a server deployed before this check, which doesn't say which conversation.
  const old = fromSlack([app("<!-- vera-slack-signoff:ana -->\n/vera sign-off")], "vera-slack", sent);
  assert.deepEqual([old.comments[0]!.who, old.refused], ["vera-slack[bot]", 1]);
  // Nobody messaged in Slack (no signed record): nothing from Slack counts.
  assert.equal(fromSlack([app(slackSignoff("@ana", "D1", "all", []))], "vera-slack", {}).refused, 1);
});
