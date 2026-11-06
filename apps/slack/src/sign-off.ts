// Vera in Slack, stage 3: signing off from Slack (Nahuel's calls, 6 Nov
// 2026). Each message Vera sends has a Sign off button. Pressing it opens a
// form with the person's roles and Vera's questions; sending it posts their
// sign-off on the pull request as the team's GitHub App, as a `/vera
// sign-off` comment with their numbered answers. From there it's the
// Action's usual path: it grades the answers, updates the check and the
// comment, and updates the Slack message.
//
// Who is signing off comes from Slack, never from the form: the button is in
// a direct message Vera sent one person, and Vera's comment records which
// message went to whom. Everything is checked again when the form is sent.

import { SIGN_OFF_ACTION, slackSignoff } from "../../../packages/rules/src/slack-signoff.ts";
import { parsePullUrl, type PullRef } from "../../../packages/tools/src/github.ts";
import { readExam, readPlan, readSent, recipient } from "./comment.ts";
import type { Deps, Later } from "./events.ts";

export const FORM = "vera_sign_off";
const VERA_COMMENT = "<!-- vera-review -->";
const PR_EVENT = "vera_pr";

type Values = Record<string, Record<string, { value?: string | null; selected_options?: { value: string }[] }>>;
export type Payload = {
  type?: string;
  user?: { id: string };
  trigger_id?: string;
  channel?: { id: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts: string };
  actions?: { action_id: string; value?: string }[];
  view?: { id: string; callback_id?: string; private_metadata?: string; state?: { values: Values } };
};
/** What the form carries between opening and sending. Slack keeps it and nobody can edit it, but it's all checked again anyway. */
type Meta = { url: string; who: string; user: string; channel: string; ts: string; roles: string[]; at: string | null; questions: number };

const plain = (text: string) => ({ type: "plain_text", text });
const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text: text.slice(0, 3000) } });
const note = (text: string) => ({ type: "context", elements: [{ type: "mrkdwn", text: text.slice(0, 3000) }] });
const ROLE = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
const shell = (blocks: object[]) => ({ type: "modal", callback_id: FORM, title: plain("Sign off"), close: plain("Close"), blocks });
const name = (ref: PullRef) => `${ref.owner}/${ref.repo}#${ref.number}`;

export function formView(m: Meta, questions: string[]): object {
  const ref = parsePullUrl(m.url);
  const options = m.roles.map((r) => ({ text: plain(ROLE(r)), value: r }));
  return {
    ...shell([
      section(`Signing off on <${m.url}|${name(ref)}> as *${m.who.replace(/^@/, "")}*.`),
      m.roles.length > 1
        ? { type: "input", block_id: "roles", label: plain("For"), element: { type: "checkboxes", action_id: "roles", options, initial_options: options } }
        : note(`For: ${ROLE(m.roles[0]!)}`),
      ...questions.map((q, i) => ({
        type: "input", block_id: `q${i}`, optional: true,
        label: plain(`${i + 1}. ${q}`.slice(0, 2000)),
        element: { type: "plain_text_input", action_id: "answer", multiline: true, max_length: 1500 },
      })),
      ...(questions.length ? [note("A sentence or two each. Vera grades them the same way as answers on GitHub, shows the result next to your sign-off, and never blocks the merge.")] : []),
      note("Vera posts this on the pull request for you, from the team's GitHub App, so your answers will be visible there."),
    ]),
    submit: plain("Sign off"),
    close: plain("Cancel"),
    private_metadata: JSON.stringify(m),
  };
}

/** A press of the Sign off button: open the form at once (Slack allows 3 seconds), then fill it in. */
export async function pressed(p: Payload, later: Later, d: Deps): Promise<Response> {
  const action = p.actions?.find((a) => a.action_id === SIGN_OFF_ACTION);
  const channel = p.channel?.id ?? p.container?.channel_id;
  const ts = p.container?.message_ts ?? p.message?.ts;
  if (!action?.value || !p.trigger_id || !p.user || !channel || !ts) return new Response(null, { status: 200 });
  const id = await d.slack.openView(p.trigger_id, shell([section("_Reading the pull request…_")]));
  const user = p.user.id;
  const fill = async () => {
    try {
      const ref = parsePullUrl(action.value!);
      const c = await asked(d, ref, channel, ts);
      if ("problem" in c) return await d.slack.updateView(id, shell([section(c.problem)]));
      const exam = c.roles.includes("engineer") ? readExam(c.body) : null;
      const m: Meta = { url: ref.url, who: c.who, user, channel, ts, roles: c.roles, at: exam?.at ?? null, questions: exam?.questions.length ?? 0 };
      await d.slack.updateView(id, formView(m, exam?.questions ?? []));
    } catch (e) {
      await d.slack.updateView(id, shell([section(`Sorry, I couldn't open the form: ${(e as Error).message.slice(0, 300)}`)])).catch(() => {});
      throw e;
    }
  };
  await later(fill().catch((e: Error) => console.error(`Vera couldn't open the sign-off form: ${e.message}`)));
  return new Response(null, { status: 200 });
}

