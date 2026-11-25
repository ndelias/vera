import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MARKER } from "../../../packages/cli/src/markdown.ts";
import { briefMarker, type Brief } from "../../../packages/cli/src/people.ts";
import { planMarker } from "../../../packages/cli/src/signoff.ts";
import { sentMarker } from "../../../packages/cli/src/slack.ts";
import { answers, verdict } from "../../../packages/cli/src/threads.ts";
import { sealFor } from "../../../packages/cli/src/sealed.ts";
import { slackAnswerer, type Ask } from "../../../packages/rules/src/index.ts";
import { readBrief } from "../src/comment.ts";
import { handle, type Deps } from "../src/events.ts";
import { currentLines } from "../src/spots.ts";

const SECRET = "shh";
const NOW = 1_800_000_000_000;
const env = { slackToken: "xoxb-test", signingSecret: SECRET, anthropicKey: "sk-test", model: "claude-sonnet-5-5" };
const URL_A = "https://github.com/acme/shop/pull/7";
const asks: Ask[] = [{ who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" }, { who: "@ben", role: "engineer", action: "ask", why: "owns Billing" }];
const spot = (file: string, who: string[], thread?: number) => ({ file, label: file, lines: "10-12", url: null, what: "Applies the discount", why: "Totals can go negative", risk: "high" as const, who, ...(thread ? { thread, threadUrl: `${URL_A}#discussion_r${thread}` } : {}) });
const brief: Brief = { spots: [spot("cart.ts", ["@ana"], 41), spot("bill.ts", ["@ben"], 42), spot("old.ts", ["@ana"])], design: null, docs: [], verify: true, about: "Adds coupons." };
const SEAL = sealFor("sk-test", { owner: "acme", repo: "shop", number: 7 });
const SENT = { "@ana": { channel: "D1", ts: "100.1" }, "@ben": { channel: "D2", ts: "100.2" } };
const body = [MARKER, planMarker(asks, SEAL), sentMarker(SENT, SEAL), briefMarker(brief, SEAL)].join("\n");

function form(payload: object): Request {
  const raw = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const ts = String(NOW / 1000);
  const sig = `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${raw}`).digest("hex")}`;
  return new Request("https://vera.test/api/events", { method: "POST", body: raw, headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": ts, "x-slack-signature": sig } });
}

function fakes(answer = { answer: "It stops totals going below zero.", needsAuthor: false }, veraBody = body) {
  const views: { id: string; view: { blocks: unknown[]; private_metadata?: string } }[] = [];
  const posts: { thread_ts: string; text: string }[] = [];
  const replies: { to: number; body: string }[] = [];
  const asked: unknown[] = [];
  const deps: Deps = {
    slack: {
      thread: async () => [], recent: async () => [], update: async () => {},
      post: async (m) => { posts.push(m); return "300.1"; },
      openView: async (_t, view) => { views.push({ id: "V1", view: view as never }); return "V1"; },
      updateView: async (id, view) => { views.push({ id, view: view as never }); },
    },
    anthropic: { messages: { create: async (p: unknown) => { asked.push(p); return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }] }; } } } as unknown as Deps["anthropic"],
    github: async () => ({
      comments: async () => [{ id: 1, who: "github-actions[bot]", body: veraBody, trusted: false, at: "" }],
      reply: async (_ref: unknown, to: number, b: string) => { replies.push({ to, body: b }); },
      pull: async () => ({ title: "Coupons", author: "cy", files: [{ path: "cart.ts", patch: "@@ -10,3 +10,3 @@\n-  total = total - off\n+  total = max(total - off, 1)\n   return total\n }" }] }),
      lineComments: async () => [{ id: 41, who: "github-actions[bot]", body: "<!-- vera-spot -->", path: "cart.ts", line: 12, start: 10, replyTo: null, trusted: false, at: "1", url: "" }],
    }) as unknown as Awaited<ReturnType<Deps["github"]>>,
    canPost: true,
  };
  return { deps, views, posts, replies, asked };
}

async function run(req: Request, deps: Deps): Promise<Response> {
  let work: Promise<unknown> | undefined;
  const res = await handle(req, env, (w) => { work = w; }, deps, NOW);
  await work;
  return res;
}
const press = (action_id: string, spotIndex: number, extra: object = {}) => ({ type: "block_actions", user: { id: "U1" }, trigger_id: "T1", channel: { id: "D1" }, container: { message_ts: "100.1" }, actions: [{ action_id, value: JSON.stringify({ url: URL_A, spot: spotIndex }) }], ...extra });
const submit = (kind: string, values: object, spotIndex = 0) => ({ type: "view_submission", user: { id: "U1" }, view: { id: "V1", callback_id: "vera_spot_form", private_metadata: JSON.stringify({ url: URL_A, spot: spotIndex, user: "U1", channel: "D1", ts: "100.1", kind }), state: { values } } });

test("the server reads the spots the Action keeps in its comment", () => {
  assert.deepEqual(readBrief(body)?.spots.map((s) => [s.file, s.who, s.thread ?? null]), [["cart.ts", ["@ana"], 41], ["bill.ts", ["@ben"], 42], ["old.ts", ["@ana"], null]]);
  assert.equal(readBrief(body)?.about, "Adds coupons.");
});

test("Verified posts ✓ in the spot's thread as the app, and the Action counts it for that person", async () => {
  const f = fakes();
  await run(form(press("vera_spot_verified", 0)), f.deps);
  assert.equal(f.replies.length, 1);
  assert.equal(f.replies[0]!.to, 41);
  const reply = f.replies[0]!.body;
  assert.equal(verdict(reply), "verified");
  assert.deepEqual(slackAnswerer("vera-slack[bot]", reply, "vera-slack"), { who: "ana", channel: "D1" });
  assert.equal(slackAnswerer("mallory", reply, "vera-slack"), null, "only the app's reply counts");
  const a = answers(brief.spots.slice(0, 1), [{ id: 50, who: "vera-slack[bot]", body: reply, path: "cart.ts", line: 12, replyTo: 41, trusted: false, at: "2", url: "" }], "vera-slack", SENT);
  assert.deepEqual(a.status[0]?.verified, ["ana"]);
  assert.match(f.posts[0]!.text, /Verified `cart\.ts` L10-12 on <https:\/\/github\.com\/acme\/shop\/pull\/7#discussion_r41\|the pull request>/);
});

test("a rewritten record can fool this server, but the Action doesn't count the ✓ it posts", async () => {
  // Someone with write access remaps Ben's message to Ana's conversation, then Ana presses Verified on Ben's spot.
  const forged = body.replace(/<!-- vera-slack:[^ ]* -->/, `<!-- vera-slack:${Buffer.from(JSON.stringify({ "@ben": { channel: "D1", ts: "100.1" } })).toString("base64")} -->`);
  const f = fakes(undefined, forged);
  await run(form(press("vera_spot_verified", 1)), f.deps);
  assert.equal(f.replies.length, 1, "the server reads the record unchecked");
  assert.deepEqual(slackAnswerer("vera-slack[bot]", f.replies[0]!.body, "vera-slack"), { who: "ben", channel: "D1" });
  const a = answers(brief.spots.slice(0, 2), [{ id: 51, who: "vera-slack[bot]", body: f.replies[0]!.body, path: "bill.ts", line: 12, replyTo: 42, trusted: false, at: "2", url: "" }], "vera-slack", SENT);
  assert.deepEqual([a.status[1]?.verified, a.verified], [[], {}], "Vera's signed record has Ben in D2, not D1");
});

test("a spot that's someone else's, or has no thread, can't be answered from this message", async () => {
  let f = fakes();
  await run(form(press("vera_spot_verified", 1)), f.deps);
  assert.equal(f.replies.length, 0);
  assert.match(f.posts[0]!.text, /for someone else to verify/);
  f = fakes();
  await run(form(press("vera_spot_verified", 2)), f.deps);
  assert.equal(f.replies.length, 0);
  assert.match(f.posts[0]!.text, /no thread on the pull request/);
});

test("Explain this opens a box, then Vera answers in Slack and copies both into the thread", async () => {
  const f = fakes();
  await run(form(press("vera_spot_explain", 0)), f.deps);
  assert.match(JSON.stringify(f.views[1]!.view), /What do you want to know\?/);
  await run(form(submit("explain", { q: { v: { value: "Why clamp at zero?" } } })), f.deps);
  assert.match(JSON.stringify(f.asked[0]), /ana: Why clamp at zero\?/);
  assert.match(f.posts.at(-1)!.text, /^\*Vera:\* It stops totals going below zero\./);
  const reply = f.replies.at(-1)!.body;
  assert.equal(f.replies.at(-1)!.to, 41);
  assert.match(reply, /\*\*ana\*\* asked in Slack:\n\n> Why clamp at zero\?\n\n\*\*Vera:\*\* It stops totals going below zero\./);
  assert.equal(verdict(reply), "question");
});

test("when only the author can tell, Vera asks them in the thread", async () => {
  const f = fakes({ answer: "The diff doesn't say why zero.", needsAuthor: true });
  await run(form(submit("explain", { q: { v: { value: "Why zero?" } } })), f.deps);
  assert.match(f.replies.at(-1)!.body, /@cy, can you fill in what Vera can't tell from the code\?$/);
  assert.match(f.posts.at(-1)!.text, /I've asked cy in/);
});

test("Needs a change goes to the author in the thread, with the code as a suggestion", async () => {
  const f = fakes();
  const res = await run(form(submit("change", { what: { v: { value: "Clamp at zero, not one." } }, code: { v: { value: "total = max(total, 0)\n" } } })), f.deps);
  assert.equal(res.status, 200);
  const reply = f.replies[0]!.body;
  assert.match(reply, /Needs a change, from \*\*ana\*\* in Slack:\n\n> Clamp at zero, not one\.\n\n```suggestion\ntotal = max\(total, 0\)\n```$/);
  assert.equal(verdict(reply), "change");
  assert.match(f.posts[0]!.text, /Sent to the author .* with your code as a suggestion/);
});

test("an empty box says so and posts nothing", async () => {
  const f = fakes();
  const res = await run(form(submit("change", { what: { v: { value: "  " } } })), f.deps);
  assert.deepEqual(await res.json(), { response_action: "errors", errors: { what: "Write something first." } });
  assert.equal(f.replies.length, 0);
});

const NOW_LINES = "  total = max(total - off, 1)\n  return total\n}";

test("the change box opens with the spot's lines as they are now", async () => {
  assert.equal(currentLines("@@ -10,3 +10,3 @@\n-  total = total - off\n+  total = max(total - off, 1)\n   return total\n }", 10, 12), NOW_LINES);
  assert.equal(currentLines("@@ -10,1 +10,1 @@\n-a\n+b", 10, 12), null, "lines the patch doesn't show: no pre-fill");
  const f = fakes();
  await run(form(press("vera_spot_change", 0)), f.deps);
  const view = f.views[1]!.view as { blocks: { block_id?: string; element?: { initial_value?: string } }[]; private_metadata?: string };
  assert.equal(view.blocks.find((b) => b.block_id === "code")?.element?.initial_value, NOW_LINES);
  const m = JSON.parse(view.private_metadata!);
  assert.equal(m.indent, "  ");
});

test("a change box sent as it opened sends no code; a first line that lost its indent gets it back", async () => {
  const f = fakes();
  await run(form(press("vera_spot_change", 0)), f.deps);
  const meta = JSON.parse((f.views[1]!.view as { private_metadata: string }).private_metadata);
  const send = (code: string) => ({ ...submit("change", { what: { v: { value: "Clamp at zero." } }, code: { v: { value: code } } }), view: { id: "V1", callback_id: "vera_spot_form", private_metadata: JSON.stringify(meta), state: { values: { what: { v: { value: "Clamp at zero." } }, code: { v: { value: code } } } } } });
  await run(form(send(NOW_LINES)), f.deps);
  assert.ok(!f.replies.at(-1)!.body.includes("```suggestion"), "untouched: no suggestion");
  await run(form(send("total = max(total - off, 0)\n  return total\n}")), f.deps);
  assert.match(f.replies.at(-1)!.body, /```suggestion\n  total = max\(total - off, 0\)\n  return total\n\}\n```$/);
});
