// Vera in Slack, stage 1 (Nahuel's calls, 5 Nov 2026): each person asked
// gets their block from the comment as a direct message from the team's
// Slack app, and later runs update that message rather than send another.
// Which message is whose is kept hidden in Vera's comment, so there's no
// database. Answering and signing off in Slack come with the server
// (apps/slack); until then the message says to do both on the pull request.

import type { Signoff } from "@vera/rules";
import type { Person } from "./people.ts";
import { describe, type Understanding } from "./understanding.ts";

/** The message each person was sent, by lowercased handle. */
export type Sent = Record<string, { channel: string; ts: string }>;
export type Pr = { url: string; repo: string; number: number; title: string; author: string };
export type Message = { text: string; blocks: unknown[] };
type Fetch = typeof fetch;

const SENT = /<!-- vera-slack:([A-Za-z0-9+/=]*) -->/;
export const sentMarker = (sent: Sent) => `<!-- vera-slack:${Buffer.from(JSON.stringify(sent)).toString("base64")} -->`;

export function readSent(body: string): Sent {
  const m = SENT.exec(body);
  if (!m) return {};
  try {
    return JSON.parse(Buffer.from(m[1]!, "base64").toString("utf8")) as Sent;
  } catch {
    return {};
  }
}

/** The comment with its record of Slack messages replaced, or added after the first line (Vera's marker). */
export function withSent(body: string, sent: Sent): string {
  if (!Object.keys(sent).length) return body.replace(new RegExp(`${SENT.source}\\n?`), "");
  if (SENT.test(body)) return body.replace(SENT, sentMarker(sent));
  const i = body.indexOf("\n");
  return i < 0 ? `${body}\n${sentMarker(sent)}` : `${body.slice(0, i)}\n${sentMarker(sent)}${body.slice(i)}`;
}

const AS = { ask: "", "ask-lead": " (as lead)", suggest: " (possible owner)" } as const;
const ROLE = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);
const RISK = { high: "High", medium: "Medium", low: "Low" } as const;
/** Model-written text in Slack's mrkdwn: &, < and > escaped (so it can't make links or mentions), on one line. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s*\n\s*/g, " ").trim();
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text: text.slice(0, 3000) } });
const context = (text: string) => ({ type: "context", elements: [{ type: "mrkdwn", text: text.slice(0, 3000) }] });

/** One person's message: the same block as in the comment, in Slack's layout. */
export function message(p: Person, pr: Pr, s: Signoff, extra: { summary?: string; ai?: string[]; why?: string }, u?: Understanding): Message {
  const roles = p.asks.map((a) => {
    const r = s.roles.find((x) => x.role === a.role);
    const someoneElse = r?.by && r.by.toLowerCase() !== p.who.toLowerCase();
    const state = r?.by ? `signed off${someoneElse ? ` by ${r.by}` : ""}${u && a.role === "engineer" ? ` · ${describe(u)}` : ""}` : "waiting";
    return `${r?.by ? "✓" : "○"} *${ROLE(a.role)}*${AS[a.action]} · ${state}${a.why ? ` · ${esc(a.why.replace(/\.$/, ""))}` : ""}`;
  });
  const look = [
    ...p.spots.map((x) => {
      const at = x.lines.startsWith("L") ? x.lines : `L${x.lines}`;
      const where = x.url ? `<${x.url}|\`${x.label}\` ${esc(at)}>` : `\`${x.label}\` ${esc(at)}`;
      return section(`*${RISK[x.risk]}* · ${where} · ${esc(sentence(x.what))}\n${esc(sentence(x.why))}`);
    }),
    ...(p.design ? [section(`*The design:* ${esc(sentence(p.design))}`), context("Vera can't see screens yet, so it can't point at places for design.")] : []),
    ...(p.docs.length ? [section(`*The docs:* ${p.docs.slice(0, 5).map((f) => `\`${esc(f)}\``).join(", ")}${p.docs.length > 5 ? ` and ${p.docs.length - 5} more` : ""}`)] : []),
  ];
  const answered = !!s.roles.find((r) => r.role === "engineer")?.by;
  const questions = p.questions.length && !answered ? [
    { type: "divider" },
    section(`*Before you sign off*\n${p.questions.map((q, i) => `${i + 1}. ${esc(q)}`).join("\n")}`),
    context(`${extra.why ? `Asked because ${esc(extra.why)}. ` : ""}For now, answer on the pull request when you sign off, numbered: in your approval or under \`/vera sign-off\`.`),
  ] : [];
  const mine = p.asks.map((a) => ROLE(a.role)).join(", ");
  return {
    text: `Vera asks you to review ${pr.repo}#${pr.number} (${mine}): ${pr.title}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Review: ${pr.title}`.slice(0, 150) } },
      section(`<${pr.url}|${pr.repo}#${pr.number}> by ${esc(pr.author)}${extra.summary ? `\n_${esc(extra.summary)}_` : ""}`),
      ...(extra.ai?.length ? [context(`*Likely AI-written:* ${esc(sentence(extra.ai.join(", ")))}`)] : []),
      section(roles.join("\n")),
      ...(look.length ? [{ type: "divider" }, section("*Where to look*"), ...look] : []),
      ...questions,
      context(`Vera reads and suggests: it never approves, blocks or changes the code. <${pr.url}|Open the pull request>`),
    ],
  };
}

