// Answering a spot to verify from Slack (Nahuel's call, 25 Nov 2026). Each
// spot in Vera's message has three buttons:
//
// - Verified: posts "✓ Verified by <you> in Slack" in the spot's thread on
//   the pull request.
// - Explain this: a box for the question. Vera answers it here and copies the
//   question and the answer into the thread, asking the author there when
//   only they can tell.
// - Needs a change: a box for what should change, and the code if they have
//   it. It goes in the thread for the author, as a suggestion they can apply.
//
// Everything is posted as the team's GitHub App, naming the person; the
// Action counts it for them only because that app wrote it. Who pressed comes
// from Slack (which message, in which direct message), as for signing off,
// and is checked again before anything is posted.

import { SPOT_CHANGE, SPOT_EXPLAIN, SPOT_VERIFIED, slackAnswer } from "../../../packages/rules/src/slack-signoff.ts";
import { explainRequest, parseExplanation } from "../../../packages/agents/src/explainer.ts";
import { parsePullUrl, type PullRef } from "../../../packages/tools/src/github.ts";
import { readBrief, type BriefSpot } from "./comment.ts";
import type { Deps, Later } from "./events.ts";
import { asked, type Payload } from "./sign-off.ts";

export const SPOT_BUTTONS: string[] = [SPOT_VERIFIED, SPOT_EXPLAIN, SPOT_CHANGE];
export const SPOT_FORM = "vera_spot_form";
const PR_EVENT = "vera_pr";

type Kind = "explain" | "change";
/** What a box carries between opening and sending; all of it is checked again on sending. */
type Meta = { url: string; spot: number; user: string; channel: string; ts: string; kind: Kind };

const plain = (text: string) => ({ type: "plain_text", text });
const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text: text.slice(0, 3000) } });
const note = (text: string) => ({ type: "context", elements: [{ type: "mrkdwn", text: text.slice(0, 3000) }] });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s*\n\s*/g, " ").trim();
const TITLE = { explain: "Explain this", change: "Needs a change" } as const;
const shell = (kind: Kind, blocks: object[]) => ({ type: "modal", callback_id: SPOT_FORM, title: plain(TITLE[kind]), close: plain("Close"), blocks });
const where = (s: BriefSpot) => `\`${s.file.split("/").pop()}\` ${s.lines.startsWith("L") ? s.lines : `L${s.lines}`}`;

/** The spot this person's message is about, or what's wrong. */
async function spotFor(d: Deps, ref: PullRef, channel: string, ts: string, i: number): Promise<{ who: string; spot: BriefSpot; body: string } | { problem: string }> {
  const c = await asked(d, ref, channel, ts);
  if ("problem" in c) return c;
  const spot = readBrief(c.body)?.spots[i];
  if (!spot) return { problem: "That spot isn't in Vera's review anymore: a push changed it. Open the newest message." };
  const me = c.who.replace(/^@/, "").toLowerCase();
  if (!spot.who.some((w) => w.replace(/^@/, "").toLowerCase() === me)) return { problem: "That spot is for someone else to verify." };
  if (!spot.thread) return { problem: "That spot has no thread on the pull request to answer in. Answer it on the pull request instead." };
  return { who: c.who, spot, body: c.body };
}

export function boxView(m: Meta, spot: BriefSpot): object {
  const head = section(`*${where(spot)}*\n${esc(spot.what)}. ${esc(spot.why)}`);
  const blocks = m.kind === "explain"
    ? [head, { type: "input", block_id: "q", label: plain("What do you want to know?"), element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 1500 } },
       note("Vera answers here, from the change, and copies your question and its answer into the spot's thread so the author sees them.")]
    : [head,
       { type: "input", block_id: "what", label: plain("What should change, and why?"), element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 1500 } },
       { type: "input", block_id: "code", optional: true, label: plain("The code it should be (optional)"), hint: plain("It replaces the spot's lines as a suggestion the author can apply in one click."), element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 3000 } },
       note("Vera posts this in the spot's thread on the pull request, from the team's GitHub App, for the author.")];
  return { ...shell(m.kind, blocks), submit: plain(m.kind === "explain" ? "Ask" : "Send to the author"), close: plain("Cancel"), private_metadata: JSON.stringify(m) };
}

const say = (d: Deps, m: { channel: string; ts: string; url: string }, text: string) =>
  d.slack.post({ channel: m.channel, thread_ts: m.ts, text, metadata: { event_type: PR_EVENT, event_payload: { url: m.url } } });

