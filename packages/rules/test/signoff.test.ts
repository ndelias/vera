import { test } from "node:test";
import assert from "node:assert/strict";
import { counts, parseSignoff, signoff, type Ask } from "../src/index.ts";

const asks: Ask[] = [
  { who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" },
  { who: "@dev", role: "design", action: "ask", why: "design decision (high)" },
];

test("reads the sign-off command, with or without roles", () => {
  assert.equal(parseSignoff("/vera sign-off"), "all");
  assert.equal(parseSignoff("Looks good.\n/vera signoff"), "all");
  assert.deepEqual(parseSignoff("/vera sign-off design, docs"), ["design", "docs"]);
  assert.deepEqual(parseSignoff("/vera sign-off engineering"), ["engineer"]);
  assert.equal(parseSignoff("I'll /vera sign-off later"), null);
  assert.equal(parseSignoff("LGTM"), null);
});

test("an approval signs off every role the person was asked for", () => {
  const s = signoff(asks, "ana", [{ kind: "review", who: "dev", state: "APPROVED", trusted: true }]);
  assert.deepEqual(s.roles.map((r) => r.by), [undefined, "@dev"]);
  assert.equal(s.done, false);
});

test("the author can sign off by comment, and it says so", () => {
  const s = signoff(asks, "ana", [
    { kind: "comment", who: "ana", roles: "all", trusted: true },
    { kind: "comment", who: "dev", roles: ["design"], trusted: true },
  ]);
  assert.equal(s.done, true);
  assert.deepEqual(s.roles[0], { role: "engineer", asked: ["@ana"], by: "@ana", byAuthor: true });
});

test("a sign-off for another role, or from someone not asked, doesn't count", () => {
  const s = signoff(asks, "ana", [
    { kind: "comment", who: "dev", roles: ["engineer"], trusted: true },
    { kind: "review", who: "sam", state: "APPROVED", trusted: true },
  ]);
  assert.equal(s.roles.every((r) => !r.by), true);
  assert.equal(counts(asks, "ana", "dev", true, ["engineer"]), false);
  assert.equal(counts(asks, "ana", "dev", true, "all"), true);
});

test("requesting changes takes a sign-off back, until the next one", () => {
  const approved = { kind: "review" as const, who: "dev", state: "APPROVED", trusted: true };
  const changes = { kind: "review" as const, who: "dev", state: "CHANGES_REQUESTED", trusted: true };
  assert.equal(signoff(asks, "ana", [approved, changes]).roles[1]!.by, undefined);
  assert.equal(signoff(asks, "ana", [changes, approved]).roles[1]!.by, "@dev");
});

test("a team's part is signed off by anyone with write access but the author", () => {
  const team: Ask[] = [{ who: "@acme/web", role: "engineer", action: "ask", why: "owns Web" }];
  assert.equal(signoff(team, "ana", [{ kind: "review", who: "ana", state: "APPROVED", trusted: true }]).done, false);
  assert.equal(signoff(team, "ana", [{ kind: "review", who: "pat", state: "APPROVED", trusted: false }]).done, false);
  assert.equal(signoff(team, "ana", [{ kind: "review", who: "pat", state: "APPROVED", trusted: true }]).roles[0]!.by, "@pat");
});
