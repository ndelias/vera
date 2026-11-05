// Vera in Slack, stage 2: someone writes to Vera in its direct messages and
// gets an answer about the pull request it asked them to review. Slack wants
// a reply to each event within 3 seconds and an answer takes longer, so the
// handler says "got it" at once and hands the work to `later`, which each
// host provides (on Vercel, its waitUntil hook; see api/events.ts). Nothing
// here knows which host it runs on.
//
// Which pull request? A reply in a thread is about the pull request named in
// that thread's Vera messages (Slack message metadata, set by Vera); a new
// message is about the most recent one Vera sent. Only Vera's own messages
// count, so nobody can point it at a pull request they weren't asked to review.

import Anthropic from "@anthropic-ai/sdk";
import { client as github, parsePullUrl } from "../../../packages/tools/src/github.ts";
import { answerRequest, answerText, context, type Turn } from "./answer.ts";
import { api, type Api, type Fetch, type SlackMessage } from "./slack.ts";
import { verify } from "./verify.ts";

/** Same as PR_EVENT in packages/cli/src/slack.ts and MARKER in packages/cli/src/markdown.ts. */
export const PR_EVENT = "vera_pr";
export const VERA_COMMENT = "<!-- vera-review -->";
const PULL_URL = /https:\/\/github\.com\/[^/\s|>"]+\/[^/\s|>"]+\/pull\/\d+/;

export type Env = { slackToken: string; signingSecret: string; anthropicKey: string; githubToken?: string; model: string };
/** Keeps `work` going after the response; a host that can't returns it, and it's awaited first. */
export type Later = (work: Promise<unknown>) => void | Promise<unknown>;
type Event = { type?: string; channel_type?: string; subtype?: string; bot_id?: string; user?: string; text?: string; channel?: string; ts?: string; thread_ts?: string };
export type Deps = { slack: Api; anthropic: Pick<Anthropic, "messages">; github: ReturnType<typeof github> };

/** The settings from the host's environment, or the names of the ones missing. */
export function envFrom(e: Record<string, string | undefined>): Env | string[] {
  const need = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "ANTHROPIC_API_KEY"] as const;
  const missing = need.filter((k) => !e[k]);
  if (missing.length) return missing;
  return {
    slackToken: e.SLACK_BOT_TOKEN!, signingSecret: e.SLACK_SIGNING_SECRET!, anthropicKey: e.ANTHROPIC_API_KEY!,
    ...(e.GITHUB_TOKEN ? { githubToken: e.GITHUB_TOKEN } : {}),
    model: e.VERA_MODEL || "claude-sonnet-5-5",
  };
}

export async function handle(req: Request, env: Env | string[], later: Later, deps?: Partial<Deps>, nowMs = Date.now()): Promise<Response> {
  if (Array.isArray(env)) {
    console.error(`Vera's Slack server is missing ${env.join(", ")}.`);
    return new Response("not set up", { status: 500 });
  }
  const raw = await req.text();
  if (!verify(env.signingSecret, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), raw, nowMs)) {
    return new Response("bad signature", { status: 401 });
  }
  const body = JSON.parse(raw) as { type?: string; challenge?: string; event?: Event };
  if (body.type === "url_verification") return Response.json({ challenge: body.challenge });
  // A retry means Slack didn't hear "got it" in time; the first try is already being answered.
  if (req.headers.get("x-slack-retry-num")) return new Response(null, { status: 200 });
  const e = body.event;
  if (body.type === "event_callback" && e && isQuestion(e)) {
    const d: Deps = {
      slack: deps?.slack ?? api(env.slackToken),
      anthropic: deps?.anthropic ?? new Anthropic({ apiKey: env.anthropicKey }),
      github: deps?.github ?? github(env.githubToken),
    };
    await later(reply(e as Required<Pick<Event, "channel" | "ts" | "text">> & Event, env, d).catch((err: Error) => console.error(`Vera couldn't answer: ${err.message}`)));
  }
  return new Response(null, { status: 200 });
}

/** A person writing to Vera directly: not a bot, not an edit or deletion, with some text. */
function isQuestion(e: Event): boolean {
  return e.type === "message" && e.channel_type === "im" && !e.subtype && !e.bot_id && !!e.channel && !!e.ts && !!e.text?.trim();
}

/** The pull request a Vera message is about: its metadata, or (for messages sent before metadata) its link. */
export function pullOf(m: SlackMessage): string | null {
  if (!m.bot_id) return null;
  const url = m.metadata?.event_type === PR_EVENT ? m.metadata.event_payload?.url : undefined;
  if (typeof url === "string" && PULL_URL.test(url)) return url;
  return m.text?.startsWith("Vera asks you to review") ? (PULL_URL.exec(JSON.stringify(m.blocks ?? []))?.[0] ?? null) : null;
}

async function reply(e: Required<Pick<Event, "channel" | "ts" | "text">> & Event, env: Env, d: Deps): Promise<void> {
  const thread = e.thread_ts ? await d.slack.thread(e.channel, e.thread_ts) : [];
  const url = e.thread_ts
    ? thread.map(pullOf).find(Boolean)
    : (await d.slack.recent(e.channel)).map(pullOf).find(Boolean);
  const at = e.thread_ts ?? e.ts;
  if (!url) {
    await d.slack.post({ channel: e.channel, thread_ts: at, text: e.thread_ts
      ? "I can only talk about a pull request I've asked you to review, and this thread isn't about one."
      : "I can only talk about pull requests I've asked you to review, and I haven't sent you one yet." });
    return;
  }
  const ref = parsePullUrl(url);
  const metadata = { event_type: PR_EVENT, event_payload: { url } };
  const intro = e.thread_ts ? "" : `About <${url}|${ref.owner}/${ref.repo}#${ref.number}>, the latest one I sent you:\n`;
  const ts = await d.slack.post({ channel: e.channel, thread_ts: at, text: `${intro}_Reading the change…_`, metadata });
  try {
    const [pull, comments] = await Promise.all([d.github.pull(ref), d.github.comments(ref)]);
    const vera = comments.find((c) => c.body.includes(VERA_COMMENT))?.body ?? null;
    const m = await d.anthropic.messages.create(answerRequest(env.model, context(pull, vera), turns(thread, e)));
    await d.slack.update({ channel: e.channel, ts, text: `${intro}${answerText(m)}` });
  } catch (err) {
    await d.slack.update({ channel: e.channel, ts, text: `${intro}Sorry, I couldn't answer that: ${(err as Error).message.slice(0, 300)}` });
    throw err;
  }
}

/** The conversation so far: the person's messages and Vera's answers, without Vera's review message itself. */
export function turns(thread: SlackMessage[], e: { ts: string; text: string }): Turn[] {
  const out: Turn[] = thread
    .filter((m) => m.text && !m.text.startsWith("Vera asks you to review") && m.ts <= e.ts)
    .map((m) => ({ role: m.bot_id ? "assistant" : "user", text: m.text!.replace(/^About <[^>]+>, the latest one I sent you:\n/, "") }));
  if (!thread.some((m) => m.ts === e.ts)) out.push({ role: "user", text: e.text });
  return out;
}
