import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ask } from "@vera/rules";
import { MARKER } from "../src/markdown.ts";
import { planMarker, readPlan, status, statusBlock, toCheck, withStatus } from "../src/signoff.ts";

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

test("the status block names who's left and is swapped in place on a sign-off", () => {
  const before = statusBlock(status(asks, "ana", [], [], MARKER), asks);
  assert.match(before, /### Vera · 2 sign-offs needed/);
  assert.match(before, /\| @dev \| design \(as lead\) \| waiting \|/);
  const after = statusBlock(status(asks, "ana", [{ id: 1, who: "dev", state: "APPROVED", body: "", trusted: true, at: "t" }], [], MARKER), asks);
  assert.match(after, /### Vera · 1 of 2 sign-offs still needed/);
  assert.match(after, /\| @dev \| design \(as lead\) \| ✓ signed off \|$/m);
  const body = `${MARKER}\n${before}\n\nthe rest`;
  assert.equal(withStatus(body, after), `${MARKER}\n${after}\n\nthe rest`);
  assert.equal(withStatus("an old comment", after), null);
});
