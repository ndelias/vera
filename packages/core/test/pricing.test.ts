import assert from "node:assert/strict";
import { test } from "node:test";
import { costUsd } from "../src/pricing.ts";

test("Opus 5.5 cost uses published input, output and cache-read rates", () => {
  const usd = costUsd("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000 });
  assert.equal(usd, 4 + 2 + 0.2);
});

test("batch requests cost half", () => {
  const u = { inputTokens: 60_000, outputTokens: 6_000 };
  assert.equal(costUsd("claude-opus-5-5", u, true), costUsd("claude-opus-5-5", u) / 2);
});

test("an unpriced model fails loudly instead of costing zero", () => {
  assert.throws(() => costUsd("some-model", { inputTokens: 1, outputTokens: 1 }), /no price/);
});
