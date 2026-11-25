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
