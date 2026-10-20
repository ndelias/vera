import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseEnv, secret } from "../src/env.ts";

test("parses .env lines, comments and quotes", () => {
  assert.deepEqual(parseEnv('# comment\nA=1\nB="two words"\n\nC=\'x=y\'\nnot a line'), { A: "1", B: "two words", C: "x=y" });
});

test("reads a secret from a .env file in a parent directory", () => {
  const root = mkdtempSync(join(tmpdir(), "vera-env-"));
  writeFileSync(join(root, ".env"), "VERA_TEST_SECRET=from-file\n");
  delete process.env.VERA_TEST_SECRET;
  const nested = join(root);
  assert.equal(secret("VERA_TEST_SECRET", nested), "from-file");
});

test("a missing secret names the variable but never shows a value", () => {
  const empty = mkdtempSync(join(tmpdir(), "vera-env-"));
  writeFileSync(join(empty, ".env"), "OTHER=sk-ant-should-not-appear\n");
  assert.throws(() => secret("VERA_MISSING_SECRET", empty), (e: Error) => {
    assert.match(e.message, /VERA_MISSING_SECRET is not set/);
    assert.doesNotMatch(e.message, /sk-ant/);
    return true;
  });
});
