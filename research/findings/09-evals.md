# Study 05 (M1): the number to beat

Design committed before the data was pulled (`studies/05-evals/DESIGN.md`,
with every later change dated there). 6,000 merged GitLab product MRs
(the Stage 3 sample, Oct 2025 to Oct 2026), 46,747 changed files. Split by
time: train before 19 Apr 2026 (2,642 MRs), test from then on (3,358).
Every score is on test. No model is used anywhere.

## Results

| Eval | Best rules baseline (test) | M2 target |
|---|---|---|
| **Mapping:** the team that owns the change, top 3 | **45%** (path lookup; 95% interval 43–47%) | ≥ 80%, and beat 45% |
| Mapping, first guess | 33% (31–35%) | — |
| **Routing, design:** reviews caught / pings that were needed | Hand rules: **91% / 10%**. Path lookup: 40% / 13% | ≥ 80% / ≥ 80% |
| **Routing, docs:** caught / needed | Path lookup: 71% / 63%. Hand rules: 89% / 50% | ≥ 80% / ≥ 80% |
| Routing, product: caught / needed | Path lookup: 33% / 12% (only 36 MRs in test had a product reviewer) | ≥ 80% / ≥ 80% |
| **Routing with "ask the lead"** (Nahuel's decision) | Path lookup asking on 16% of MRs (budget: 1 in 6): design caught **58%**, docs 83%, product 42% | Within the budget, ≥ 80% caught |
| **Fix-ups** (planned label) | **Failed its check:** 16% of labelled fix-ups were real (bar: 80%) | — |
| Fix-ups, stricter label v2 (a later MR links or reverts it) | **Failed too:** 12% real | A model judge in M2, if it passes the same check |
| Review comments per 100 lines (the fallback) | 21.7 overall; AI-disclosed 20.3 (18.1–23.5), the rest 21.8 (20.8–22.9) | Baseline for M5 |

Majority baselines, for the floor: mapping 5%; routing catches nothing.

## What it means

- **Rules can't route to design.** "Any frontend change goes to design"
  catches 91% of real design reviews, but 9 of every 10 pings are wasted.
  Learning paths from history wastes almost as many and misses most. Who
  needs a designer isn't written in the file paths; it's in what the
  change does. That's the agents' job, and now there's a number for it.
- **Asking the lead helps, within budget.** Letting the path lookup ask
  the lead when unsure, on 16% of changes, lifts design from 40% to 58%
  caught without a single extra ping to a designer. Still short of 80%:
  the agents have to be confident on more changes.
- **Org charts move, maps go stale.** 16% of test changes belong to teams
  that didn't exist in the first half of the year (mostly new AI teams).
  No map learned from history can name them. On teams that did exist, the
  path lookup reaches 53% in its top 3 (51–55%). This is the case for
  people declaring their own areas in `.vera.yml` (BUILD-PLAN, Routing).
- **"Same files, fixed within a week" isn't a fix-up.** Of 50 changes the
  label flagged, 8 were really fixed by the later change. 17 shared only a
  generated file (API docs, lint to-do lists), and 25 shared a busy file
  that gets an unrelated fix most weeks. A tool that blames a change for
  later problems from file overlap alone would be wrong 4 times in 5.
  Verdicts in `studies/05-evals/fixup-verdicts.json`.
- **A link isn't a fix either.** The stricter label counted a later
  change that links the first. Of 50, 6 were fixes or reverts; the rest
  were follow-up work (34), stacked, sibling or batched changes (9), and
  backports (3). Teams now split work into many small linked changes, so
  links per month rose from about 800 to over 4,000 this year. Two
  pre-written rules failed, so whether a change needed fixing can't be
  read from public history with simple rules. Verdicts in
  `studies/05-evals/fixup-verdicts-v2.json`.
- **AI-disclosed changes get the same attention per line as the rest.**
  About 20 vs 22 review comments per 100 lines, with overlapping
  intervals. The drop in attention per line (Stage 3) is everywhere, not
  just on AI-disclosed changes. (Comments include bots', as in Stage 3.)

## Correction to studies 02 and 04: "marketing" is mostly technical writers

Study 02's role classifier files GitLab's technical writers under
marketing (their division), and on product MRs they are most of the
"marketing" reviewers: the docs path rule finds 89% of them. So the
cross-role reviews in studies 02 and 04 (G3, R5) are often engineering
plus **docs**, not engineering plus marketing. The findings still hold as
written (two roles still wait longer than one), but "marketing" should
read "marketing and technical writing". This eval calls the role docs.

## What's next

- **M2:** the agents write their predictions to the same table
  (`ev_predictions`) under their own name, and the same scorer scores them.
- **In M2:** a model judges each linked pair (fix or not). It's used only
  if it agrees with Nahuel's verdicts on 50 pairs at the same bars; until
  then, review comments per 100 lines stay the measure.
