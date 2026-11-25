import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { clearedFor, hunksText, parseTriage, triageRequest, type Skip } from "../src/triage.ts";

const reply = (text: string, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
  ({ stop_reason: stop, content: [{ type: "text", text }] }) as unknown as Anthropic.Message;

test("the diff lists each file once, then its hunks by id", () => {
  const text = hunksText("Rename flag", [
    { id: 0, path: "a.ts", text: "@@ -1 +1 @@\n-x\n+y" },
    { id: 1, path: "a.ts", text: "@@ -9 +9 @@\n-z\n+w" },
    { id: 2, path: "b.md", text: "@@ -1 +1 @@\n-old\n+new" },
  ]);
  assert.equal(text.match(/=== a\.ts/g)?.length, 1);
  assert.match(text, /\[h1\]\n@@ -9/);
  assert.match(text, /=== b\.md\n\[h2\]/);
});

test("skips keep only real hunks and known reasons, once each", () => {
  const skips = parseTriage(
    reply(JSON.stringify({ skip: [
      { hunk: 0, reason: "imports", note: "sorted imports" },
      { hunk: 0, reason: "formatting", note: "again" },
      { hunk: 7, reason: "docs", note: "no such hunk" },
      { hunk: 1, reason: "vibes", note: "not a reason" },
      { hunk: 2, reason: "docs", note: "readme" },
    ] })),
    new Set([0, 1, 2]),
  );
  assert.deepEqual(skips?.map((s) => s.hunk), [0, 2]);
});

test("a cut-off or refused answer skips nothing", () => {
  assert.equal(parseTriage(reply('{"skip": [', "max_tokens"), new Set([0])), null);
  assert.equal(parseTriage(reply("", "refusal"), new Set([0])), null);
  assert.equal(parseTriage(reply("not json"), new Set([0])), null);
});

test("the request caches the instructions and asks for the schema", () => {
  const r = triageRequest("claude-sonnet-5-5", "t", [{ id: 0, path: "a", text: "@@ -1 +1 @@" }]);
  assert.equal((r.system as { cache_control?: unknown }[])[0]?.cache_control !== undefined, true);
  assert.equal(r.output_config?.format?.type, "json_schema");
});

test("docs and wording are cleared for engineers only", () => {
  const skips: Skip[] = [
    { hunk: 0, reason: "docs", note: "" },
    { hunk: 1, reason: "copy", note: "" },
    { hunk: 2, reason: "lockfile", note: "" },
  ];
  assert.deepEqual(clearedFor(skips, "engineer").map((s) => s.hunk), [0, 1, 2]);
  assert.deepEqual(clearedFor(skips, "docs").map((s) => s.hunk), [2]);
  assert.deepEqual(clearedFor(skips, "any").map((s) => s.hunk), [2]);
});