const GONE: Message = { text: "You're no longer asked to review this change.", blocks: [section("You're no longer asked to review this change: a later push changed who Vera asks.")] };

async function slack(token: string, method: string, body: object, fetchImpl: Fetch): Promise<{ ok: boolean; error?: string; channel?: string; ts?: string }> {
  const res = await fetchImpl(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; error?: string; channel?: string; ts?: string };
}

/** Sends each person with a Slack ID their message, or updates the one they
 * were sent before; people no longer asked are told so. Never throws: a
 * Slack failure is reported and the review goes on. Returns what was sent. */
// No link previews: every link in the message points at the same pull request, and Slack would
// add a GitHub card for each. An update also clears the cards a message got before this change.
const PLAIN = { unfurl_links: false, unfurl_media: false };
const NO_CARDS = { attachments: [] };

export async function sendAll(token: string, ids: Map<string, string>, everyone: Person[], render: (p: Person) => Message, prior: Sent, fetchImpl: Fetch = fetch): Promise<{ sent: Sent; problems: string[] }> {
  const sent: Sent = {};
  const problems: string[] = [];
  for (const p of everyone) {
    const key = p.who.toLowerCase();
    const was = prior[key];
    const id = ids.get(key);
    if (!was && !id) continue;
    try {
      const m = render(p);
      if (was) {
        const r = await slack(token, "chat.update", { channel: was.channel, ts: was.ts, ...m, ...NO_CARDS }, fetchImpl);
        if (r.ok) {
          sent[key] = was;
          continue;
        }
        if (r.error !== "message_not_found" || !id) {
          problems.push(`${p.who}: ${r.error}`);
          sent[key] = was;
          continue;
        }
      }
      const r = await slack(token, "chat.postMessage", { channel: id, ...m, ...PLAIN }, fetchImpl);
      if (r.ok && r.channel && r.ts) sent[key] = { channel: r.channel, ts: r.ts };
      else problems.push(`${p.who}: ${r.error}`);
    } catch (e) {
      problems.push(`${p.who}: ${(e as Error).message}`);
      if (was) sent[key] = was;
    }
  }
  for (const [key, was] of Object.entries(prior)) {
    if (everyone.some((p) => p.who.toLowerCase() === key)) continue;
    const r = await slack(token, "chat.update", { channel: was.channel, ts: was.ts, ...GONE, ...NO_CARDS }, fetchImpl).catch((e: Error) => ({ ok: false, error: e.message }));
    if (!r.ok) problems.push(`${key}: ${r.error}`);
  }
  return { sent, problems };
}
