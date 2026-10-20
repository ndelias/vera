import assert from "node:assert/strict";
import { test } from "node:test";
import { createTrace, fromJsonl, record, toJsonl, totals } from "../src/trace.ts";

const change = { host: "github" as const, repo: "acme/web", number: 42, url: "https://github.com/acme/web/pull/42" };

function sampleTrace() {
  const t = createTrace();
  record(t, { type: "run.start", at: 1000, runId: "r1", change, models: { mapper: "claude-opus-5-5" } });
  record(t, { type: "agent.start", at: 1001, agent: "mapper", task: "map the change" });
  record(t, {
    type: "model.call", at: 1500, agent: "mapper", model: "claude-opus-5-5", inputTokens: 10_000, outputTokens: 1_000,
    cacheReadTokens: 2_000, cacheWriteTokens: 0, costUsd: 0.0604, latencyMs: 480, stopReason: "end_turn",
  });
  record(t, {
    type: "tool.call", at: 1200, agent: "mapper", tool: "read_diff", input: { pr: 42 }, summary: "3 files",
    ok: true, latencyMs: 90,
  });
  record(t, { type: "agent.end", at: 1600, agent: "mapper", latencyMs: 599 });
  record(t, { type: "run.end", at: 2000, status: "ok" });
  return t;
}

test("totals add up model and tool calls", () => {
  const t = totals(sampleTrace());
  assert.equal(t.modelCalls, 1);
  assert.equal(t.toolCalls, 1);
  assert.equal(t.inputTokens, 12_000);
  assert.equal(t.outputTokens, 1_000);
  assert.equal(t.costUsd, 0.0604);
  assert.equal(t.latencyMs, 1000);
});

test("a trace survives a JSONL round trip", () => {
  const t = sampleTrace();
  assert.deepEqual(fromJsonl(toJsonl(t)), t);
});

test("an unknown trace version is rejected", () => {
  assert.throws(() => fromJsonl('{"version":99}\n'), /unsupported trace version/);
});

test("secrets never reach the trace", () => {
  const t = createTrace();
  const stored = record(t, {
    type: "tool.call", at: 1, agent: "mapper", tool: "fetch", ok: true, latencyMs: 1,
    input: { headers: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz" }, note: "key sk-ant-api03-abcdefghijkl" },
    summary: "token ghp_abcdefghijklmnopqrstuvwxyz0123",
  });
  const json = JSON.stringify(stored);
  assert.doesNotMatch(json, /sk-ant-api03|ghp_abc|abcdefghijklmnopqrstuvwxyz"/);
  assert.match(json, /\[redacted:field\]/);
  assert.match(json, /\[redacted:anthropic-key\]/);
  assert.match(json, /\[redacted:github-token\]/);
});
