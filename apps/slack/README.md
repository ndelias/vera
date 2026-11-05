# Vera in Slack

Each person Vera asks gets their part of the review as a Slack message:
their roles, where to look, and their questions. The message is updated
as people push and sign off. Built in stages (BUILD-PLAN, M6):

1. **Sending** (now): the GitHub Action messages each person. No server.
2. **The server:** people can ask Vera about the change in the thread.
3. **Answering and signing off** in Slack.

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
