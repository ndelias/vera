import { test } from "node:test";
import assert from "node:assert/strict";
import { createTrace } from "@vera/core";
import { MARKER, toMarkdown } from "../src/markdown.ts";
import type { Review } from "../src/review.ts";

const base: Review = {
  pull: { ref: { owner: "o", repo: "r", number: 1, url: "u" }, title: "t", body: "", baseRef: "main", author: "ana", files: [{ path: "a.ts", status: "modified", additions: 3, deletions: 1 }], commitMessages: [] },
  ownership: { source: ".vera.yml", areas: [], people: [] },
  areas: { teams: [{ team: "Checkout", confidence: "high", reason: "cart | totals" }] },
  design: { visible: false, confidence: "high", what: "No design decision" },
  ai: [],
  plan: { asks: [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }], notes: [] },
  trace: createTrace(),
};

test("the comment carries the marker, the areas and a who-to-ask table", () => {
  const md = toMarkdown(base);
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /\*\*Checkout\*\* \(high\)/);
  assert.match(md, /\| @ana \| engineer \| ask \| owns Checkout \|/);
  assert.match(md, /doesn't approve, block or change anything/);
  assert.match(md, /^1 file, \+3 −1/m);
});

test("says plainly when no declared area fits and nobody is named", () => {
  const md = toMarkdown({ ...base, areas: { teams: [] }, plan: { asks: [], notes: ["No lead is declared to ask."] } });
  assert.match(md, /None of the declared areas fit this change\./);
  assert.match(md, /Nobody named\./);
  assert.match(md, /> No lead is declared to ask\./);
});