/** A press of Verified, Explain this or Needs a change. */
export async function spotPressed(p: Payload, later: Later, d: Deps): Promise<Response> {
  const action = p.actions?.find((a) => SPOT_BUTTONS.includes(a.action_id));
  const channel = p.channel?.id ?? p.container?.channel_id;
  const ts = p.container?.message_ts ?? p.message?.ts;
  let v: { url?: string; spot?: number } = {};
  try {
    v = JSON.parse(action?.value ?? "{}");
  } catch { /* an unreadable button does nothing */ }
  if (!action || !p.user || !channel || !ts || typeof v.url !== "string" || typeof v.spot !== "number") return new Response(null, { status: 200 });
  const at = { channel, ts, url: v.url };
  const i = v.spot;

  if (action.action_id === SPOT_VERIFIED) {
    const post = async () => {
      try {
        if (!d.canPost) return void await say(d, at, `I can't post for you yet: this Slack server has no GitHub App. Reply ✓ in the spot's thread on <${at.url}|the pull request>.`);
        const ref = parsePullUrl(at.url);
        const c = await spotFor(d, ref, channel, ts, i);
        if ("problem" in c) return void await say(d, at, c.problem);
        await (await d.github(ref)).reply(ref, c.spot.thread!, slackAnswer(c.who, "verified"));
        await say(d, at, `Verified ${where(c.spot)} on <${c.spot.threadUrl ?? at.url}|the pull request>. This message updates in a minute or so.`);
      } catch (e) {
        await say(d, at, `Sorry, I couldn't mark it verified: ${(e as Error).message.slice(0, 300)}. You can reply ✓ in the spot's thread on <${at.url}|the pull request>.`).catch(() => {});
        throw e;
      }
    };
    await later(post().catch((e: Error) => console.error(`Vera couldn't post a verified spot: ${e.message}`)));
    return new Response(null, { status: 200 });
  }

  if (!p.trigger_id) return new Response(null, { status: 200 });
  const kind: Kind = action.action_id === SPOT_EXPLAIN ? "explain" : "change";
  const id = await d.slack.openView(p.trigger_id, shell(kind, [section("_Reading the pull request…_")]));
  const fill = async () => {
    try {
      const c = await spotFor(d, parsePullUrl(at.url), channel, ts, i);
      if ("problem" in c) return await d.slack.updateView(id, shell(kind, [section(c.problem)]));
      await d.slack.updateView(id, boxView({ url: at.url, spot: i, user: p.user!.id, channel, ts, kind }, c.spot));
    } catch (e) {
      await d.slack.updateView(id, shell(kind, [section(`Sorry, I couldn't open this: ${(e as Error).message.slice(0, 300)}`)])).catch(() => {});
      throw e;
    }
  };
  await later(fill().catch((e: Error) => console.error(`Vera couldn't open the box for a spot: ${e.message}`)));
  return new Response(null, { status: 200 });
}

/** A question or a change sent from its box: close it, then answer or pass it on. */
export async function spotSent(p: Payload, later: Later, d: Deps): Promise<Response> {
  let m: Meta;
  try {
    m = JSON.parse(p.view?.private_metadata ?? "") as Meta;
  } catch {
    return new Response(null, { status: 200 });
  }
  if (!p.user || p.user.id !== m.user) return new Response(null, { status: 200 });
  const values = p.view?.state?.values ?? {};
  const text = (values[m.kind === "explain" ? "q" : "what"]?.v?.value ?? "").trim();
  const code = m.kind === "change" ? values.code?.v?.value ?? "" : "";
  if (!text) return Response.json({ response_action: "errors", errors: { [m.kind === "explain" ? "q" : "what"]: "Write something first." } });

  const go = async () => {
    try {
      if (!d.canPost) return void await say(d, m, `I can't post for you yet: this Slack server has no GitHub App. Answer in the spot's thread on <${m.url}|the pull request>.`);
      const ref = parsePullUrl(m.url);
      const c = await spotFor(d, ref, m.channel, m.ts, m.spot);
      if ("problem" in c) return void await say(d, m, c.problem);
      const gh = await d.github(ref);
      if (m.kind === "change") {
        await gh.reply(ref, c.spot.thread!, slackAnswer(c.who, "change", { what: text, code }));
        return void await say(d, m, `Sent to the author in <${c.spot.threadUrl ?? m.url}|the spot's thread>${code.trim() ? ", with your code as a suggestion they can apply" : ""}.`);
      }
      const [pull, lines] = await Promise.all([gh.pull(ref), gh.lineComments(ref)]);
      const thread = lines.filter((x) => x.id === c.spot.thread || x.replyTo === c.spot.thread).sort((a, b) => a.at.localeCompare(b.at)).map((x) => ({ who: x.who, body: x.body }));
      const msg = await d.anthropic.messages.create(explainRequest(d.model ?? "claude-sonnet-5-5", {
        title: pull.title, about: readBrief(c.body)?.about ?? null, spot: c.spot,
        diff: pull.files.find((f) => f.path === c.spot.file)?.patch ?? "", thread: [...thread, { who: c.who, body: text }],
      }));
      const e = parseExplanation(msg);
      if (!e) return void await say(d, m, `I couldn't answer that one. Ask in <${c.spot.threadUrl ?? m.url}|the spot's thread> and the author can.`);
      const toAuthor = e.needsAuthor && pull.author.toLowerCase() !== c.who.replace(/^@/, "").toLowerCase() ? `\n\n@${pull.author}, can you fill in what Vera can't tell from the code?` : "";
      await gh.reply(ref, c.spot.thread!, slackAnswer(c.who, "explain", { question: text, answer: e.answer }) + toAuthor);
      await say(d, m, `*Vera:* ${e.answer}${toAuthor ? `\n\n_I've asked ${pull.author} in <${c.spot.threadUrl ?? m.url}|the spot's thread> for what only they can tell you._` : `\n\n_Copied to <${c.spot.threadUrl ?? m.url}|the spot's thread>._`}`);
    } catch (e) {
      await say(d, m, `Sorry, something went wrong: ${(e as Error).message.slice(0, 300)}. You can answer in the spot's thread on <${m.url}|the pull request>.`).catch(() => {});
      throw e;
    }
  };
  await later(go().catch((e: Error) => console.error(`Vera couldn't handle an answer from Slack: ${e.message}`)));
  return new Response(null, { status: 200 });
}
