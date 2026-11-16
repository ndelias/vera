import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { MARKER } from "../../../packages/cli/src/markdown.ts";
import { PR_EVENT as CLI_PR_EVENT } from "../../../packages/cli/src/slack.ts";
import { answerRequest, answerText } from "../src/answer.ts";
import { envFrom, handle, PR_EVENT, pullOf, turns, VERA_COMMENT, type Deps } from "../src/events.ts";
import type { SlackMessage } from "../src/slack.ts";
import { verify } from "../src/verify.ts";

const SECRET = "shh";
const NOW = 1_800_000_000_000;
const env = { slackToken: "xoxb-test", signingSecret: SECRET, anthropicKey: "sk-test", model: "claude-sonnet-5-5" };
const URL_A = "https://github.com/acme/shop/pull/7";

function signed(body: object, headers: Record<string, string> = {}, ts = String(NOW / 1000)): Request {
  const raw = JSON.stringify(body);
  const sig = `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${raw}`).digest("hex")}`;
  return new Request("https://vera.test/api/events", { method: "POST", body: raw, headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig, ...headers } });
}

const review: SlackMessage = { ts: "100.1", bot_id: "B1", text: "Vera asks you to review acme/shop#7 (Engineer): Rounding", metadata: { event_type: PR_EVENT, event_payload: { url: URL_A } } };
const dm = (extra: object = {}) => ({ type: "event_callback", event: { type: "message", channel_type: "im", channel: "D1", user: "U1", text: "What does this change?", ts: "200.1", ...extra } });

function fakes(thread: SlackMessage[] = [], recent: SlackMessage[] = []) {
  const posts: { thread_ts: string; text: string; metadata?: object }[] = [];
  const updates: string[] = [];
  const asked: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const deps: Deps = {
    slack: {
      thread: async () => thread,
      recent: async () => recent,
      post: async (m) => { posts.push(m); return "300.1"; },
      update: async (m) => { updates.push(m.text); },
      openView: async () => "V1",
      updateView: async () => {},
    },
    anthropic: { messages: { create: async (p: Anthropic.MessageCreateParamsNonStreaming) => { asked.push(p); return { stop_reason: "end_turn", content: [{ type: "text", text: "It rounds <once> at `cart.ts:12`." }] }; } } } as unknown as Deps["anthropic"],
    canPost: true,
    github: async () => ({
      pull: async () => ({ ref: { owner: "acme", repo: "shop", number: 7, url: URL_A }, title: "Rounding", body: "", baseRef: "main", headSha: "abc", author: "bo", files: [{ path: "src/cart.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -12 +12 @@\n-a\n+b" }], commitMessages: [] }),
      comments: async () => [{ id: 1, who: "vera", body: `${VERA_COMMENT}\n<!-- vera-brief:xyz -->\n_Rounds totals once._`, trusted: true, at: "" }],
    }) as unknown as Awaited<ReturnType<Deps["github"]>>,
  };
  return { deps, posts, updates, asked };
}

test("the shared names match the Action's", () => {
  assert.equal(PR_EVENT, CLI_PR_EVENT);
  assert.equal(VERA_COMMENT, MARKER);
});

test("only requests signed with the app's secret in the last five minutes get through", () => {
  const raw = "{}";
  const ts = String(NOW / 1000);
  const sig = `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${raw}`).digest("hex")}`;
  assert.ok(verify(SECRET, ts, sig, raw, NOW));
  assert.ok(!verify(SECRET, ts, sig, "{ }", NOW), "body changed");
  assert.ok(!verify("other", ts, sig, raw, NOW), "wrong secret");
  assert.ok(!verify(SECRET, ts, sig, raw, NOW + 6 * 60_000), "too old");
  assert.ok(!verify(SECRET, null, sig, raw, NOW));
});

test("Slack's URL check gets its challenge back; unsigned requests and retries do nothing", async () => {
  const ok = await handle(signed({ type: "url_verification", challenge: "abc" }), env, () => {}, undefined, NOW);
  assert.deepEqual(await ok.json(), { challenge: "abc" });
  const bad = await handle(new Request("https://vera.test", { method: "POST", body: "{}" }), env, () => {}, undefined, NOW);
  assert.equal(bad.status, 401);
  let ran = false;
  await handle(signed(dm(), { "x-slack-retry-num": "1", "x-slack-retry-reason": "http_timeout" }), env, () => { ran = true; }, fakes().deps, NOW);
  assert.ok(!ran, "a timeout retry: the first try is still answering");
  await handle(signed(dm(), { "x-slack-retry-num": "1", "x-slack-retry-reason": "http_error" }), env, () => { ran = true; }, fakes().deps, NOW);
  assert.ok(ran, "an error retry: the first try failed, so this one answers");
});

