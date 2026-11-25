import { test } from "node:test";
import assert from "node:assert/strict";
import { readRecord, record, refused, sealFor } from "../src/sealed.ts";

const PR = { owner: "Acme", repo: "Shop", number: 7 };
const SEAL = sealFor("sk-test", PR);
const plan = [{ who: "@ana", role: "engineer" }];

test("a record Vera signed reads back, and survives the repo's name changing case", () => {
  const body = `<!-- vera-review -->\n${record("vera-plan", plan, SEAL)}\nthe rest`;
  assert.deepEqual(readRecord("vera-plan", body, SEAL), plan);
  assert.deepEqual(readRecord("vera-plan", body, sealFor("sk-test", { owner: "acme", repo: "shop", number: 7 })), plan);
  assert.deepEqual(refused(body, SEAL), []);
});

test("an edited, unsigned, moved or renamed record reads as missing", () => {
  const signed = record("vera-plan", plan, SEAL);
  const [, data, sig] = /:([^.]*)\.(\S+) -->/.exec(signed)!;
  const mine = Buffer.from(JSON.stringify([...plan, { who: "@mallory", role: "design" }])).toString("base64");
  const cases = {
    edited: `<!-- vera-plan:${mine}.${sig} -->`,
    unsigned: `<!-- vera-plan:${data} -->`,
    "another key": record("vera-plan", plan, sealFor("sk-guess", PR)),
    "another pull request": record("vera-plan", plan, sealFor("sk-test", { ...PR, number: 8 })),
    "another record's signature": record("vera-brief", plan, SEAL).replace("vera-brief", "vera-plan"),
  };
  for (const [what, body] of Object.entries(cases)) {
    assert.equal(readRecord("vera-plan", body, SEAL), null, what);
    assert.deepEqual(refused(body, SEAL), ["vera-plan"], what);
  }
});

test("missing records aren't refused, and a Slack sign-off isn't mistaken for Vera's Slack record", () => {
  assert.deepEqual(refused("<!-- vera-review -->\n<!-- vera-slack-signoff:ana:D1 -->", SEAL), []);
  assert.equal(readRecord("vera-slack", "<!-- vera-slack-signoff:ana:D1 -->", SEAL), null);
});
