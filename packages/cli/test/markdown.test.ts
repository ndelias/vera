import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createTrace } from "@vera/core";
import { MARKER, toMarkdown } from "../src/markdown.ts";
import { readBrief } from "../src/people.ts";
import type { Review } from "../src/review.ts";

const base: Review = {
  pull: { ref: { owner: "o", repo: "r", number: 1, url: "u" }, title: "t", body: "", baseRef: "main", headSha: "abc", author: "ana", files: [{ path: "a.ts", status: "modified", additions: 3, deletions: 1 }], commitMessages: [] },
  ownership: { source: ".vera.yml", areas: [], people: [] },
  areas: { teams: [{ team: "Checkout", confidence: "high", reason: "cart | totals" }] },
  design: { visible: false, confidence: "high", what: "No design decision" },
  brief: { summary: "Adds a coupon field to the cart.", places: [{ file: "a.ts", lines: "10-24", what: "Applies the discount", why: "A negative total is possible", risk: "high" }, { file: "gone.ts", lines: "3", what: "Old helper", why: "Still imported elsewhere?", risk: "low" }] },
  exam: null,
  ai: [],
  plan: { asks: [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }], notes: [] },
  trace: createTrace(),
};

test("one block per person: their roles, where to look and their questions; how Vera decided folded below", () => {
  const md = toMarkdown(base);
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /^_Adds a coupon field to the cart\._$/m);
  assert.match(md, /###### WHO SIGNS OFF · WAITING ON 1 OF 1\n\n#### @ana\n\n<picture>.*alt="Waiting"><\/picture> \*\*Engineer\*\* · waiting · owns Checkout$/m);
  const order = ["#### @ana", "| Look at | Why |", "<details><summary>How Vera decided", "**Checkout** (high)", "</details>"].map((x) => md.indexOf(x));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(!order.includes(-1));
  assert.match(md, /^1 file, \+3 −1/m);
});

test("each place is a row: its square, a link to its lines in Files changed (unless the file isn't in the PR), what and why", () => {
  const md = toMarkdown(base);
  const hash = createHash("sha256").update("a.ts").digest("hex");
  assert.ok(md.includes(`<img src="https://vera-agent.vercel.app/dots/high.svg" width="16" height="10" alt="High"></picture> [\`a.ts\` L10-24](https://github.com/o/r/pull/1/files#diff-${hash}R10 "a.ts") · Applies the discount. | A negative total is possible. |`));
  assert.match(md, /alt="Low"><\/picture> `gone\.ts` L3 · Old helper\. \| Still imported elsewhere\? \|$/m);
});

test("files with the same name show enough of their path to tell apart", () => {
  const places = ["src/hold/piece.ts", "src/spring/piece.ts", "src/x.ts"].map((file) => ({ file, lines: "1", what: "w", why: "y", risk: "low" as const }));
  const md = toMarkdown({ ...base, brief: { summary: "", places } });
  for (const label of ["hold/piece.ts", "spring/piece.ts", "x.ts"]) assert.ok(md.includes(`\`${label}\` L1`), label);
});

test("one person asked for several roles gets one block; designers see the design call, docs people the docs", () => {
  const asks = [
    { who: "@ana", role: "engineer" as const, action: "ask" as const, why: "owns Checkout" },
    { who: "@ana", role: "docs" as const, action: "ask" as const, why: "changes documentation" },
    { who: "@lena", role: "design" as const, action: "ask-lead" as const, why: "might be a design decision (medium)" },
  ];
  const pull = { ...base.pull, files: [...base.pull.files, { path: "docs/coupons.md", status: "added", additions: 9, deletions: 0 }] };
  const md = toMarkdown({ ...base, pull, design: { visible: true, confidence: "medium", what: "A new coupon field in the cart" }, plan: { asks, notes: [] } });
  assert.equal(md.match(/^#### @ana$/gm)?.length, 1);
  assert.match(md, /\*\*Docs\*\* · waiting · changes documentation/);
  const lena = md.slice(md.indexOf("#### @lena"));
  assert.match(lena, /\*\*Design\*\* \(as lead\) · waiting/);
  assert.match(lena, /\| \*\*The design:\*\* A new coupon field in the cart\. \|/);
  assert.ok(!lena.includes("a.ts"), "the engineer's places stay in the engineer's block");
  assert.match(md.slice(0, md.indexOf("#### @lena")), /\| \*\*The docs:\*\* `docs\/coupons\.md` \|/);
});

test("the likely-AI flag sits under the summary, before the blocks", () => {
  const md = toMarkdown({ ...base, ai: ["AI help disclosed", "412 lines"] });
  assert.match(md, /^> <img src="https:\/\/vera-agent\.vercel\.app\/dots\/ai-flag\.svg" [^>]*alt="Likely AI-written"> AI help disclosed, 412 lines\.$/m);
  assert.ok(md.indexOf("ai-flag.svg") < md.indexOf("###### WHO SIGNS OFF"));
  assert.ok(!toMarkdown(base).includes("ai-flag.svg"));
});

test("says plainly when no declared area fits and nobody is named, and still says where to look", () => {
  const md = toMarkdown({ ...base, areas: { teams: [] }, plan: { asks: [], notes: ["No lead is declared to ask."] } });
  assert.match(md, /###### WHO SIGNS OFF · NOBODY TO ASK/);
  assert.match(md, /###### WHERE TO LOOK\n\n\| Look at \| Why \|/);
  assert.match(md, /None of the declared areas fit this change\./);
  assert.match(md, /> No lead is declared to ask\./);
  assert.ok(!md.includes("Sign off by approving"));
  assert.match(toMarkdown({ ...base, brief: null }), /The Briefer gave no answer this time\./);
});

test("model-written text keeps its ellipses, stays on its line, can't add HTML or end a table cell", () => {
  const brief = { summary: "Adds <details> to the page", places: [{ file: "a.ts", lines: "1", what: "Waits...", why: "Pipes a | b\ninto `<Foo>`", risk: "medium" as const }] };
  const md = toMarkdown({ ...base, brief });
  assert.match(md, /_Adds &lt;details> to the page_/);
  assert.ok(md.includes(" · Waits... | Pipes a \\| b into `<Foo>`. |"));
});

test("the understanding check: questions in the engineer's block, the good answers sealed", () => {
  const exam = { questions: [{ question: "What happens after 3 retries?", good_answer: "The job is marked failed.", cites: [] }], why: "it's likely AI-written" };
  const md = toMarkdown({ ...base, exam }, undefined, "sk-test");
  assert.match(md, /\*\*Before you sign off\*\*\n\n1\. What happens after 3 retries\?\n\n<sub>Asked because it's likely AI-written\./);
  assert.ok(md.indexOf("| Look at | Why |") < md.indexOf("**Before you sign off**"));
  assert.ok(md.indexOf("**Before you sign off**") < md.indexOf("<!-- /vera-status -->"));
  assert.ok(!md.includes("marked failed"));
  assert.ok(!toMarkdown({ ...base, exam }).includes("Before you sign off"), "no secret, no questions");
});

test("the blocks can be redrawn from the comment alone", () => {
  const md = toMarkdown(base);
  const brief = readBrief(md)!;
  assert.deepEqual(brief.spots.map((p) => [p.label, p.who]), [["a.ts", ["@ana"]], ["gone.ts", ["@ana"]]]);
  assert.equal(brief.spots[1]!.url, null);
});
