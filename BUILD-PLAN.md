# Vera: build plan

What we're building comes from `research/findings/08-decision.md`. This
plan covers how: the architecture, what each milestone ships, and the
decisions Nahuel still needs to make. Same rules as the research: every
milestone ends with something you can see working, its numbers, and a
commit.

## The shape

```
GitHub (PRs, reviews, check runs)          Slack (@vera, sign-off requests)
        │  webhooks                                │  events
        ▼                                          ▼
   ┌───────────────────── Vera server ─────────────────────┐
   │  Coordinator (one run per PR, per update)             │
   │    ├─ Mapper     what the change touches, risk        │  agents (Claude API,
   │    ├─ Briefer    one brief per required role          │  tool use)
   │    ├─ Examiner   understanding questions + grading    │
   │    └─ Sign-off   asks, chases, summarizes             │
   │                                                       │
   │  Rules        .vera.yml → which roles must sign off   │  plain code,
   │  Gate         "Vera: sign-off" check run              │  deterministic
   │  Record       append-only approval log                │
   └───────────────────────────────────────────────────────┘
        ▲ tools: read diff/files, search code, CODEOWNERS, review-bot
          comments, CI status, preview URL, Figma frame, team conventions
```

**Agents propose, code decides.** The agents map, brief, question and chase.
Which roles *must* sign off comes from rules in the repo (`.vera.yml`). The
merge gate is a check run and the record is an append-only log. None of
those three can be argued with by a model.

## Stack (proposed; decisions marked ▲)

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript, one monorepo | GitHub apps, Slack apps and the Anthropic SDK are all first-class in TS; the panel is already Next.js |
| Agents | Anthropic TypeScript SDK, tool use with the SDK's tool runner, structured outputs | Our own tools hitting GitHub, so repo access stays in Vera's hands |
| Model | Claude Opus 5.5 to start, with refusal fallbacks on | The evals measure whether a cheaper model holds quality per agent; that's a later, measured choice |
| GitHub | A GitHub App (webhooks, check runs, PR comments) | Installs per repo with scoped permissions |
| Slack | Slack app (mentions, DMs to reviewers, interactive buttons) | Where sign-off requests and chasing happen |
| Server | ▲ Next.js on Vercel for webhooks and the settings UI, plus a queue so agent runs aren't cut off by serverless time limits | Alternative: one small always-on server (Fly or Railway) for everything |
| Database | ▲ Postgres (Neon or Supabase) | Runs, briefs, answers, the approval record |
| Rules | `.vera.yml` in each repo: paths and labels → required roles | Versioned with the code, reviewable like code |

Every package is added only after Nahuel approves it, with what it's for and
its size.

## Monorepo layout

```
apps/
  panel/        research panel (exists)
  vera/         Next.js: GitHub + Slack webhooks, settings, run history
packages/
  core/         coordinator + the four agents, prompts, skills, structured outputs
  tools/        tool implementations (GitHub reads, search, CODEOWNERS, bot findings…)
  rules/        .vera.yml parser + evaluator (pure functions, fully unit-tested)
  record/       approval log (append-only)
  evals/        datasets from GitLab history + scoring scripts
```

## Milestones

### M0: Foundations
Monorepo, TypeScript config, CI (typecheck, unit tests, evals on a small
fixed set), secrets handling (`.env` never read by tools, never committed).
**Done when:** CI is green on an empty skeleton.

### M1: Evals first, before any product code
Built from data we already have: 105k historical GitLab MRs with their
reviewer roles and labels.
- **Routing dataset:** changed file paths + labels → the roles that actually
  reviewed. Needs one new pull: file paths for ~3,000 sampled MRs (public
  diffs API, free).
- **Rules baseline:** routing with rules only, no model (CODEOWNERS-style
  path rules). Free to run. This is the number the agents have to beat.
- **Mapping dataset:** changed paths → GitLab's area labels (UX, security,
  database, frontend…).
**Done when:** baseline precision and recall for routing and mapping are in
the panel, before any agent exists.

### M2: The agents, offline
`packages/core` with the four agents running on recorded PRs. No GitHub app
yet.
- **Mapper** on the mapping dataset. Bar: recall ≥ 80% and beats the rules
  baseline.
- **Router suggestions** (agent proposes extra roles, rules decide). Bar:
  precision and recall ≥ 80%.
- **Examiner:** questions rated by a person on 50 changes. Grading agreement
  with a person ≥ 80%.
- Cost and time per PR recorded for every eval run.
**Needs:** a personal Anthropic API account (see decisions).
**Done when:** eval scores and cost per PR are in the panel.

### M3: GitHub app on the portfolio repo
Webhooks for PR opened, updated and reviewed. Vera posts one comment with
the map and the briefs, and creates the "Vera: sign-off" check run from
`.vera.yml`. The approval record fills as people approve.
**Done when:** a real PR on the portfolio repo gets a map, briefs and a
sign-off check that turns green when the right people approve.

### M4: Understanding checks
On risky changes, the reviewer answers 1–3 questions (PR comment or Slack)
or explains in their own words. The Examiner grades the answer. The result
is recorded on the approval and shown in the check. Teams can turn it into a
gate in `.vera.yml`.
**Done when:** an approval on a risky change shows whether understanding was
demonstrated, and the gate works when enabled.

### M5: Slack and cross-role sign-off
`@vera` in Slack ("what does #123 touch?", "who still needs to sign off?").
Sign-off requests go to each role in parallel, each with its brief (design
gets the preview, security gets the data flow). Vera chases reviewers and
posts a summary when everyone has signed off.
**Done when:** a cross-role change on the demo repo collects design,
security and engineering sign-off in parallel, all from Slack.

### M6: Demo company and pilot numbers
A demo company repo with seeded roles (engineer, designer, security, PM) and
a set of realistic AI-written changes, including small cross-role ones.
Measure against the decision document's targets: time to full sign-off,
reviewer minutes per 100 lines, share of approvals showing understanding,
fix-ups within 7 days.
**Done when:** the numbers are in the panel and the case study is written.

## Cost (estimate, the M2 evals will measure the real figure)
Per PR on Opus 5.5: about 60k input tokens (diff, context, bot findings)
and 6k output across the four agents. That's roughly **$0.35 per PR**
before caching, and less with the team's conventions and codebase map
cached. A team opening 100 PRs a week would spend about **$30–35 a week**.

## Decisions for Nahuel (one at a time)
1. TypeScript monorepo, agents on the Anthropic TS SDK: OK?
2. Hosting: Vercel + a queue, or one always-on server?
3. Database: Neon or Supabase?
4. A personal Anthropic API account before M2 (M0 and M1 need none).
5. GitHub org/account the app lives under.
