# Vera in Slack

Each person Vera asks gets their part of the review as a Slack message:
their roles, where to look, and their questions. The message is updated
as people push and sign off. Built in stages (BUILD-PLAN, M6):

1. **Sending:** the GitHub Action messages each person. No server.
2. **Replies** (now): people write to Vera and it answers about the change,
   from the pull request, its diff and Vera's review. Needs the server
   in this folder.
3. **Answering the questions and signing off** in Slack.

## Set it up

1. **A workspace you control.** A free Slack workspace is enough.
2. **The app.** At [api.slack.com/apps](https://api.slack.com/apps):
   Create New App → From a manifest → pick the workspace → paste
   [`manifest.yml`](manifest.yml) → Create → Install to Workspace.
3. **The token.** Under OAuth & Permissions, copy the Bot User OAuth Token
   (`xoxb-…`) and save it as a repository secret named `SLACK_BOT_TOKEN`
   (Settings → Secrets and variables → Actions). Paste it only there.
4. **The workflow.** Pass it to Vera:

   ```yaml
   - uses: ndelias/vera@v0.6.0
     with:
       anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
       slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
   ```

5. **Who's who.** In Slack, open each person's profile → ⋮ → Copy member
   ID, and add it to their entries in `.vera.yml`:

   ```yaml
   people:
     - { handle: "@ana", role: engineer, areas: [Checkout], slack: U0123ABCD }
   ```

   Vera reads `.vera.yml` from the branch a pull request merges into, so
   new IDs start working on the pull requests opened after they're merged,
   not on the one that adds them.

People without a `slack` ID are skipped; the comment on the pull request
still has everyone's part. Which message went to whom is kept hidden in
that comment, so there's nothing else to store.

## Replies: the server

With the server, anyone Vera has messaged can write back. A reply in a
review's thread is about that pull request; a new message is about the
latest one Vera sent them. Vera reads the pull request, its diff and its
own review comment, answers in the thread, and keeps answering follow-ups
there. It explains; it never approves, and it only talks about pull
requests it has asked that person to review.

Each answer is one call to Claude on your Anthropic key. The change is
cached, so follow-ups in the same thread within a few minutes cost less.

It's a few plain request handlers (`src/`) and one file for the host
(`api/events.ts`). On Vercel:

1. **Deploy.** Vercel → Add New → Project → import your copy of the Vera
   repo → Root Directory `apps/slack`, Framework Preset "Other" → Deploy.
   Note the address, like `https://vera-slack.vercel.app`.
2. **Its settings.** In the Vercel project: Settings → Environment
   Variables, then redeploy:

   | Name | What |
   | --- | --- |
   | `SLACK_BOT_TOKEN` | The same `xoxb-…` token as the Action's |
   | `SLACK_SIGNING_SECRET` | Slack app → Basic Information → Signing Secret. Proves requests come from Slack |
   | `ANTHROPIC_API_KEY` | The key answers are charged to |
   | `GITHUB_TOKEN` | A fine-grained token, read-only: Contents and Pull requests on the repos Vera reviews. Optional for public repos, but without it GitHub allows 60 reads an hour |
   | `VERA_MODEL` | Optional. Defaults to `claude-sonnet-5-5` |

3. **Point Slack at it.** Slack app → App Manifest → paste
   [`manifest.yml`](manifest.yml) with your address in `request_url`
   (`https://…/api/events`) → Save. Slack checks the address right away.
   Then reinstall the app when Slack asks, for the new permission to read
   the messages people send Vera.

On another host, copy `api/events.ts` and swap in that host's way of
running work after the response.
