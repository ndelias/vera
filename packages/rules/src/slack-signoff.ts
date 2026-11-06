// Signing off in Slack (Nahuel's calls, 6 Nov 2026). Someone presses Sign
// off in their Slack message from Vera, answers the questions in a form, and
// Vera's Slack server posts the sign-off on the pull request as the team's
// GitHub App. The Action counts it for that person only when the comment's
// author is that app: GitHub vouches for who wrote a comment, so nobody else
// can post one that counts.
//
// Shared by the Action and the server (apps/slack), so it imports nothing.

/** The Slack button that opens the sign-off form. */
export const SIGN_OFF_ACTION = "vera_sign_off";

const MARK = /<!-- vera-slack-signoff:([A-Za-z0-9-]+) -->/;
const handle = (who: string) => who.replace(/^@/, "");
/** One line per answer, so a line starting with a number can't split it. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The comment the server posts. The `/vera sign-off` line is what the
 * workflow listens for and what Vera reads, as for one typed on GitHub. */
export function slackSignoff(who: string, roles: string[] | "all", answers: string[]): string {
  const h = handle(who);
  return [
    `<!-- vera-slack-signoff:${h} -->`,
    `**${h}** signed off in Slack.`,
    "",
    `/vera sign-off${roles === "all" ? "" : ` ${roles.join(" ")}`}`,
    ...answers.flatMap((a, i) => (oneLine(a) ? [`${i + 1}. ${oneLine(a)}`] : [])),
  ].join("\n");
}

/** Who a Slack sign-off is for: the handle in it, only when the GitHub App wrote it. */
export function slackSigner(author: string, body: string, app: string): string | null {
  if (!app || author.toLowerCase() !== `${app.toLowerCase()}[bot]`) return null;
  return MARK.exec(body)?.[1] ?? null;
}
