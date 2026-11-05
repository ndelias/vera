import { test } from "node:test";
import assert from "node:assert/strict";
import { signoff, type Ask } from "@vera/rules";
import { people, type Brief } from "../src/people.ts";
import { message, readSent, sendAll, withSent, type Sent } from "../src/slack.ts";

const asks: Ask[] = [
  { who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" },
  { who: "@lena", role: "design", action: "ask-lead", why: "might be a design decision (medium)" },
];
const brief: Brief = { spots: [{ file: "src/cart.ts", label: "cart.ts", lines: "10-24", url: "https://x/files#R10", what: "Applies the discount", why: "A negative total is <possible>", risk: "high", who: ["@ana"] }], design: "A coupon field in the cart", docs: [], summary: "Adds coupons.", ai: ["AI help disclosed"] };
const pr = { url: "https://github.com/o/r/pull/7", repo: "o/r", number: 7, title: "Coupons", author: "bo" };
const everyone = people(asks, brief, ["What happens with two coupons?"]);
const text = (m: { blocks: unknown[] }) => JSON.stringify(m.blocks);

test("each person's message is their block: roles, where to look, questions; model text can't make links", () => {
  const ana = message(everyone[0]!, pr, signoff(asks, "bo", []), { summary: "Adds coupons.", ai: ["AI help disclosed"], why: "it's likely AI-written" });
  assert.match(ana.text, /review o\/r#7 \(Engineer\): Coupons/);
  const t = text(ana);
  assert.match(t, /○ \*Engineer\* · waiting · owns Checkout/);
  assert.match(t, /\*High\* · <https:\/\/x\/files#R10\|`cart.ts` L10-24> · Applies the discount\./);
  assert.match(t, /A negative total is &lt;possible&gt;\./);
  assert.match(t, /1\. What happens with two coupons\?/);
  assert.ok(!t.includes("The design"));
  const lena = text(message(everyone[1]!, pr, signoff(asks, "bo", []), {}));
  assert.match(lena, /\*Design\* \(as lead\)/);
  assert.match(lena, /\*The design:\* A coupon field in the cart\./);
  assert.ok(!lena.includes("cart.ts") && !lena.includes("Before you sign off"));
});

test("once the engineer has signed off, the questions go and the result shows", () => {
  const s = signoff(asks, "bo", [{ kind: "review", who: "ana", state: "APPROVED", trusted: true }]);
  const t = text(message(everyone[0]!, pr, s, {}, { questions: 1, answered: 1, passed: 1, graded: true, reasons: [] }));
  assert.match(t, /✓ \*Engineer\* · signed off · understood 1 of 1/);
  assert.ok(!t.includes("Before you sign off"));
});

function fakeSlack(replies: Record<string, object[]>) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const f = (async (url: string, init: { body: string }) => {
    const method = url.split("/").pop()!;
    calls.push({ method, body: JSON.parse(init.body) });
    return { json: async () => replies[method]!.shift() ?? { ok: true } };
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("people with a Slack ID are messaged once, then their message is updated; the rest are skipped", async () => {
  const ids = new Map([["@ana", "U0ANA0001"]]);
  const render = (p: (typeof everyone)[number]) => message(p, pr, signoff(asks, "bo", []), {});
  const first = fakeSlack({ "chat.postMessage": [{ ok: true, channel: "D1", ts: "1.1" }] });
  const one = await sendAll("xoxb-test", ids, everyone, render, {}, first.f);
  assert.deepEqual(one.sent, { "@ana": { channel: "D1", ts: "1.1" } });
  assert.deepEqual(first.calls.map((c) => [c.method, c.body.channel]), [["chat.postMessage", "U0ANA0001"]]);
  const again = fakeSlack({ "chat.update": [{ ok: true }] });
  const two = await sendAll("xoxb-test", ids, everyone, render, one.sent, again.f);
  assert.deepEqual(two.sent, one.sent);
  assert.deepEqual(again.calls.map((c) => [c.method, c.body.ts]), [["chat.update", "1.1"]]);
});

test("someone no longer asked is told so; a deleted message is sent again; failures are reported, not thrown", async () => {
  const prior: Sent = { "@ana": { channel: "D1", ts: "1.1" }, "@old": { channel: "D9", ts: "9.9" } };
  const render = (p: (typeof everyone)[number]) => message(p, pr, signoff(asks, "bo", []), {});
  const slack = fakeSlack({ "chat.update": [{ ok: false, error: "message_not_found" }, { ok: true }], "chat.postMessage": [{ ok: true, channel: "D1", ts: "2.2" }] });
  const r = await sendAll("xoxb-test", new Map([["@ana", "U0ANA0001"]]), everyone, render, prior, slack.f);
  assert.deepEqual(r.sent, { "@ana": { channel: "D1", ts: "2.2" } });
  assert.match(JSON.stringify(slack.calls.at(-1)!.body), /no longer asked/);
  const broken = fakeSlack({ "chat.postMessage": [{ ok: false, error: "invalid_auth" }] });
  const b = await sendAll("xoxb-bad", new Map([["@ana", "U0ANA0001"]]), everyone, render, {}, broken.f);
  assert.deepEqual(b, { sent: {}, problems: ["@ana: invalid_auth"] });
});

test("which message is whose rides in Vera's comment", () => {
  const sent: Sent = { "@ana": { channel: "D1", ts: "1.1" } };
  const body = withSent("<!-- vera-review -->\nthe rest", sent);
  assert.deepEqual(readSent(body), sent);
  assert.equal(withSent(body, { "@ana": { channel: "D1", ts: "2.2" } }).match(/vera-slack/g)?.length, 1);
  assert.equal(withSent(body, {}), "<!-- vera-review -->\nthe rest");
  assert.equal(withSent("<!-- vera-review -->\n\n\nx", {}), "<!-- vera-review -->\n\n\nx");
});
