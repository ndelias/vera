# Study 06 (M2): the agents, scored against the baseline

Draft, 22 Oct 2026. Committed before any model call. Every number here is
scored by `research/pipeline/evals.py`, the same scorer as the baselines
(study 05), on the same test changes.

## What gets built, in order

1. **The Mapper** (first, because routing depends on it). Given a change,
   it names the teams that own what it touches, ranked, with a confidence
   and a one-line reason per team.
   - **Reads:** the changed paths and the diff, and the team directory.
   - **The team directory** is GitLab's public `data/stages.yml`: each
     team's product areas, PM, designers and technical writer. It plays the
     part of the areas people declare in `.vera.yml` (BUILD-PLAN, Routing).
     The version used for each change is the one current when the change
     was opened, so no team appears before it existed. Names of people are
     stripped; the agent sees team, areas, and which roles the team has.
     The file is fetched by a script and not committed.
2. **Routing**, mostly code: the Mapper's teams, plus whether the change
   is the kind a role reviews (UI for design, docs for docs, a new feature
   flag or setting for product), give **ping / ask the lead / stay quiet**
   per role. The agent proposes; plain code decides who is asked, within
   the lead budget (1 change in 6).
3. **The fix-up judge:** reads a change and a later change that links it,
   and says whether the later one fixes it. Used only if it agrees with
   Nahuel's verdicts on 50 pairs (≥ 80% of real fix-ups, ≥ 90% of
   non-fixes).
4. **Briefer and Examiner**, then the `vera review <PR URL>` command on
   public GitHub PRs. Their evals need people (Nahuel rates questions on
   50 changes), so they come after the numbers above.

## How the agents are scored

| Agent | Measure | Bar |
|---|---|---|
| Mapper | Right team in the top 3, test changes | ≥ 80%, and above the path lookup's 45% |
| Routing | Caught (with asking the lead) and needed, per role | ≥ 80% / ≥ 80%, asking on ≤ 1 change in 6 |
| Fix-up judge | Agreement with Nahuel on 50 pairs | ≥ 80% / ≥ 90% |
| Examiner | Questions rated by Nahuel on 50 changes; grading agrees with him | ≥ 80% |
| All | Cost and time per change, from the traces | Reported |

**Sample:** a pilot of 50 test changes first, to measure the real cost
per change. Then a fixed random sample of test changes (seeded, written
down before the run) sized to the budget. The baselines are re-scored on
the same sample so the comparison is like for like.

**Prompts are tuned on train changes only.** Test changes are scored once
per version of the agent, and every version's score is kept, including
the bad ones.

## Budget

$20 of credit to start. Batch runs cost half and need no answer in real
time, so every eval runs as a batch. The team directory is the same for
every change and is cached. Before any run, the estimate is shown and
Nahuel approves it.

## Not decided yet (asked one at a time)

- ~~The model for each agent.~~ **Decided (Nahuel, 22 Oct): pilot all
  three.** Opus 5.5, Sonnet 5.5 and Haiku 5.5 run the Mapper on the same
  50 train changes (fixed seed); accuracy and measured cost per change
  decide which runs the test sample. The model also sets what a review
  costs users, who bring their own key.
- Adding `@anthropic-ai/sdk`, the official SDK (a dependency, so it needs
  Nahuel's OK).

## Pilot results (23 Oct 2026) and the model

50 train changes (seed 20261028); 39 had the right team in that month's
directory. Right team in the top 3: path lookup without the change itself
62% (67% when listed); Haiku 5.5 64% (82%); Sonnet 5.5 66% (85%); Opus 5.5
68% (87%). Right team first: 50%, 32%, 56%, 54%. Cost per change at batch
prices: Haiku $0.0005, Sonnet $0.0082, Opus $0.019; the pilot cost $1.38.
The models are within noise of each other on the top 3; Sonnet and Opus
put the right team first far more often than Haiku, which means fewer
questions to leads.

**Decided (Nahuel): Sonnet 5.5 runs the Mapper.** Its prompt is v1, as
in the pilot. It's scored once on the test sample before any tuning.

## Mapper v1 on test (23 Oct 2026)

500 test changes (seed 20261023), scored once. Right team in the top 3:
**62%** (95% interval 57–66%), against the path lookup's 43% on the same
changes; **77%** (73–81%) on the 399 whose team was in that month's
directory. The other 101 can't be answered by any system. When v1 rated
its first guess high, it was right 60% of the time (medium 34%, low 11%).
Cost $3.81 ($0.0076 a change).

## Mapper v2: ownership history (Nahuel's call)

Adds the ownership skill: for each change, the path lookup's share of past
changes per team for the folders it touches, learned from train only (a
train change is left out of its own history). The instructions also say
when "high" is earned. v1's instructions are kept unchanged beside it.
On the 50 pilot changes: top 3 68% (v1 66%), first guess 58% (56%), and
a "high" first guess right 25 of 33 times (v1 21 of 31). Scored once on
the same 500 test changes.
