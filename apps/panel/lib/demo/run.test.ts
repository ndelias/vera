import assert from "node:assert/strict";
import { test } from "node:test";
import { costUsd, createTrace, fromJsonl, record, toJsonl, totals } from "@vera/core";
import { ASK, BEFORE_REVIEW, MODEL, QUESTIONS, afterReview, askEvents } from "./run.ts";

const all = (answers: Record<string, string>) => [...BEFORE_REVIEW, ...afterReview(30_000, answers)];
const right = Object.fromEntries(QUESTIONS.questions.map((q) => [q.id, q.answer]));

test("the demo run is a valid trace that survives a JSONL round trip", () => {
  const t = createTrace();
  for (const e of all(right)) record(t, e);
  assert.deepEqual(fromJsonl(toJsonl(t)).events, t.events);
});

test("events are in time order", () => {
  const events = all(right);
  for (let i = 1; i < events.length; i++) assert.ok(events[i]!.at >= events[i - 1]!.at, `event ${i} goes back in time`);
});

test("every agent that starts also ends", () => {
  const events = all(right);
  for (const e of events.filter((e) => e.type === "agent.start")) {
    assert.ok(events.some((x) => x.type === "agent.end" && x.agent === e.agent), `${e.agent} never ends`);
  }
});

test("costs come from the price table, and the run costs what the plan says", () => {
  const events = all(right);
  for (const e of events) {
    if (e.type !== "model.call") continue;
    const expected = costUsd(MODEL, { inputTokens: e.inputTokens, outputTokens: e.outputTokens, cacheReadTokens: e.cacheReadTokens });
    assert.equal(e.costUsd, expected);
  }
  const t = createTrace();
  for (const e of events) record(t, e);
  const sums = totals(t);
  assert.ok(sums.costUsd > 0.2 && sums.costUsd < 0.5, `cost ${sums.costUsd} is outside the plan's estimate`);
});

test("each question's answer is one of its options", () => {
  for (const q of QUESTIONS.questions) assert.ok(q.options.some((o) => o.id === q.answer), q.id);
});

test("a wrong answer is recorded, and sign-off still completes", () => {
  const events = afterReview(0, { timeout: "a", rounding: "b" });
  const grade = events.find((e) => e.type === "agent.output" && e.agent === "examiner");
  assert.deepEqual(grade && grade.type === "agent.output" ? grade.output : null, { right: 1, of: 2, recorded: true });
  assert.ok(events.some((e) => e.type === "run.end" && e.status === "ok"));
});

test("Vera holds back an open check's answer, and answers fully once it's closed", () => {
  const down = ASK.find((a) => a.check)!;
  const reply = (open: boolean) => askEvents(0, down, open).find((e) => e.type === "chat" && e.who === "@vera");
  const held = reply(true);
  const full = reply(false);
  assert.ok(held && held.type === "chat" && held.text === down.check!.hint);
  assert.ok(full && full.type === "chat" && full.text === down.answer);
});

test("every answer from Vera cites the code it rests on", () => {
  for (const e of [...all(right), ...ASK.flatMap((a) => askEvents(0, a, false))]) {
    if (e.type === "chat" && e.who === "@vera") assert.ok(e.refs && e.refs.length > 0, e.text);
  }
});