test("missing settings are named, not guessed", () => {
  assert.deepEqual(envFrom({ SLACK_BOT_TOKEN: "x" }), ["SLACK_SIGNING_SECRET", "ANTHROPIC_API_KEY"]);
  const e = envFrom({ SLACK_BOT_TOKEN: "x", SLACK_SIGNING_SECRET: "y", ANTHROPIC_API_KEY: "z" });
  assert.ok(!Array.isArray(e) && e.model === "claude-sonnet-5-5");
});

test("a new message is about the latest review; the answer goes in its thread, escaped", async () => {
  const f = fakes([], [{ ts: "150.1", user: "U1", text: "hi" }, review]);
  let work: Promise<unknown> | undefined;
  const res = await handle(signed(dm()), env, (w) => { work = w; }, f.deps, NOW);
  assert.equal(res.status, 200, "Slack hears back before the answer");
  await work;
  assert.equal(f.posts[0]!.thread_ts, "200.1");
  assert.deepEqual(f.posts[0]!.metadata, { event_type: PR_EVENT, event_payload: { url: URL_A } });
  assert.match(f.updates[0]!, /^About <https:\/\/github\.com\/acme\/shop\/pull\/7\|acme\/shop#7>, the latest one I sent you:\nIt rounds &lt;once&gt; at `cart\.ts:12`\.$/);
  const sent = JSON.stringify(f.asked[0]!.messages);
  assert.match(sent, /Rounds totals once/);
  assert.ok(!sent.includes("vera-brief"), "hidden markers aren't sent");
  assert.match(sent, /src\/cart\.ts/);
});

test("a reply in a review's thread is about that review, with the conversation so far", async () => {
  const thread: SlackMessage[] = [review, { ts: "200.1", user: "U1", text: "Why round once?" }, { ts: "210.1", bot_id: "B1", text: "Because…" }, { ts: "220.1", user: "U1", text: "And taxes?" }];
  const f = fakes(thread);
  let work: Promise<unknown> | undefined;
  await handle(signed(dm({ ts: "220.1", thread_ts: "100.1", text: "And taxes?" })), env, (w) => { work = w; }, f.deps, NOW);
  await work;
  assert.equal(f.posts[0]!.thread_ts, "100.1");
  assert.ok(!f.updates[0]!.startsWith("About"), "no intro inside the review's own thread");
  assert.deepEqual(f.asked[0]!.messages.map((m) => m.role), ["user", "assistant", "user"]);
});

test("no review to talk about: says so, and asks nobody", async () => {
  const f = fakes([], [{ ts: "150.1", user: "U1", text: "hi" }]);
  let work: Promise<unknown> | undefined;
  await handle(signed(dm()), env, (w) => { work = w; }, f.deps, NOW);
  await work;
  assert.match(f.posts[0]!.text, /haven't sent you one yet/);
  assert.equal(f.asked.length, 0);
});

test("bots, edits and other channels are ignored", async () => {
  for (const extra of [{ bot_id: "B1" }, { subtype: "message_changed" }, { channel_type: "channel" }, { text: "  " }]) {
    let ran = false;
    await handle(signed(dm(extra)), env, () => { ran = true; }, fakes().deps, NOW);
    assert.ok(!ran, JSON.stringify(extra));
  }
});

test("only Vera's own messages name a pull request; older ones by their link", () => {
  assert.equal(pullOf(review), URL_A);
  assert.equal(pullOf({ ts: review.ts, text: review.text!, metadata: review.metadata! }), null, "a person can't point Vera at a pull request");
  assert.equal(pullOf({ ts: "1", bot_id: "B1", text: "Vera asks you to review acme/shop#7", blocks: [{ text: `<${URL_A}|acme/shop#7>` }] }), URL_A);
  assert.equal(pullOf({ ts: "1", bot_id: "B1", text: "Sorry", blocks: [{ text: URL_A }] }), null);
});

test("the conversation starts with the person, merges runs, and caches the change", () => {
  const t = turns([{ ts: "1", bot_id: "B", text: "About <x|y>, the latest one I sent you:\nAnswer" }, { ts: "2", user: "U", text: "a" }, { ts: "3", user: "U", text: "b" }], { ts: "3", text: "b" });
  const r = answerRequest("m", "CTX", t);
  assert.deepEqual(r.messages.map((m) => m.role), ["user"], "a leading answer is dropped; two questions merge");
  const first = r.messages[0]!.content as Anthropic.TextBlockParam[];
  assert.equal(first[0]!.text, "CTX");
  assert.deepEqual(first[0]!.cache_control, { type: "ephemeral" });
  assert.equal(first[1]!.text, "a\n\nb");
  assert.equal(answerText({ stop_reason: "refusal", content: [] } as unknown as Anthropic.Message), "I can't help with that one.");
});
