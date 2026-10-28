# Vera: build plan

What we're building comes from `research/findings/08-decision.md`. This
plan covers how. Every milestone ends with something you can see working,
its numbers, and a commit.

**Decided (Nahuel, 2026-10-20):** path C. First something solid and runnable
that's cheap to keep alive (run viewer, CLI, GitHub Action). Then a thin
hosted layer and Slack on a demo workspace to show cross-role sign-off live.
TypeScript throughout. Agents on Anthropic's TypeScript SDK with our own
read-only tools.

**Decided (Nahuel, 2026-10-22): free and open source.** Vera is a tool
people download and run themselves, under the Apache 2.0 license, and it's
never charged for. Each team brings its own Anthropic API key, so a run
costs them about $0.35 and costs Nahuel nothing. That makes the CLI and the
GitHub Action the product, not demo pieces, and rules out anything that
only works on Nahuel's servers: the Slack layer (M6) is something a team
hosts itself. Being installable adds its own work: versioned releases, the
Action on the GitHub Marketplace, setup and `.vera.yml` docs, and a guide
for contributors.

## Who it's for, and how they get in

| Who | Does | Sees |
|---|---|---|
| Someone browsing the portfolio | Opens a link | The **run viewer**: Vera's real runs on real public PRs, replayed. Map, briefs, questions, plus each agent's steps, tool calls, time and cost. No install, no API cost per visitor |
| An engineer who wants proof | `npx vera review <public GitHub PR URL>` with their own API key | Vera's output on a PR they picked |
| A team (and Nahuel's own repo) | Adds the **GitHub Action** and an API key secret | A comment on each PR plus the sign-off check, inside their own CI. No server |
| Phase 2: a team on Slack | Runs Vera's Slack app on its own infrastructure (or watches the demo recording) | `@vera` asking design, security and product in parallel, chasing, summarizing |

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
        run viewer ◀──────┘               └────▶ phase 2: self-hosted Slack app 
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

**What Vera is for: review that keeps up.** *(Decided 2026-10-21.)* Review
isn't slow; it just hasn't got any faster, while the code in each change
doubled. Reviewers kept pace by reading less (comments per line −38%).
Vera speeds review up to match the cadence of code, without approvals of
code nobody read: triage (what to look at first), routing, a brief per
role, answers from the code, sign-off in parallel, and the understanding
check that keeps the speed honest. The two numbers that prove it, from
the traces and the M5 demo company: reviewer minutes per 100 lines, and
time to full sign-off. Merge time alone isn't the measure (it was already
flat).

