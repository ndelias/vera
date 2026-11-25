// Signing off in Slack (Nahuel's calls, 6 Nov 2026). Someone presses Sign
// off in their Slack message from Vera, answers the questions in a form, and
// Vera's Slack server posts the sign-off on the pull request as the team's
// GitHub App. The Action counts it for that person only when the comment's
// author is that app: GitHub vouches for who wrote a comment, so nobody else
// can post one that counts. The comment also names the Slack conversation
// the sign-off came from: the server reads who a message went to from Vera's
// comment, which anyone with write access can edit, so the Action checks the
// conversation against its own signed record (packages/cli/src/sealed.ts).
//
// Shared by the Action and the server (apps/slack), so it imports nothing.

/** The Slack button that opens the sign-off form. */
export const SIGN_OFF_ACTION = "vera_sign_off";

const MARK = /<!-- vera-slack-signoff:([A-Za-z0-9-]+)(?::([A-Za-z0-9]+))? -->/;
const handle = (who: string) => who.replace(/^@/, "");
/** One line per answer, so a line starting with a number can't split it. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The comment the server posts, for the person Vera messaged in `channel`.
 * The `/vera sign-off` line is what the workflow listens for and what Vera
 * reads, as for one typed on GitHub. */
export function slackSignoff(who: string, channel: string, roles: string[] | "all", answers: string[]): string {
  const h = handle(who);
  return [
    `<!-- vera-slack-signoff:${h}:${channel.replace(/[^A-Za-z0-9]/g, "")} -->`,
    `**${h}** signed off in Slack.`,
    "",
    `/vera sign-off${roles === "all" ? "" : ` ${roles.join(" ")}`}`,
    ...answers.flatMap((a, i) => (oneLine(a) ? [`${i + 1}. ${oneLine(a)}`] : [])),
  ].join("\n");
}

/** Who a Slack sign-off is for and the conversation it came from, only when
 * the GitHub App wrote it. `channel` is null from a server deployed before this check. */
export function slackSigner(author: string, body: string, app: string): { who: string; channel: string | null } | null {
  if (!app || author.toLowerCase() !== `${app.toLowerCase()}[bot]`) return null;
  const m = MARK.exec(body);
  return m ? { who: m[1]!, channel: m[2] ?? null } : null;
}

// Answering a spot from Slack (Nahuel's call, 25 Nov 2026): each spot in Vera's
// Slack message has three buttons, and the server posts the answer in the spot's
// thread on the pull request as the team's GitHub App, naming the person and the
// Slack conversation. The Action counts it for them only when that app wrote it
// and the conversation is the one it has on record for them, as with sign-offs.

export const SPOT_VERIFIED = "vera_spot_verified";
export const SPOT_EXPLAIN = "vera_spot_explain";
export const SPOT_CHANGE = "vera_spot_change";

const ANSWER = /<!-- vera-slack-answer:([A-Za-z0-9-]+)(?::([A-Za-z0-9]+))? -->/;
const quote = (s: string) => s.trim().split("\n").map((l) => `> ${l}`).join("\n");

/** The reply the server posts in a spot's thread, for the person Vera messaged in `channel`.
 * The line after the marker is what the Action reads: ✓ for verified, "Needs a change" or a
 * suggestion for a change. */
export function slackAnswer(
  who: string,
  channel: string,
  kind: "verified" | "change" | "explain",
  t: { what?: string; code?: string; question?: string; answer?: string } = {},
): string {
  const h = handle(who);
  const head = `<!-- vera-slack-answer:${h}:${channel.replace(/[^A-Za-z0-9]/g, "")} -->`;
  if (kind === "verified") return `${head}\n✓ Verified by **${h}** in Slack.`;
  if (kind === "change") {
    return [head, `Needs a change, from **${h}** in Slack:`, "", quote(t.what ?? ""), ...(t.code?.trim() ? ["", "```suggestion", t.code.replace(/\n+$/, ""), "```"] : [])].join("\n");
  }
  return [head, `**${h}** asked in Slack:`, "", quote(t.question ?? ""), "", `**Vera:** ${t.answer ?? ""}`].join("\n");
}

/** Who a Slack answer is for and the conversation it came from, only when the GitHub App
 * wrote it. `channel` is null from a server deployed before this check. */
export function slackAnswerer(author: string, body: string, app: string): { who: string; channel: string | null } | null {
  if (!app || author.toLowerCase() !== `${app.toLowerCase()}[bot]`) return null;
  const m = ANSWER.exec(body);
  return m ? { who: m[1]!, channel: m[2] ?? null } : null;
}
