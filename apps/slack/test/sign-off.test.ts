import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { MARKER } from "../../../packages/cli/src/markdown.ts";
import { planMarker } from "../../../packages/cli/src/signoff.ts";
import { sentMarker } from "../../../packages/cli/src/slack.ts";
import { examMarker } from "../../../packages/cli/src/understanding.ts";
import { parseSignoff, slackSigner, type Ask } from "../../../packages/rules/src/index.ts";
import { readExam, readPlan, readSent, recipient } from "../src/comment.ts";
import { handle, type Deps } from "../src/events.ts";
import { appJwt, appTokens } from "../src/github-app.ts";

const SECRET = "shh";
const NOW = 1_800_000_000_000;
const env = { slackToken: "xoxb-test", signingSecret: SECRET, anthropicKey: "sk-test", model: "claude-sonnet-5-5" };
const URL_A = "https://github.com/acme/shop/pull/7";
const asks: Ask[] = [
  { who: "@ana", role: "engineer", action: "ask", why: "owns Checkout" },
  { who: "@ana", role: "design", action: "ask", why: "owns the cart" },
  { who: "@dev", role: "docs", action: "ask", why: "docs" },
];
const AT = "2026-11-06T10:00:00.000Z";
const veraBody = (at = AT) => [MARKER, planMarker(asks), sentMarker({ "@ana": { channel: "D1", ts: "100.1" }, "@dev": { channel: "D2", ts: "100.2" } }),
  examMarker([{ question: "What if two coupons apply?", good_answer: "Only the first.", cites: [] }, { question: "Who can refund?", good_answer: "Admins.", cites: [] }], "it's likely AI-written", "key", at)].join("\n");

function form(payload: object): Request {
  const raw = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const ts = String(NOW / 1000);
  const sig = `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${raw}`).digest("hex")}`;
  return new Request("https://vera.test/api/events", { method: "POST", body: raw, headers: { "content-type": "application/x-www-form-urlencoded", "x-slack-request-timestamp": ts, "x-slack-signature": sig } });
}

function fakes(body = veraBody(), canPost = true) {
  const views: { id: string; view: { blocks: unknown[]; private_metadata?: string } }[] = [];
  const posts: { thread_ts: string; text: string }[] = [];
  const comments: string[] = [];
  const deps: Deps = {
    slack: {
      thread: async () => [], recent: async () => [], update: async () => {},
      post: async (m) => { posts.push(m); return "300.1"; },
      openView: async (_t, view) => { views.push({ id: "V1", view: view as never }); return "V1"; },
      updateView: async (id, view) => { views.push({ id, view: view as never }); },
    },
    anthropic: {} as Deps["anthropic"],
    github: async () => ({
      comments: async () => [{ id: 1, who: "github-actions[bot]", body, trusted: false, at: "" }],
      post: async (_ref: unknown, b: string) => { comments.push(b); return `${URL_A}#issuecomment-9`; },
    }) as unknown as Awaited<ReturnType<Deps["github"]>>,
    canPost,
  };
  return { deps, views, posts, comments };
}

const press = (extra: object = {}) => ({ type: "block_actions", user: { id: "U1" }, trigger_id: "T1", channel: { id: "D1" }, container: { message_ts: "100.1" }, actions: [{ action_id: "vera_sign_off", value: URL_A }], ...extra });
const text = (v: unknown) => JSON.stringify(v);

async function run(req: Request, deps: Deps): Promise<Response> {
  let work: Promise<unknown> | undefined;
  const res = await handle(req, env, (w) => { work = w; }, deps, NOW);
  await work;
  return res;
}

test("the server reads what the Action writes in its comment", () => {
  const body = veraBody();
  assert.deepEqual(readPlan(body), asks);
  assert.deepEqual(readSent(body)["@ana"], { channel: "D1", ts: "100.1" });
  assert.deepEqual(readExam(body), { questions: ["What if two coupons apply?", "Who can refund?"], at: AT });
  assert.ok(!text(readExam(body)).includes("Only the first"), "the good answers stay sealed");
  assert.equal(recipient(readSent(body), "D2", "100.2"), "@dev");
  assert.equal(recipient(readSent(body), "D2", "100.1"), null, "the message and the conversation must both match");
});

test("Sign off opens the form at once, then fills in the person's roles and questions", async () => {
  const f = fakes();
  const res = await run(form(press()), f.deps);
  assert.equal(res.status, 200);
  assert.match(text(f.views[0]!.view), /Reading the pull request/);
  const filled = f.views[1]!;
  assert.equal(filled.id, "V1");
  assert.match(text(filled.view), /as \*ana\*/);
  assert.match(text(filled.view), /"value":"engineer".*"value":"design"/);
  assert.match(text(filled.view), /1\. What if two coupons apply\?/);
  assert.deepEqual(JSON.parse(filled.view.private_metadata!), { url: URL_A, who: "@ana", user: "U1", channel: "D1", ts: "100.1", roles: ["engineer", "design"], at: AT, questions: 2 });
});

