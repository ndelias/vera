import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ask } from "@vera/rules";
import type { Brief } from "../src/people.ts";
import { status, statusBlock } from "../src/signoff.ts";
import { applyEdit, boxes, complete, readVerified, tickEvents, ticked, update, verifiedMarker as verifiedMarkerFor } from "../src/ticks.ts";
import { sealFor } from "../src/sealed.ts";

const SEAL = sealFor("sk-test", { owner: "o", repo: "r", number: 1 });

const spot = (file: string, who: string[]) => ({ file, label: file, lines: "1-2", url: null, what: "w", why: "y", risk: "high" as const, who });
const brief: Brief = { spots: [spot("a.ts", ["@ana"]), spot("b.ts", ["@ana", "@ben"])], design: null, docs: [], verify: true };
const asks: Ask[] = [
  { who: "@ana", role: "engineer", action: "ask", why: "owns A" },
  { who: "@ben", role: "engineer", action: "ask", why: "owns B" },
];
const draw = (t: Set<string> = new Set(), verified: Record<string, string> = {}) =>
  statusBlock(status(asks, "cy", [], [], "<!-- vera-review -->", tickEvents(verified)), asks, SEAL, undefined, {}, { brief, exam: null, ticked: t, verified });
const tick = (body: string, spot: number, who: string) => body.replace(new RegExp(`- \\[ \\](.*<!-- vera-tick:${spot}:${who} -->)`), "- [x]$1");

test("each engineer gets a box per spot of theirs", () => {
  assert.deepEqual(boxes(draw()).map((b) => `${b.spot}:${b.who}:${b.ticked}`), ["0:ana:false", "1:ana:false", "1:ben:false"]);
});

test("your own ticks stay; a box ticked for someone else is put back", () => {
  const before = draw();
  const after = tick(tick(before, 0, "ana"), 1, "ben");
  const { body, reverted } = applyEdit(before, after, "Ana");
  assert.equal(reverted, 1);
  assert.deepEqual([...ticked(boxes(body))], ["0:ana"]);
});

test("ticking all of your spots is your engineer sign-off; unticking one takes it back", () => {
  let body = tick(tick(draw(), 0, "ana"), 1, "ana");
  const done = complete(brief, boxes(body));
  assert.deepEqual([...done], ["ana"]);
  const verified = update({}, done, "2026-11-25T18:00:00Z");
  const s = status(asks, "cy", [], [], "<!-- vera-review -->", tickEvents(verified));
  assert.equal(s.roles[0]?.by, "@ana");

  body = draw(ticked(boxes(body)), verified);
  assert.deepEqual(readVerified(body, SEAL), { ana: "2026-11-25T18:00:00Z" }, "kept hidden with the status block");
  assert.match(body, /\*\*Engineer\*\* · signed off · owns A/);

  const unticked = body.replace("- [x]", "- [ ]");
  assert.deepEqual(update(verified, complete(brief, boxes(unticked)), "later"), {});
});

test("a later request for changes clears a tick sign-off, as it does an approval", () => {
  const verified = { ana: "2026-11-25T18:00:00Z" };
  const s = status(asks, "cy", [{ id: 1, body: "", who: "ana", state: "CHANGES_REQUESTED", trusted: true, at: "2026-11-25T19:00:00Z" }], [], "<!-- vera-review -->", tickEvents(verified));
  assert.equal(s.roles[0]?.by, undefined);
});

test("someone with no spots never counts as finished", () => {
  assert.deepEqual([...complete({ ...brief, spots: [] }, [])], []);
});

test("the finished record can't be forged by editing the comment, whether or not a run saw the edit", () => {
  const before = draw(new Set(), { ana: "2026-11-25T18:00:00Z" });
  const record = { ben: "2026-11-25T18:00:00Z" };
  const unsigned = `<!-- vera-verified:${Buffer.from(JSON.stringify(record)).toString("base64")} -->`;
  const otherKey = verifiedMarkerFor(record, sealFor("sk-guess", { owner: "o", repo: "r", number: 1 }));
  const otherPr = verifiedMarkerFor(record, sealFor("sk-test", { owner: "o", repo: "r", number: 2 }));
  for (const forged of [unsigned, otherKey, otherPr]) {
    const edited = before.replace(/<!-- vera-verified:[^ ]* -->/, forged);
    assert.ok(edited.includes(forged));
    assert.deepEqual(readVerified(edited, SEAL), {}, "read as missing, not as ben");
  }
  assert.deepEqual(readVerified(before, SEAL), { ana: "2026-11-25T18:00:00Z" });
});
