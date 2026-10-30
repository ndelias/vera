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
  exam: null,
  ai: [],
  plan: { asks: [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }], notes: [] },
  trace: createTrace(),
};

test("laid out like the site's mock-up: what it touches, then sign-off, then how Vera decided, folded", () => {
  const md = toMarkdown(base);
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /###### SIGN-OFF · WAITING ON 1 OF 1\n\n<picture>.*alt="Waiting"><\/picture> \*\*Engineer\*\* · @ana · waiting · owns Checkout$/m);
  const order = ["###### WHAT THIS TOUCHES", "###### SIGN-OFF", "<details><summary>How Vera decided", "**Checkout** (high)", "</details>"].map((x) => md.indexOf(x));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(!order.includes(-1));
  assert.match(md, /^1 file, \+3 −1/m);
});

test("each place has its square, links to its lines in Files changed (unless the file isn't in the PR), and says why", () => {
  const md = toMarkdown(base);
  const hash = createHash("sha256").update("a.ts").digest("hex");
  assert.ok(md.includes(`<img src="https://vera-agent.vercel.app/dots/high.svg" width="16" height="10" alt="High"></picture> [\`a.ts\` L10-24](https://github.com/o/r/pull/1/files#diff-${hash}R10 "a.ts") · Applies the discount.\n<sub>A negative total is possible. · @ana checks this</sub>`));
  assert.match(md, /alt="Low"><\/picture> `gone\.ts` L3 · Old helper\.\n<sub>Still imported elsewhere\? · @ana checks this<\/sub>/);
});

test("the likely-AI flag sits under the places, as on the site", () => {
  const md = toMarkdown({ ...base, ai: ["AI help disclosed", "412 lines"] });
  assert.match(md, /^> <img src="https:\/\/vera-agent\.vercel\.app\/dots\/ai-flag\.svg" [^>]*alt="Likely AI-written"> AI help disclosed, 412 lines\.$/m);
  assert.ok(md.indexOf("ai-flag.svg") < md.indexOf("###### SIGN-OFF"));
  assert.ok(!toMarkdown(base).includes("ai-flag.svg"));
});

test("says plainly when no declared area fits and nobody is named", () => {
  const md = toMarkdown({ ...base, areas: { teams: [] }, brief: null, plan: { asks: [], notes: ["No lead is declared to ask."] } });
  assert.match(md, /###### SIGN-OFF · NOBODY TO ASK/);
  assert.match(md, /None of the declared areas fit this change\./);
  assert.match(md, /> No lead is declared to ask\./);
  assert.match(md, /The Briefer gave no answer this time\./);
  assert.ok(!md.includes("Sign off by approving"));
});

test("model-written text keeps its ellipses and pipes, stays on its line and can't add HTML", () => {
  const brief = { summary: "Adds <details> to the page", places: [{ file: "a.ts", lines: "1", what: "Waits...", why: "Pipes a | b\ninto `<Foo>`", risk: "medium" as const }] };
  const md = toMarkdown({ ...base, brief });
  assert.match(md, /_Adds &lt;details> to the page_/);
  assert.ok(md.includes(" · Waits...\n<sub>Pipes a | b into `<Foo>`. · @ana checks this</sub>"));
});

test("the understanding check: questions after the places, the good answers sealed", () => {
  const exam = { questions: [{ question: "What happens after 3 retries?", good_answer: "The job is marked failed.", cites: [] }], why: "it's likely AI-written" };
  const md = toMarkdown({ ...base, exam }, undefined, "sk-test");
  assert.match(md, /###### BEFORE YOU SIGN OFF\n\n1\. What happens after 3 retries\?\n\n<sub>For @ana, because it's likely AI-written\./);
  assert.ok(md.indexOf("###### WHAT THIS TOUCHES") < md.indexOf("###### BEFORE YOU SIGN OFF"));
  assert.ok(md.indexOf("###### BEFORE YOU SIGN OFF") < md.indexOf("###### SIGN-OFF"));
  assert.ok(!md.includes("marked failed"));
  assert.ok(!toMarkdown({ ...base, exam }).includes("BEFORE YOU SIGN OFF"), "no secret, no questions");
});
