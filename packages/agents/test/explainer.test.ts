import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { explainRequest, parseExplanation } from "../src/explainer.ts";

const reply = (text: string, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
  ({ stop_reason: stop, content: [{ type: "text", text }] }) as unknown as Anthropic.Message;

test("the question goes in with the spot, the file's changes and the thread", () => {
  const r = explainRequest("m", { title: "Coupons", about: null, spot: { file: "a.ts", lines: "10-12", what: "Applies the discount", why: "Totals can go negative" }, diff: "@@ -1 +1 @@\n-x\n+y", thread: [{ who: "vera", body: "Verify 1 of 1" }, { who: "ana", body: "Why clamp here?" }] });
  const content = String(r.messages[0]!.content);
  assert.match(content, /a\.ts lines 10-12/);
  assert.match(content, /```diff\n@@ -1 \+1 @@/);
  assert.match(content, /ana: Why clamp here\?$/);
});

test("an answer, whether the author is needed, or nothing when it's unusable", () => {
  assert.deepEqual(parseExplanation(reply(JSON.stringify({ answer: " It stops negative totals. ", needsAuthor: true }))), { answer: "It stops negative totals.", needsAuthor: true });
  assert.equal(parseExplanation(reply("{", "max_tokens")), null);
  assert.equal(parseExplanation(reply(JSON.stringify({ answer: "", needsAuthor: false }))), null);
});
