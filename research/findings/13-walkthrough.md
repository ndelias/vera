# Study 09: is the walkthrough right, and does it help?

Design and every change to it, written before each result:
`studies/09-walkthrough/DESIGN.md`. The Guide (Sonnet 5.5) wrote
walkthroughs for study 08's test PRs; two rounds were rated against the
same bar: **at least 9 in 10 steps accurate, at least 8 in 10 clear**.
Ratings and notes in `ratings.json` (round 1) and `ratings-b.json`
(round 2); the accuracy checker's verdicts, claim by claim, in
`checker.json`. Total model cost: about $3.

## Result: Guide v2 passes both bars, and is now the product's Guide

| | Guide v1 (round 1, 64 steps) | **Guide v2 (round 2, 54 steps)** | Bar |
|---|---|---|---|
| **Accurate, checked by Claude Opus 5.5** | 56 of 64 (88%) | **54 of 54** (none failed; very likely above 94%) | 9 in 10: **passes** |
| **Clear, rated by Nahuel alone** | | **47 of 54 (87%)** | 8 in 10: **passes** |
| Round 1's ratings (Nahuel with AI assistance) | accurate 52 of 64 (81%), clear 51 of 64 (79.7%) | | both missed |
| Claims per step / contradicted by the code | 4.4 / 8 | 5.2 / **0** | |
| Words per explanation (median) | 30 | 41 | |

**Who rated what, plainly.** Nahuel isn't trained to read code, so he
rated what a non-engineer reader can judge: whether each step's
explanation is clear (round 2, on his own, no AI). Whether an explanation
is true of the code was checked by a model, which lists each claim and
checks it against the step's code; it's reported as model-checked, not as a
human rating. On round 1, the checker agreed with Nahuel's AI-assisted
ratings on 58 of 64 steps, flagging 8 problems where they flagged 12.

v2 isn't accurate by saying less: its explanations are longer and make more
claims per step, and none of them is contradicted by the code.

## Does it help where the Verify spots miss?

Round 1 asked it of every spot that mattered outside the Briefer's places,
across all 105 test PRs: would the walkthrough's explanation have led you
to look there? **45 of 53 (85%)**, rated by Nahuel with AI assistance, on
Guide v1. With study 08's Verify spots (162 of 215), Vera flags or points
toward about **96%** of what reviewers caught (207 of 215).

## What changed from v1 to v2 (tuned on round 1's PRs only)

Round 1's notes showed three kinds of mistake, and v2's instructions
answer each: claims wider than the code ("only", "every", "unless"), the
wrong verb for what happens ("ignores" where it refuses, "clamps" where it
filters out), and too little room on big steps. v2 names the specific case,
uses the verb for what the code does, and gives steps that change logic,
data, permissions or anything other code calls up to 70 words, with what
changes for callers and what can fail.

## What still reads unclear (round 2's notes)

- Test steps that list test names instead of saying what should happen.
- Jargon without a plain version ("upserts", "atomic block", status codes
  without saying what they mean for a person).
- A missing why: a speed fix that never says it's for speed, a new
  endpoint the explanation never names.
- "Other changes": the step that gathers what the Guide left ungrouped
  explained nothing, and in one PR it held a lot.

## Other findings

- **40 of round 1's 64 steps came out Verify** (37 of round 2's 54): one
  Briefer place makes its whole step Verify. Worth a finer label, such as
  "Verify 1 spot", once seen on more real pull requests.
- Verify steps were the hardest to explain well in round 1 (31 of 40 rated
  accurate, against 19 of 20 Skim steps).

## Limits

- 15 PRs per round, from three large open-source repos.
- One rater for clarity, who reads as a non-engineer: a good test of
  plain language, not of whether an engineer finds it enough.
- Accuracy is a model's judgment. It agrees with careful reading most of
  the time on round 1, but it can share blind spots with the model that
  wrote the explanation.
