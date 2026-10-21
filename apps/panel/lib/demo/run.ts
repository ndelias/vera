// The demo's scripted run: one fictional pull request at a fictional shop
// (Larkspur), written as the trace the real agents will write
// (@vera/core's TraceEvent). The viewer replays it; once the agents run for
// real, their traces play in the same viewer. Steps, tokens and timings are
// illustrative; costs come from the real price table.
// Copy is a draft in Nahuel's voice, for him to edit.

import { costUsd } from "@vera/core/pricing";
import type { ChangeRef, TraceEvent } from "@vera/core/trace";

export const MODEL = "claude-opus-5-5";

export type Risk = "high" | "mid" | "low";

export type ChangedFile = { path: string; added: number; removed: number };

export type MapperOutput = {
  areas: { name: string; risk: Risk; files: string[]; why: string }[];
  likelyAi: { reasons: string[] };
};

export type Brief = { role: string; to: string; via: "github" | "slack"; summary: string; points: string[] };
export type BrieferOutput = { briefs: Brief[] };

export type Question = {
  id: string;
  prompt: string;
  file: string;
  diff: string[];
  options: { id: string; text: string }[];
  answer: string;
  explain: string;
};
export type ExaminerOutput = { questions: Question[] };

export const CHANGE: ChangeRef & {
  author: string;
  aiDisclosed: boolean;
  files: ChangedFile[];
  labels: string[];
} = {
  host: "github",
  repo: "larkspur/shop",
  number: 482,
  url: "#",
  title: "Move checkout totals to the new pricing service",
  author: "@mira",
  aiDisclosed: true,
  labels: ["behaviour-change"],
  files: [
    { path: "src/checkout/totals.ts", added: 120, removed: 64 },
    { path: "src/checkout/rounding.ts", added: 48, removed: 0 },
    { path: "src/pricing/client.ts", added: 76, removed: 0 },
    { path: "src/api/customer.ts", added: 18, removed: 4 },
    { path: "src/ui/OrderSummary.tsx", added: 38, removed: 12 },
    { path: "src/ui/OrderSummary.css", added: 14, removed: 6 },
    { path: "tests/checkout/totals.test.ts", added: 62, removed: 2 },
    { path: "tests/pricing/client.test.ts", added: 36, removed: 0 },
  ],
};

export const MAP: MapperOutput = {
  areas: [
    { name: "Checkout totals", risk: "high", files: ["src/checkout/totals.ts", "src/checkout/rounding.ts"], why: "Money: percentage codes now round differently" },
    { name: "Pricing client", risk: "high", files: ["src/pricing/client.ts"], why: "A new network call on the checkout path, with an 800 ms timeout" },
    { name: "Customer API", risk: "mid", files: ["src/api/customer.ts"], why: "Sends the customer's tier to a new service" },
    { name: "Order summary UI", risk: "mid", files: ["src/ui/OrderSummary.tsx", "src/ui/OrderSummary.css"], why: "A visible change at checkout" },
    { name: "Tests", risk: "low", files: ["tests/checkout/totals.test.ts", "tests/pricing/client.test.ts"], why: "Written with AI; the new rounding branches aren't covered" },
  ],
  likelyAi: {
    reasons: ["AI help disclosed (co-author trailer)", "412 lines added", "No tests for 2 new branches in rounding.ts", "2 review-bot findings still open"],
  },
};

export const BRIEFS: BrieferOutput = {
  briefs: [
    {
      role: "Engineering",
      to: "@you, @theo",
      via: "github",
      summary: "Pricing moves to a service, with a fallback when it's slow.",
      points: ["Timeout fallback in pricing/client.ts", "Rounding change in checkout/rounding.ts, with no tests for 2 new branches", "Review bot: 2 findings still open"],
    },
    {
      role: "Design",
      to: "@ines",
      via: "slack",
      summary: "The order summary gains a 'Prices updated' line when the service changes a price.",
      points: ["Preview deploy from CI, checkout step 3", "Uses the existing muted text style", "No layout change on mobile"],
    },
    {
      role: "Security",
      to: "@sam",
      via: "github",
      summary: "Checkout now sends the customer's tier to the pricing service.",
      points: ["Sent: cart items, currency, customer tier", "Not sent: customer ID, email or address", "Internal service; the call times out after 800 ms"],
    },
    {
      role: "Product",
      to: "@priya",
      via: "slack",
      summary: "Percentage discounts now round per item, not on the total.",
      points: ["Orders with several items can change by a cent or two", "3 active codes: SPRING15, WELCOME10, VIP20", "Fixed-amount codes are unchanged"],
    },
  ],
};

