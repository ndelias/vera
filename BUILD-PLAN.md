# Vera: build plan

What we're building comes from `research/findings/08-decision.md`. This
plan covers how. Every milestone ends with something you can see working,
its numbers, and a commit.

**Decided (Nahuel, 2026-10-20):** path C. First something solid and runnable
that's cheap to keep alive (run viewer, CLI, GitHub Action). Then a thin
hosted layer and Slack on a demo workspace to show cross-role sign-off live.
TypeScript throughout. Agents on Anthropic's TypeScript SDK with our own
read-only tools.

## Who it's for, and how they get in

| Who | Does | Sees |
|---|---|---|
| Someone browsing the portfolio | Opens a link | The **run viewer**: Vera's real runs on real public PRs, replayed. Map, briefs, questions, plus each agent's steps, tool calls, time and cost. No install, no API cost per visitor |
| An engineer who wants proof | `npx vera review <public GitHub PR URL>` with their own API key | Vera's output on a PR they picked |
| A team (and Nahuel's own repo) | Adds the **GitHub Action** and an API key secret | A comment on each PR plus the sign-off check, inside their own CI. No server |
| Phase 2: someone watching the demo | Joins the demo Slack workspace (or watches the recording) | `@vera` asking design, security and product in parallel, chasing, summarizing |

## The shape

```
                   ┌──────────── @vera/core ────────────┐
 PR (GitHub API) ─▶│ Coordinator                        │
                   │  ├─ Mapper    what it touches, risk│  agents: Anthropic TS SDK,
                   │  ├─ Briefer   one brief per role   │  tool runner, structured
                   │  ├─ Examiner  questions + grading  │  outputs
                   │  └─ Sign-off  asks, chases         │
                   │ Rules (.vera.yml)  Gate  Record    │  plain code, deterministic
                   └──────┬───────────────┬─────────────┘
                          │ trace (every step, tool call, cost)
        CLI ◀─────────────┤               ├────▶ GitHub Action (comment + check)
        run viewer ◀──────┘               └────▶ phase 2: hosted webhooks + Slack
```

**Agents propose, code decides.** Which roles must sign off comes from
`.vera.yml` rules in the repo. The gate is a check run and the record is
append-only. No model can argue with any of the three.

**Every run writes a trace**: each agent, step, tool call, output, token
count, cost and latency. The trace drives the run viewer, the evals and
debugging. It's the centrepiece of the portfolio piece.

**Read-only by design.** Vera never runs the repository's code. Its tools
read the diff, files, code search, CODEOWNERS, review-bot comments, CI
status and preview links.

## Repo layout

```
apps/
  panel/      research panel (exists); gains Evals and Runs pages
packages/
  core/       coordinator + the four agents, prompts, skills, schemas, traces
  tools/      read-only GitHub tools behind one interface (swappable later)
  rules/      .vera.yml parser + evaluator (pure, unit-tested)
  cli/        `vera review <PR URL>`
  action/     the GitHub Action
  evals/      datasets from GitLab history + scoring
phase 2:
  apps/hosted/  webhooks + Slack app on a demo workspace
```

Every package is added only after Nahuel approves it, with what it's for and
its size.

## Milestones

**M0: Foundations.** Workspace, TypeScript config, CI (typecheck, unit
tests), `.env` handling (never read by tools, never committed), the trace
format. *Done when:* CI is green on the skeleton.

**M1: Evals first. Free, no model.** Datasets from the 105k historical
GitLab MRs: changed paths + labels → reviewer roles (routing) and → area
labels (mapping). Needs file paths for ~3,000 sampled MRs (public diffs
API). A rules-only baseline sets the number the agents must beat. *Done
when:* baseline scores are on the panel's Evals page.

**M2: The agents, from the CLI.** `vera review <PR URL>` runs the coordinator
and the four agents on any public GitHub PR and writes a trace. Evals: the
Mapper recalls ≥ 80% of areas and beats the baseline; routing suggestions
reach ≥ 80% precision and recall; on 50 changes, the Examiner's questions
are rated by a person and its grading agrees with a person ≥ 80% of the
time. Cost and time per PR come from the traces. *Needs:* Nahuel's personal
Anthropic API account. *Done when:* the CLI works on any public PR and the
eval scores and cost are on the Evals page.

**M3: Run viewer.** Vera run on a curated set of real public PRs (including
AI-written ones and small cross-role ones), with the traces recorded. The
panel's Runs page replays them step by step. *Done when:* a visitor can open
a link and watch a full run, with no API calls.

**M4: GitHub Action + understanding checks.** The Action runs on PRs in the
user's CI. It posts the map and briefs, creates the "Vera: sign-off" check
from `.vera.yml`, and records approvals. On risky changes it asks the
reviewer 1–3 questions in a PR comment, grades the answer, and shows it on
the approval. Teams can opt into a gate. *Done when:* it runs on Nahuel's
portfolio repo, end to end.

**M5: Demo company + case study.** A demo repo with seeded roles (engineer,
designer, security, PM) and realistic AI-written changes. Measured against
the decision document's targets: time to full sign-off, reviewer minutes
per 100 lines, share of approvals showing understanding, fix-ups within 7
days. *Done when:* the numbers are on the panel and the case study is
drafted for the portfolio.

**Phase 2, M6: Hosted + Slack (demo workspace).** A thin hosted layer
(webhooks, a small database) on the same core, plus a Slack app on a demo
workspace. `@vera` answers questions about a change. Sign-off requests go
to each role in parallel, each with its own brief. Vera chases and
summarizes. No real customers: a demo repo and workspace you control.
*Done when:* a cross-role change collects design, security and engineering
sign-off in parallel from Slack, and the run is recorded for the viewer.

## Cost (estimate; M2 measures the real figure)
Per PR on Opus 5.5: about 60k input tokens and 6k output across the four
agents. That's **≈ $0.35 per PR** before caching. The CLI and Action use the
user's own key. Recording the demo runs for the viewer is a one-time cost of
a few dollars. Visitors cost nothing.

## Still to decide (one at a time, when they come up)
- **Before M2:** a personal Anthropic API account (M0 and M1 need none).
- **Before M4:** the GitHub account the Action and demo repos live under.
- **Before M6:** hosting and database for the thin hosted layer.
