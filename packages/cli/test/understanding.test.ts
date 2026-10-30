import { test } from "node:test";
import assert from "node:assert/strict";
import { signoff, type Ask } from "@vera/rules";
import { MARKER } from "../src/markdown.ts";
import { statusBlock, toCheck } from "../src/signoff.ts";
import { describe, examMarker, latestAnswers, open, parseAnswers, readExam, readGrades, seal } from "../src/understanding.ts";

test("sealed answers open only with the same key", () => {
  const sealed = seal("the job is marked failed", "sk-a");
  assert.equal(open(sealed, "sk-a"), "the job is marked failed");
  assert.equal(open(sealed, "sk-b"), null);
  const body = examMarker([{ question: "Q?", good_answer: "secret answer", cites: [] }], "it's likely AI-written", "sk-a", "2026-10-28T10:00:00Z");
  const exam = readExam(body)!;
  assert.deepEqual(exam.questions, ["Q?"]);
  assert.ok(!Buffer.from(body.slice(15, -4), "base64").toString().includes("secret answer"));
  assert.deepEqual(JSON.parse(open(exam.keys, "sk-a")!), ["secret answer"]);
});

test("numbered answers, each running until the next number", () => {
  const a = parseAnswers("Looks good.\n\n/vera sign-off\n1. It retries 3 times,\nthen fails the job.\n2) Only admins.\n");
  assert.deepEqual([...a], [[1, "It retries 3 times, then fails the job."], [2, "Only admins."]]);
  assert.equal(parseAnswers("LGTM").size, 0);
});

test("the latest sign-off with answers, after the questions were asked", () => {
  const reviews = [
    { id: 7, who: "ana", state: "APPROVED", body: "1. old answer", trusted: true, at: "2026-10-28T09:00:00Z" },
    { id: 8, who: "ana", state: "APPROVED", body: "1. new answer", trusted: true, at: "2026-10-28T11:00:00Z" },
  ];
  const comments = [
    { id: 3, who: "ana", body: "/vera sign-off\n1. from a comment", trusted: true, at: "2026-10-28T10:30:00Z" },
    { id: 4, who: "ana", body: "1. not a sign-off", trusted: true, at: "2026-10-28T12:00:00Z" },
  ];
  assert.deepEqual(latestAnswers("@ana", "2026-10-28T10:00:00Z", reviews, comments, MARKER), { id: "r8", answers: new Map([[1, "new answer"]]) });
  assert.deepEqual(latestAnswers("@ana", "2026-10-28T10:00:00Z", [], comments, MARKER)?.id, "c3");
  assert.equal(latestAnswers("@ana", "2026-10-28T13:00:00Z", reviews, comments, MARKER), null);
});

test("the sign-off list shows understanding next to the engineer's sign-off, and keeps grades", () => {
  const asks: Ask[] = [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }];
  const s = signoff(asks, "bo", [{ kind: "review", who: "ana", state: "APPROVED", trusted: true }]);
  const u = { questions: 2, answered: 2, passed: 1, graded: true, reasons: ["Q1 ✓ right", "Q2 ✗ missed the retry"] };
  const block = statusBlock(s, asks, u, { "r8:0": { pass: true, reason: "right" } });
  assert.match(block, /\*\*Engineer\*\* · @ana · signed off · understood 1 of 2 · owns Checkout$/m);
  assert.deepEqual(readGrades(block), { "r8:0": { pass: true, reason: "right" } });
  assert.match(toCheck(s, u).summary, /2\. Q2 ✗ missed the retry/);
  assert.equal(describe({ ...u, answered: 0 }), "questions not answered");
});