export const QUESTIONS: ExaminerOutput = {
  questions: [
    {
      id: "timeout",
      prompt: "The pricing service doesn't answer within 800 ms. What total does the customer see?",
      file: "src/pricing/client.ts",
      diff: [
        "+export async function quote(cart: Cart): Promise<Totals> {",
        "+  const res = await withTimeout(pricing.quote(cart), 800).catch(() => null);",
        "+  if (!res) return legacyTotals(cart); // fall back to in-house prices",
        "+  return res.totals;",
        "+}",
      ],
      options: [
        { id: "a", text: "An error asking them to try again" },
        { id: "b", text: "The in-house totals, as before this change" },
        { id: "c", text: "The last quote the service returned for that cart" },
      ],
      answer: "b",
      explain: "On a timeout, quote() falls back to legacyTotals(): the in-house prices, as before. No error, and no cached quote.",
    },
    {
      id: "rounding",
      prompt: "Which discount codes now give a different total?",
      file: "src/checkout/rounding.ts",
      diff: [
        "-  return round2(subtotal * (1 - pct)); // round the order total",
        "+  return sum(items.map((i) => round2(i.price * i.qty * (1 - pct)))); // round each line",
      ],
      options: [
        { id: "a", text: "Fixed-amount codes like SAVE10" },
        { id: "b", text: "Percentage codes on orders with several items" },
        { id: "c", text: "None: the code only moved" },
      ],
      answer: "b",
      explain: "Percentage codes now round each line instead of the total once, so orders with several items can differ by a cent or two. Fixed-amount codes don't go through this path.",
    },
  ],
};

/** Questions the reviewer can ask Vera on their turn. */
export type Ask = {
  id: string;
  question: string;
  tool: { name: string; summary: string };
  answer: string;
  refs: string[];
  /** Set when the question gives away an open check question: Vera points to the code instead. */
  check?: { question: string; hint: string };
};

export const ASK: Ask[] = [
  {
    id: "plain",
    question: "What did the coding agent change in totals.ts, in plain words?",
    tool: { name: "code.read", summary: "checkout/totals.ts, pricing/client.ts" },
    answer:
      "Before, totals.ts worked out prices itself. Now it asks the pricing service for a quote and keeps the old calculation as a fallback (legacyTotals). Rounding moved into its own file, rounding.ts. Nothing else in checkout calls the service directly.",
    refs: ["src/checkout/totals.ts:20-58", "src/pricing/client.ts:9-17"],
  },
  {
    id: "callers",
    question: "Who calls applyDiscount, and could any of them break?",
    tool: { name: "code.search", summary: "applyDiscount( → 14 callers in 6 files" },
    answer:
      "14 callers in 6 files. 12 pass whole orders and get the new per-item rounding. The 2 in admin refunds pass a single line, so nothing changes for them. None of them read the order-level total that was removed.",
    refs: ["src/checkout/totals.ts:44", "src/admin/refunds.ts:88"],
  },
  {
    id: "down",
    question: "What happens if the pricing service is down?",
    tool: { name: "code.read", summary: "pricing/client.ts, quote()" },
    answer:
      "Checkout gets the in-house totals, as before: quote() gives up after 800 ms and falls back to legacyTotals(). The customer sees no error and no 'Prices updated' line.",
    refs: ["src/pricing/client.ts:12-16"],
    check: {
      question: "timeout",
      hint: "That's one of your check questions, so I'll hold my answer until you've answered it. Look at quote() in src/pricing/client.ts, lines 12-16, and follow what happens when the call doesn't come back.",
    },
  },
  {
    id: "tests",
    question: "Why are there no tests for the new rounding?",
    tool: { name: "bots.read_findings", summary: "review bot: rounding.ts branches untested" },
    answer:
      "The tests the agent wrote cover the service call and the fallback, not the two new branches in rounding.ts (per-item lines, and lines with zero quantity). The review bot flagged the same gap. Worth asking @mira to add them before this merges.",
    refs: ["tests/checkout/totals.test.ts", "src/checkout/rounding.ts:12-24"],
  },
];

/** The reviewer's private thread with Vera on the PR. */
export const ASK_CHANNEL = "your review";

/** Vera answering one of the reviewer's questions, from `start`. */
export function askEvents(start: number, ask: Ask, checkOpen: boolean): TraceEvent[] {
  const held = Boolean(ask.check && checkOpen);
  return [
    { type: "chat", at: start, via: "github", channel: ASK_CHANNEL, who: "@you", text: ask.question },
    { type: "agent.start", at: start + 200, agent: "briefer", task: "Answer @you on the pull request" },
    tool("briefer", start + 500, ask.tool.name, ask.tool.summary, 280),
    call("briefer", start + 900, 3_600, 8_000, held ? 90 : 170, 1_500),
    {
      type: "chat",
      at: start + 2_500,
      via: "github",
      channel: ASK_CHANNEL,
      who: "@vera",
      text: held ? ask.check!.hint : ask.answer,
      refs: ask.refs,
    },
    { type: "agent.end", at: start + 2_600, agent: "briefer", latencyMs: 2_400 },
  ];
}