**Vera explains the change to whoever has to approve it.** *(Decided
2026-10-21.)* Reviewers ask `@vera` in Slack or on the PR ("which orders
change, and by how much?") and the Briefer answers from the code:
- It reads; it never runs or changes the code. Every answer cites the files
  and lines it rests on, and a concrete example where one helps.
- If the answer isn't in the code or the PR, it says so instead of guessing.
- It won't give away the answers to an open understanding check; it points
  to where to look, and explains fully once the reviewer has answered.
- Eval (M2): on 50 questions about real GitLab MRs, answers are checked
  against the diff by a person; ≥ 90% correct and every one cited.
- Where: PR comments in M4 (the Action answers `@vera` mentions), Slack in M6.

**Likely-AI changes raise the stakes; they don't get a score.**
*(Decided 2026-10-21.)* "AI-written code needs cleaning up" tied for first
of the twelve pains, but rating code is what the review bots already do,
and a slop score per person would be surveillance (a kill criterion). So:
- The Mapper reads signals, it doesn't write review comments: AI help
  disclosed (label, description, co-author trailer), diff size, new
  branches with no new tests, duplicated blocks, a jump in comment-to-code
  ratio, and review-bot findings still open.
- Signals raise the change's risk, which changes who looks and how. Rules
  in `.vera.yml` (`ai_changes`) decide: the owner of the code it touches
  (CODEOWNERS), a second reviewer above a size, and the understanding check
  even on small changes. No model picks who gets pinged.
- Every alert says why ("AI help disclosed, 400 lines, no tests for the new
  rounding, 2 bot findings open"), so people don't learn to ignore it.
- Numbers stay at team level: e.g. likely-AI changes merged without a
  recorded check this month. Never per author.

**Routing: people say what they cover; when unsure, Vera asks the lead.**
*(Decided by Nahuel 2026-10-22, after M1's first routing scores.)* Rules
alone can't route to design: "any frontend change" catches 91% of real
design reviews, but only 1 ping in 10 is needed. So:
- **People choose their role and their areas.** Each person picks a role
  from a set list (engineer, designer, PM, docs, security, lead) and the
  projects or features they cover, in `.vera.yml`. Nobody is pinged about
  anything outside their areas.
- **Vera models the organization.** Many teams, each with its own lead, PM
  and designers. The Mapper's job is to say which areas a change touches;
  the declared areas then decide who's asked (agents propose, code
  decides).
- **Three outcomes, not two.** Sure → ask the right people directly.
  Unsure → ask the area's lead or PM ("who should review this?"); their
  answer connects the reviewer and teaches Vera. Sure it's not needed →
  stay quiet.
- **The lead budget: at most 1 change in 6 becomes a question to a lead.**
  Above that, Vera is a nuisance. Evals measure precision of direct pings,
  recall counting escalations as caught, and the escalation rate against
  this budget.

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
API). A rules-only baseline sets the number the agents must beat. Also a
fix-up label: whether a merged MR was followed within 7 days by another MR
that touched the same files to fix or revert it. If that can't be labelled
reliably from public history, say so and use review comments per line
instead. *Done when:* baseline scores are on the panel's Evals page.
*Done 2026-10-22* (`research/findings/09-evals.md`, /evals). The fix-up
label failed its check (16% real), so the fallback is review comments per
100 lines. A stricter label (a later MR links or reverts it) failed too
(12% real), so M2 adds a step: a model judges linked pairs, used only if
it matches Nahuel's verdicts on 50 pairs.

**M2: The agents, from the CLI.** `vera review <PR URL>` runs the coordinator
and the four agents on any public GitHub PR and writes a trace. Evals: the
Mapper recalls ≥ 80% of areas and beats the baseline; routing suggestions
reach ≥ 80% precision and recall; on 50 changes, the Examiner's questions
are rated by a person and its grading agrees with a person ≥ 80% of the
time. The likely-AI signals must predict fix-ups better than diff size
alone; if they don't, they stay out of routing and that result goes on
the Evals page. Cost and time per PR come from the traces. *Needs:* Nahuel's personal
Anthropic API account. *Done when:* the CLI works on any public PR and the
eval scores and cost are on the Evals page.
*Progress (25 Oct 2026):* the Mapper, the visibility check and routing are
scored (study 06, findings 10); the fix-up judge failed its check. `vera
review <PR URL>` runs on any public GitHub PR: owners come from the repo's
`.vera.yml`, else CODEOWNERS; when Vera isn't sure and no lead is declared,
it shows its best candidates marked as unsure (Nahuel's call). About 1–2
cents a review on Sonnet 5.5. *28 Oct 2026:* the Briefer passes (its
first places match where reviewers commented, 74% vs 64%); the Examiner's
questions for designers fail (49% good): they need screenshots of the
change, so preview deployments come before the Examiner is used for
design.

**Before M3: the demo (2026-10-21).** /demo is the run viewer playing a
scripted trace (apps/panel/lib/demo/run.ts) for a fictional shop's pull
request: the agents work, the visitor answers the understanding check and
approves, and every role signs off. The trace uses @vera/core's real
format and price table, and a test keeps it valid. M3 swaps in recorded
traces from real runs.

**M3: Run viewer.** Vera run on a curated set of real public PRs (including
AI-written ones and small cross-role ones), with the traces recorded. The
panel's Runs page replays them step by step. *Done when:* a visitor can open
a link and watch a full run, with no API calls.

**M4: GitHub Action + understanding checks.** The Action runs on PRs in the
user's CI. It posts the map and briefs, creates the "Vera: sign-off" check
from `.vera.yml`, and records approvals. On risky changes it asks the
reviewer 1–3 questions in a PR comment, grades the answer, and shows it on
the approval. Likely-AI changes follow the `ai_changes` rules: the code
owner and, above the size limit, a second reviewer are requested, with the
reason in the comment. Teams can opt into a gate. *Done when:* it runs on Nahuel's
portfolio repo, end to end, and another team could install it from a
tagged release by following the setup docs.

**M5: Demo company + case study.** A demo repo with seeded roles (engineer,
designer, security, PM) and realistic AI-written changes. Measured against
the decision document's targets: time to full sign-off, reviewer minutes
per 100 lines, share of approvals showing understanding, fix-ups within 7
days. *Done when:* the numbers are on the panel and the case study is
drafted for the portfolio.

**Phase 2, M6: Self-hosted Slack.** A small server a team runs itself
(webhooks, a small database) on the same core, plus a Slack app, shown on a
demo workspace. `@vera` answers questions about a change. Sign-off requests go
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
- **Before M6:** how a team runs the Slack layer itself (one container, which database).
