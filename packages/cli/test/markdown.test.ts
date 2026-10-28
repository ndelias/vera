import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createTrace } from "@vera/core";
import { MARKER, toMarkdown } from "../src/markdown.ts";
import type { Review } from "../src/review.ts";

const base: Review = {
  pull: { ref: { owner: "o", repo: "r", number: 1, url: "u" }, title: "t", body: "", baseRef: "main", headSha: "abc", author: "ana", files: [{ path: "a.ts", status: "modified", additions: 3, deletions: 1 }], commitMessages: [] },
  ownership: { source: ".vera.yml", areas: [], people: [] },
  areas: { teams: [{ team: "Checkout", confidence: "high", reason: "cart | totals" }] },
  design: { visible: false, confidence: "high", what: "No design decision" },
  brief: { summary: "Adds a coupon field to the cart.", places: [{ file: "a.ts", lines: "10-24", what: "Applies the discount", why: "A negative total is possible", risk: "high" }, { file: "gone.ts", lines: "3", what: "Old helper", why: "Still imported elsewhere?", risk: "low" }] },
  ai: [],
  plan: { asks: [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }], notes: [] },
  trace: createTrace(),
};

test("action first: who signs off, then where to look, then how Vera decided, folded", () => {
  const md = toMarkdown(base);
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /### Vera · 1 sign-off needed\n\n\| Who \| Role \| Sign-off \|\n\|---\|---\|---\|\n\| @ana \| engineer \| waiting \|/);
  const order = ["### Vera", "#### Where to look first", "<details><summary>How Vera decided", "**Checkout** (high)", "</details>"].map((x) => md.indexOf(x));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(!order.includes(-1));
  assert.match(md, /- @ana, engineer: ask\. owns Checkout\./);
  assert.match(md, /^1 file, \+3 −1/m);
});

test("each place is a table row linking to its lines in Files changed, unless the file isn't in the PR", () => {
  const md = toMarkdown(base);
  const hash = createHash("sha256").update("a.ts").digest("hex");
  assert.ok(md.includes(`| **High** | [\`a.ts\` L10-24](https://github.com/o/r/pull/1/files#diff-${hash}R10 "a.ts") | Applies the discount. | A negative total is possible. |`));
  assert.match(md, /\| \*\*Low\*\* \| `gone\.ts` L3<br><sub>gone\.ts<\/sub> \|/);
});

test("says plainly when no declared area fits and nobody is named", () => {
  const md = toMarkdown({ ...base, areas: { teams: [] }, brief: null, plan: { asks: [], notes: ["No lead is declared to ask."] } });
  assert.match(md, /### Vera · Nobody to ask/);
  assert.match(md, /None of the declared areas fit this change\./);
  assert.match(md, /- Nobody named\./);
  assert.match(md, /> No lead is declared to ask\./);
  assert.match(md, /The Briefer gave no answer this time\./);
});

test("model-written text keeps its ellipses, stays in its cell and can't add HTML", () => {
  const brief = { summary: "Adds <details> to the page", places: [{ file: "a.ts", lines: "1", what: "Waits...", why: "Pipes a | b\ninto `<Foo>`", risk: "medium" as const }] };
  const md = toMarkdown({ ...base, brief });
  assert.match(md, /_Adds &lt;details> to the page_/);
  assert.ok(md.includes("| Waits... | Pipes a \\| b into `<Foo>`. |"));
});
