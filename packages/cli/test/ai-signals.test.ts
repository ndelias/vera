import { test } from "node:test";
import assert from "node:assert/strict";
import { aiSignals } from "../src/review.ts";
import type { Pull } from "@vera/tools/github";

const pull = (author: string, body: string, commitMessages: string[]): Pull => ({
  ref: { owner: "o", repo: "r", number: 1, url: "https://github.com/o/r/pull/1" },
  title: "t", body, baseRef: "main", author, files: [], commitMessages,
});

test("flags coding agents' accounts and explicit markers", () => {
  assert.deepEqual(aiSignals(pull("devin-ai-integration[bot]", "", ["x"])), ["opened by devin-ai-integration[bot]"]);
  assert.match(aiSignals(pull("ana", "", ["Fix it\n\nCo-authored-by: Claude <noreply@anthropic.com>", "tests"]))[0]!, /1 of 2 commits/);
  assert.deepEqual(aiSignals(pull("ana", "Generated with [Claude Code](https://claude.com/claude-code)", [])), ["says it was generated with an AI tool"]);
});

test("doesn't flag other bots or ordinary changes", () => {
  assert.deepEqual(aiSignals(pull("dependabot[bot]", "Bumps lodash from 4.17.20 to 4.17.21.", ["Bump lodash"])), []);
  assert.deepEqual(aiSignals(pull("renovate[bot]", "", ["Update dependency"])), []);
  assert.deepEqual(aiSignals(pull("ana", "Refactor the cart", ["Co-authored-by: Raj <raj@example.com>"])), []);
});