test("a message Vera has no record of sending this person can't open the form", async () => {
  const f = fakes();
  await run(form(press({ channel: { id: "D2" } })), f.deps);
  assert.match(text(f.views[1]!.view), /isn't the message Vera has on record for you/);
  assert.ok(!text(f.views[1]!.view).includes("private_metadata"));
});

const meta = { url: URL_A, who: "@ana", user: "U1", channel: "D1", ts: "100.1", roles: ["engineer", "design"], at: AT, questions: 2 };
const submit = (values: object, m: object = meta, user = "U1") => ({ type: "view_submission", user: { id: user }, view: { id: "V1", callback_id: "vera_sign_off", private_metadata: JSON.stringify(m), state: { values } } });
const answered = {
  roles: { roles: { selected_options: [{ value: "engineer" }] } },
  q0: { answer: { value: "Only the first\none applies." } },
  q1: { answer: { value: null } },
};

test("sending the form posts the sign-off as the GitHub App, which the Action counts for that person", async () => {
  const f = fakes();
  const res = await run(form(submit(answered)), f.deps);
  assert.equal(res.status, 200, "the form closes");
  assert.equal(f.comments.length, 1);
  const c = f.comments[0]!;
  assert.deepEqual(parseSignoff(c), ["engineer"]);
  assert.match(c, /\n1\. Only the first one applies\.$/);
  assert.equal(slackSigner("vera-slack[bot]", c, "vera-slack"), "ana");
  assert.equal(f.posts[0]!.thread_ts, "100.1");
  assert.match(f.posts[0]!.text, /Signed off on <https:\/\/github\.com\/acme\/shop\/pull\/7#issuecomment-9\|the pull request> for Engineer\. Vera is grading your answers/);
});

test("no role picked: the form says so and nothing is posted", async () => {
  const f = fakes();
  const res = await run(form(submit({ roles: { roles: { selected_options: [] } } })), f.deps);
  assert.deepEqual(await res.json(), { response_action: "errors", errors: { roles: "Pick at least one role." } });
  assert.equal(f.comments.length, 0);
});

test("nothing is posted for someone else, after the questions change, or without a GitHub App", async () => {
  const other = fakes();
  await run(form(submit(answered, meta, "U2")), other.deps);
  assert.equal(other.comments.length + other.posts.length, 0, "a different Slack user");
  const stolen = fakes();
  await run(form(submit(answered, { ...meta, channel: "D2", ts: "100.2" })), stolen.deps);
  assert.equal(stolen.comments.length, 0, "someone else's message");
  const pushed = fakes(veraBody("2026-11-06T11:00:00.000Z"));
  await run(form(submit(answered)), pushed.deps);
  assert.equal(pushed.comments.length, 0);
  assert.match(pushed.posts[0]!.text, /changed the questions/);
  const noApp = fakes(veraBody(), false);
  await run(form(submit(answered)), noApp.deps);
  assert.equal(noApp.comments.length, 0);
  assert.match(noApp.posts[0]!.text, /no GitHub App/);
  const sneaky = fakes();
  await run(form(submit({ roles: { roles: { selected_options: [{ value: "docs" }] } } })), sneaky.deps);
  assert.equal(sneaky.comments.length, 0, "a role they weren't asked for");
});

test("the app proves who it is with a signed token, then gets an hour-long token per repo, reused", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const jwt = appJwt({ appId: "123", privateKey: pem.replace(/\n/g, "\\n") }, NOW);
  const [h, p, sig] = jwt.split(".");
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig!, "base64url")), "a key pasted on one line still works");
  const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
  assert.equal(claims.iss, "123");
  assert.ok(claims.exp - claims.iat <= 600);
  const calls: string[] = [];
  const f = (async (url: string, init: { method: string }) => {
    calls.push(`${init.method} ${url.replace("https://api.github.com", "")}`);
    if (url.endsWith("/installation")) return new Response(JSON.stringify({ id: 42 }));
    return new Response(JSON.stringify({ token: "ghs_test", expires_at: new Date(NOW + 3_600_000).toISOString() }));
  }) as unknown as typeof fetch;
  const get = appTokens({ appId: "123", privateKey: pem }, f);
  assert.equal(await get("acme", "shop", NOW), "ghs_test");
  assert.equal(await get("acme", "shop", NOW + 30 * 60_000), "ghs_test");
  assert.deepEqual(calls, ["GET /repos/acme/shop/installation", "POST /app/installations/42/access_tokens"]);
  const missing = appTokens({ appId: "123", privateKey: pem }, (async () => new Response("", { status: 404 })) as unknown as typeof fetch);
  await assert.rejects(missing("acme", "other", NOW), /isn't installed on acme\/other/);
});