/** A reviewer asks Vera in Slack or on the PR; Vera reads the code and answers. */
function thread(
  at: number,
  via: "github" | "slack",
  channel: string,
  who: string,
  question: string,
  tools: [string, string][],
  answer: string,
  refs: string[],
): TraceEvent[] {
  const events: TraceEvent[] = [
    { type: "chat", at, via, channel, who, text: question },
    { type: "agent.start", at: at + 1_000, agent: "briefer", task: `Answer ${who} in ${channel}` },
  ];
  tools.forEach(([name, summary], i) => events.push(tool("briefer", at + 1_400 + i * 600, name, summary, 300)));
  const t = at + 1_400 + tools.length * 600;
  events.push(
    call("briefer", t, 4_200, 8_000, 190, 1_800),
    { type: "chat", at: t + 1_900, via, channel, who: "@vera", text: answer, refs },
    { type: "agent.end", at: t + 2_000, agent: "briefer", latencyMs: t + 2_000 - at - 1_000 },
  );
  return events;
}

const call = (agent: "mapper" | "briefer" | "examiner" | "signoff", at: number, input: number, cacheRead: number, output: number, latencyMs: number): TraceEvent => ({
  type: "model.call",
  at,
  agent,
  model: MODEL,
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: 0,
  costUsd: costUsd(MODEL, { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead }),
  latencyMs,
  stopReason: "end_turn",
});

const tool = (agent: "mapper" | "briefer" | "examiner" | "signoff", at: number, name: string, summary: string, latencyMs: number): TraceEvent => ({
  type: "tool.call",
  at,
  agent,
  tool: name,
  input: { repo: CHANGE.repo, pr: CHANGE.number },
  summary,
  ok: true,
  latencyMs,
});

/** Everything up to the reviewer's turn. */
export const BEFORE_REVIEW: TraceEvent[] = [
  { type: "run.start", at: 0, runId: "demo-482", change: CHANGE, models: { mapper: MODEL, briefer: MODEL, examiner: MODEL, signoff: MODEL } },
  { type: "agent.start", at: 300, agent: "mapper", task: "Map what #482 touches, and how risky it is" },
  tool("mapper", 700, "github.get_pull_request", "#482 · 8 files · +412 −88 · co-authored by a coding agent", 320),
  tool("mapper", 1400, "github.get_diff", "412 added, 88 removed", 540),
  tool("mapper", 2200, "codeowners.read", "checkout → @theo · ui → @ines · api → @sam", 90),
  tool("mapper", 2900, "code.search", "applyDiscount( → 14 callers in 6 files", 610),
  tool("mapper", 3800, "bots.read_findings", "review bot: 2 open (float rounding, no timeout test)", 260),
  tool("mapper", 4500, "ci.status", "tests passing · 61% of changed lines covered", 180),
  call("mapper", 5200, 21_400, 8_000, 1_350, 4_800),
  { type: "agent.output", at: 10_000, agent: "mapper", output: MAP },
  { type: "agent.end", at: 10_100, agent: "mapper", latencyMs: 9_800 },
  { type: "rule.eval", at: 10_600, rule: "src/ui/** → design", matched: true, detail: "OrderSummary.tsx, OrderSummary.css" },
  { type: "rule.eval", at: 11_000, rule: "src/api/** → security", matched: true, detail: "customer.ts sends the customer's tier to the pricing service" },
  { type: "rule.eval", at: 11_400, rule: "label behaviour-change → product", matched: true, detail: "label set by @mira" },
  { type: "rule.eval", at: 11_800, rule: "ai_changes → code owner, understanding check", matched: true, detail: "AI help disclosed, 412 lines (over 200), 2 untested branches" },
  { type: "rule.eval", at: 12_200, rule: "src/auth/** → security", matched: false, detail: "not touched" },
  { type: "agent.start", at: 12_700, agent: "briefer", task: "One brief per role" },
  tool("briefer", 13_100, "ci.preview", "preview deploy for #482 · 2 screens changed", 420),
  tool("briefer", 13_800, "code.read", "pricing/client.ts, api/customer.ts (fields sent)", 380),
  call("briefer", 14_400, 14_200, 8_000, 1_900, 5_200),
  { type: "agent.output", at: 19_800, agent: "briefer", output: BRIEFS },
  { type: "agent.end", at: 19_900, agent: "briefer", latencyMs: 7_200 },
  { type: "agent.start", at: 20_400, agent: "examiner", task: "Check the reviewer understood it (risky, likely AI-written)" },
  tool("examiner", 20_800, "code.read", "pricing/client.ts timeout path, checkout/rounding.ts", 300),
  call("examiner", 21_300, 9_800, 8_000, 820, 3_600),
  { type: "agent.output", at: 25_100, agent: "examiner", output: QUESTIONS },
];

