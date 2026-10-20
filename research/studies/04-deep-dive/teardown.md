# Competitor teardown: the products nearest the opportunity

Web research by a Claude Code research agent on 2026-10-20 (public pages
only). Most sources are vendor docs. Independent evidence is thin across the
category; vendor claims are marked (V).

The four unsolved gaps from Stage 2:
- **G1** how much human reviewers can get through
- **G2** proof the reviewer understood the change
- **G3** sign-off across engineering, design, security and product
- **G4** doing the rework, not only flagging it

| Product | G1 Throughput | G2 Understanding | G3 Cross-role sign-off | G4 Rework | Price signal |
|---|---|---|---|---|---|
| CodeRabbit | partly (triage queue, Slack digest) | partly (walkthrough, diagrams) | no | yes (Fix, Autofix) | $24–72/user |
| Graphite (Cursor) + Bugbot | **yes** (stacks, inbox, merge queue) | no | no | yes (cloud agents) | $20–40/user |
| GitHub Copilot review + agent | partly (AI approval counts, preview) | no | no (only CODEOWNERS) | yes (fix PRs, preview) | bundled with Copilot |
| Claude Code Review | partly (verified, ranked findings) | no | no (never approves or blocks) | no (read-only) | token usage |
| Aviator (FlexReview, Verify) | **yes** (expertise/load routing, review time targets) | partly: approves the spec, verifies criteria (V) | partly (separate actors, no design/security roles) | no | $20–50/dev |
| Slack Code | no | partly (plan, diff, preview) | partly: non-engineers review, no approval model | yes (agents) | in Slack plans |
| Chromatic UI Review | no | partly (visual diff) | **yes, design only** (required check) | no | $179–399/mo |
| LinearB gitStream | **yes** (routing, auto-approving low-risk) | no | partly (path rules) | no | $29–59/user |
| Swarmia | partly (review time agreements, nudges) | no | no | no | not verified |
| Amp | partly (recommended review order) | partly | no | not stated | not verified |

**Understanding checks:** the only product found is PR Quiz, an open-source
GitHub Action (v0.1.0, one commit). No funded startup sells "PR
comprehension".

## Demand evidence
- CMU/Stanford (Jul 2026, via Semgrep; original not found): PR volume up
  3.1x while reviewers grew 1.5x. PRs with any human feedback fell 39% to
  21%, and silent approvals doubled.
- arXiv 2605.02273: most AI-generated PRs get no review. Human
  involvement is "agent steering" rather than evaluation.
- IEEE Spectrum: in a Sonar survey, 38% say AI code takes more effort to
  review. Temporal makes authors explain an agent's design choices in their
  own words. An interviewee calls approval without understanding
  "theater approval".

## Conclusions
- **Most open: G2, proof of understanding.** Summaries are everywhere, but
  they help a reviewer read; they don't verify anything. Nothing checks a
  reviewer understood. Aviator gets around it by approving the spec instead.
- **Close second: G3, cross-role sign-off.** Chromatic covers design only,
  and Slack Code brings non-engineers in but has no approval model.
- **Most crowded: G4, rework.** Every major player hands findings to an
  agent that commits fixes. G1 routing and queues are also crowded.
- **To not be "another review bot":** the output should be a human decision
  backed by understanding you can measure. Model roles and keep one
  auditable sign-off. Sit on top of the existing bots and use their findings
  as input.

## Sources
[1] coderabbit.ai/pricing [2] docs.coderabbit.ai/pr-reviews/pre-merge-checks [3] docs.coderabbit.ai/finishing-touches/autofix [4] neuronfeed.com/reviews/coderabbit-review [5] graphite.com/pricing [6] graphite.com/blog/cursor-cloud-agents [7] fortune.com/2025/12/19/cursor-ai-coding-startup-graphite-competition-heats-up [8] docs.github.com/en/copilot/concepts/agents/code-review [9] keyholesoftware.com/github-copilot-pull-request-reviews [10] code.claude.com/docs/en/code-review [11] code.claude.com/docs/en/code-review-costs [12] aviator.co/flexreview [13] aviator.co/verify [14] aviator.co/pricing [15] salesforce.com/ap/news/press-releases/2026/08/25/salesforce-launches-slack-code-to-make-ai-software-development-multiplayer-2 [16] hyrax.dev/blog/slack-code-governance-gap [17] chromatic.com/docs/review [18] chromatic.com/pricing [19] linearb.io/platform/gitstream [20] linearb.io/pricing [21] linearb.io/blog/how-to-add-estimated-review-time [22] help.swarmia.com/use-cases/improve-pull-request-flow/review-code-faster [23] help.swarmia.com/features/ai-tools/review-agents [24] tessl.io/blog/amp-adds-agentic-code-review-to-its-coding-agent-toolkit [25] github.com/dkamm/pr-quiz [26] spectrum.ieee.org/ai-code-review-software-engineers [27] semgrep.dev/blog/2026/end-is-nigh-for-code-review [28] arxiv.org/abs/2605.02273 [29] vantaige.io/blog/cursor-bugbot-pricing-worth-it-2026
