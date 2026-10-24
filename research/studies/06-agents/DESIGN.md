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

## Routing v1: code only (written before it's scored)

No model call. For each role (design, docs, product) and each change:
1. **Is it that role's kind of change?** The same file rules as the hand
   rules (B2): UI files for design, `doc/` for docs, a new feature flag or
   a metrics definition for product. If not: stay quiet.
2. **If it is,** look at the Mapper's first team. If the Mapper rated it
   high and that team has the role in the directory: **ping** the role.
   If it rated it high and the team has no one in that role: stay quiet.
   Otherwise (medium, low, or a team not in the directory): **ask the
   lead.**
3. **Lead budget:** if more than 1 change in 6 would ask the lead, the
   changes whose first team was rated low are kept quiet first, then
   medium, until the budget holds.

Scored on the same 500 test changes, against the hand rules and the path
lookup with asking, on the same changes: caught (asks count as caught),
needed (of direct pings), and the share of changes that ask the lead.

## Routing v1, first look (23 Oct 2026), and a new target for design

On the 500 test changes, routing v1 (after fixing the directory parser,
which had missed writers and PMs written as lists; Mapper v1 and v2 saw
those incomplete role lists) caught 11 of 13 design reviews with 13% of
its design pings needed (hand rules: 13 of 13, 8%), and 76% of docs
reviews with 53% needed (hand rules: 87%, 46%). Product had 3 reviews.

**Decided (Nahuel): design is scored against his judgment, not against
who reviewed.** "Who reviewed" is GitLab's habit: designers see few UI
changes, so a ping to a designer who should have seen a change counts as
unneeded. Vera's question is who *should* see it. Docs keeps "who
reviewed" (GitLab requires a writer on docs changes).

- **Sample (seed 20261024), from the same 500:** all 13 changes a designer
  reviewed, 67 other changes with UI files, and 20 changes without, at
  random. Scores are weighted back to the 500 (each stratum by its share).
- **The question:** "Should a product designer see this before it
  ships?" Yes, no or unsure. Nahuel sees the title, the changed files and
  a link; not who reviewed it, its labels, or any system's answer. Unsure
  is left out and counted.
- **Cross-check, free:** how often GitLab's `UX` label agrees with him.
- **Scored:** caught and needed for design, for the hand rules, the path
  lookup with asking, and routing v1.

## Nahuel's design labels (23 Oct 2026)

100 changes from the 500, drawn as planned (seed 20261024). Each card
showed what the change is, what a person would notice, and a case for yes
and for no. Claude's lean appeared after each answer. **Nahuel labelled 100
changes, then read Claude's reasoning on each and revised 43 where it
changed his mind. The revised labels are used (his call).** First answers:
63 yes; final: 38 yes. The final labels match Claude's lean on 99 of 100,
so any Claude-based system scored against them is partly scored against
Claude: results here are reported as agreement with Nahuel's reviewed
calls, and scores against his first answers are reported beside them.

Routing on design, weighted to the 500, against the final labels: hand
rules catch 100% with 44% of pings needed; path lookup with asking 48% and
47%; routing v1 67% and 50%. Against the first answers: 52%/72%, 24%/72%,
36%/64%. Neither file rules nor team ownership say whether a change
alters what people see.

## The visibility check (written before it runs)

A new agent reads a change (title, paths, diff, as the Mapper does) and
answers one question: **does this change what people using the product
see or do?** Yes or no, a confidence (high, medium, low), and one line
naming what changes. Sonnet 5.5, like the Mapper; no tuning, since no
labels exist on train changes; it runs once on the 100 labelled changes.

**Routing v2** keeps v1 for docs and product. For design: ping when the
visibility check says yes with high confidence; ask the lead when it says
yes with medium or low confidence; stay quiet when it says no. The lead
budget (1 change in 6) applies as before. Scored on the 100, weighted to
the 500, against the final and the first labels.

## Visibility check v1 (23 Oct 2026) and the plan for v2

v1 on the 100 labelled changes ($0.71): it flagged all 38 changes Nahuel
said a designer should see, and 31 he said no to. Those 31 are changes a
user would notice that aren't design work (bug fixes that restore intended
behaviour, permission changes, a Slack message's timing). v1 asked "does a
user notice anything?"; Nahuel answered "does this need a designer?".
Routing v2 with it, weighted to the 500, final labels: caught 92%, 39% of
pings needed (hand rules 100%, 44%; routing v1 67%, 50%).

**v2 (Nahuel's call: split the 100).** The 100 are split at random (seed
20261025) into 50 to tune on and 50 held out. The question is rewritten
on the tuning half only; v1 and v2 are then scored once on the held-out
half. The held-out score rests on 50 changes, so its interval is wide.

## Visibility check v2 results (23 Oct 2026)

On the tuning half: agrees with Nahuel's final labels on 47 of 50 (v1 33).
**Held out, scored once:** agrees on 48 of 50 (95% interval 87–99%; v1 36
of 50), catches all 22 he said yes to, and flags 2 he said no to (v1 14).
Design routing with v2 on the held-out half, weighted to the 500: caught
100%, 66% of pings needed (hand rules: 100%, 48%). Against his first
answers v2 agrees on 28 of 50 (v1 36): v2 learned the line he settled on
after reading Claude's reasoning, which Claude's lean matched 99 of 100,
so this is agreement with his reviewed calls, not independent proof.
Spend so far in M2: about $11.20 of $20.

## The fix-up judge (written before it runs or Nahuel labels anything)

The plan from study 05: a model reads a merged change and a later change
that links it within 7 days, and says whether the later one fixes or
reverts something the first got wrong. Used to label fix-ups only if it
agrees with Nahuel on 50 pairs at the study 05 bars: it finds ≥ 80% of the
pairs he calls real fix-ups, and rejects ≥ 90% of those he doesn't.

- **Pairs (seed 20261026):** from the 675 linked pairs not in study 05's
  check: 25 of the 81 whose later title says fix or revert, 25 of the
  other 594. Agreement is reported per stratum and weighted to all 675.
- **Nahuel's verdicts come first and stay his.** Each card shows both
  changes' titles, the exact sentence where the later change mentions the
  earlier one, and links to both. No summary and no answer from Claude,
  before or after. The question: "Does the second change fix or undo
  something the first one got wrong?" Yes, no or unsure; unsure is left
  out and counted.
- **The judge** reads both changes' titles and descriptions and the later
  change's diff. Haiku 5.5 and Sonnet 5.5 both run on the 50 (about $0.60
  together); if one passes, the cheaper passing model labels the rest.
