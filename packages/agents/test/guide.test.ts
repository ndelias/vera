import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { guideRequest, parseGuide } from "../src/guide.ts";

const reply = (text: string, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
  ({ stop_reason: stop, content: [{ type: "text", text }] }) as unknown as Anthropic.Message;

test("the Guide reads the same numbered hunks as Triage", () => {
  const r = guideRequest("m", "Coupons", [{ id: 0, path: "a.ts", text: "@@ -1 +1 @@\n-x\n+y" }]);
  assert.match(String(r.messages[0]!.content), /=== a\.ts\n\[h0\]/);
});

test("every hunk ends up in exactly one step, and nothing is left unlisted", () => {
  const steps = parseGuide(reply(JSON.stringify({ steps: [
    { title: "Applies the coupon", explain: "Discount at checkout.", hunks: [0, 2, 9] },
    { title: "Tests it", explain: "Covers two coupons.", hunks: [2, 3] },
    { title: "Nothing real", explain: "", hunks: [42] },
  ] })), [0, 1, 2, 3]);
  assert.deepEqual(steps?.map((s) => [s.title, s.hunks]), [["Applies the coupon", [0, 2]], ["Tests it", [3]], ["Other changes", [1]]]);
});

test("an unusable answer gives no walkthrough", () => {
  assert.equal(parseGuide(reply("{", "max_tokens"), [0]), null);
  assert.equal(parseGuide(reply(JSON.stringify({ steps: [] })), [0]), null);
  assert.equal(parseGuide(reply("not json"), [0]), null);
});