/** The form sent: close it, post the sign-off, and say so in the message's thread. */
export async function sent(p: Payload, later: Later, d: Deps): Promise<Response> {
  let m: Meta;
  try {
    m = JSON.parse(p.view?.private_metadata ?? "") as Meta;
  } catch {
    return new Response(null, { status: 200 });
  }
  if (!p.user || p.user.id !== m.user) return new Response(null, { status: 200 });
  const values = p.view?.state?.values ?? {};
  const roles = m.roles.length > 1 ? (values.roles?.roles?.selected_options ?? []).map((o) => o.value).filter((r) => m.roles.includes(r)) : m.roles;
  if (!roles.length) return Response.json({ response_action: "errors", errors: { roles: "Pick at least one role." } });
  const answers = Array.from({ length: m.questions }, (_, i) => values[`q${i}`]?.answer?.value ?? "");
  const say = (text: string) => d.slack.post({ channel: m.channel, thread_ts: m.ts, text, metadata: { event_type: PR_EVENT, event_payload: { url: m.url } } });
  const post = async () => {
    try {
      const ref = parsePullUrl(m.url);
      if (!d.canPost) return void await say(`I can't sign off for you yet: this Slack server has no GitHub App to post with. Sign off on <${m.url}|the pull request> for now.`);
      // Checked again: the form may have sat open through a push.
      const c = await asked(d, ref, m.channel, m.ts);
      if ("problem" in c) return void await say(c.problem);
      if (c.who !== m.who || roles.some((r) => !c.roles.includes(r))) return void await say("Who's asked for what changed since you opened the form. Press Sign off again.");
      const exam = c.roles.includes("engineer") ? readExam(c.body) : null;
      if ((exam?.at ?? null) !== m.at) return void await say("A new push changed the questions since you opened the form. Press Sign off again for the new ones.");
      const url = await (await d.github(ref)).post(ref, slackSignoff(m.who, roles, answers));
      const graded = roles.includes("engineer") && answers.some((a) => a.trim());
      await say(`Signed off on <${url}|the pull request> for ${roles.map(ROLE).join(", ")}. ${graded ? "Vera is grading your answers; " : ""}this message updates in a minute or so.`);
    } catch (e) {
      await say(`Sorry, I couldn't sign off for you: ${(e as Error).message.slice(0, 300)}. You can sign off on <${m.url}|the pull request>.`).catch(() => {});
      throw e;
    }
  };
  await later(post().catch((e: Error) => console.error(`Vera couldn't post a sign-off: ${e.message}`)));
  return new Response(null, { status: 200 });
}

/** Who this direct message's Vera message went to, and what they're asked for on the pull request. */
async function asked(d: Deps, ref: PullRef, channel: string, ts: string): Promise<{ who: string; roles: string[]; body: string } | { problem: string }> {
  const comments = await (await d.github(ref)).comments(ref);
  const body = comments.find((c) => c.body.includes(VERA_COMMENT))?.body;
  if (!body) return { problem: `Vera's review isn't on <${ref.url}|${name(ref)}> anymore, so there's nothing to sign off.` };
  const who = recipient(readSent(body), channel, ts);
  if (!who) return { problem: `This isn't the message Vera has on record for you about <${ref.url}|${name(ref)}>. Use the newest one, or sign off on the pull request.` };
  const roles = [...new Set(readPlan(body).filter((a) => a.who.toLowerCase() === who).map((a) => a.role))];
  if (!roles.length) return { problem: "You're no longer asked to review this change." };
  return { who, roles, body };
}