/** Grading the reviewer's answers, then sign-off. Times are relative to the reviewer's approval. */
export function afterReview(start: number, answers: Record<string, string>): TraceEvent[] {
  const right = QUESTIONS.questions.filter((q) => answers[q.id] === q.answer).length;
  const min = 60_000;
  return [
    call("examiner", start + 200, 2_100, 0, 260, 1_400),
    {
      type: "agent.output",
      at: start + 1_700,
      agent: "examiner",
      output: { right, of: QUESTIONS.questions.length, recorded: true },
    },
    { type: "agent.end", at: start + 1_800, agent: "examiner", latencyMs: 1_800 },
    { type: "signoff", at: start + 1_900, role: "Engineering", who: "@you", via: "github", status: "approved", note: `understanding ${right} of ${QUESTIONS.questions.length}` },
    { type: "agent.start", at: start + 2_300, agent: "signoff", task: "Ask every role the rules name, in parallel" },
    call("signoff", start + 2_600, 6_000, 8_000, 700, 2_100),
    tool("signoff", start + 4_900, "github.request_review", "@theo, code owner (second reviewer)", 210),
    tool("signoff", start + 5_300, "slack.post", "#design · @ines, brief and preview", 240),
    tool("signoff", start + 5_700, "github.request_review", "@sam, security, brief attached", 200),
    tool("signoff", start + 6_100, "slack.post", "#product · @priya, the rounding change", 230),
    { type: "signoff", at: start + 6_400, role: "Code owner", who: "@theo", via: "github", status: "asked" },
    { type: "signoff", at: start + 6_400, role: "Design", who: "@ines", via: "slack", status: "asked" },
    { type: "signoff", at: start + 6_400, role: "Security", who: "@sam", via: "github", status: "asked" },
    { type: "signoff", at: start + 6_400, role: "Product", who: "@priya", via: "slack", status: "asked" },
    ...thread(
      start + 38 * min,
      "slack",
      "#design",
      "@ines",
      "@vera does the 'Prices updated' line show when nothing changed?",
      [["code.read", "ui/OrderSummary.tsx, the new line"]],
      "No. It only shows when the service's total differs from the in-house total for that cart. On a timeout it never shows, because the in-house total is used.",
      ["src/ui/OrderSummary.tsx:41"],
    ),
    { type: "signoff", at: start + 42 * min, role: "Design", who: "@ines", via: "slack", status: "approved", note: "Clear now. Preview looks right." },
    ...thread(
      start + 66 * min,
      "github",
      "PR #482",
      "@sam",
      "@vera is the customer tier ever logged?",
      [["code.search", "log( in the changed files → pricing/client.ts:31"]],
      "No. pricing/client.ts logs the cart ID and how long the call took, nothing else (line 31). The tier is only in the request body, and this change doesn't write it anywhere.",
      ["src/pricing/client.ts:31"],
    ),
    { type: "signoff", at: start + 70 * min, role: "Security", who: "@sam", via: "github", status: "approved", note: "Tier only, no customer ID. OK." },
    tool("signoff", start + 90 * min, "slack.post", "reminder to @priya, still waiting after 90 min", 220),
    { type: "signoff", at: start + 90 * min + 300, role: "Product", who: "@priya", via: "slack", status: "reminded" },
    ...thread(
      start + 118 * min,
      "slack",
      "#product",
      "@priya",
      "@vera which orders actually change, and by how much?",
      [
        ["code.read", "checkout/rounding.ts, lines 12-18"],
        ["code.search", "SPRING15|WELCOME10|VIP20 → config/discounts.ts"],
      ],
      "Only orders with a percentage code and two or more items. Each item now rounds on its own, so a total can move by a cent per item, usually up. With SPRING15, an $8.49 item and a $6.75 item came to $12.95; now they come to $12.96. Fixed-amount codes don't go through this code.",
      ["src/checkout/rounding.ts:12-18", "config/discounts.ts"],
    ),
    { type: "chat", at: start + 121 * min, via: "slack", channel: "#product", who: "@priya", text: "Up by a cent is fine. Approving." },
    { type: "signoff", at: start + 125 * min, role: "Product", who: "@priya", via: "slack", status: "approved", note: "Per-item rounding is what we want." },
    { type: "signoff", at: start + 140 * min, role: "Code owner", who: "@theo", via: "github", status: "approved", note: "Fallback and rounding read fine." },
    { type: "rule.eval", at: start + 140 * min + 200, rule: "Vera: sign-off", matched: true, detail: "5 of 5 approved, understanding recorded" },
    { type: "agent.end", at: start + 140 * min + 300, agent: "signoff", latencyMs: 140 * min },
    { type: "run.end", at: start + 140 * min + 400, status: "ok" },
  ];
}
