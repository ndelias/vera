# Study 09: is the walkthrough right, and does it help?

Written 27 Nov 2026, before any walkthrough was generated for the sample.

## Why

The walkthrough (PR #53) explains every change in a pull request, in steps,
in reading order. The parts it builds on were measured in study 08: the
Briefer's spots hold 3 in 4 of what reviewers caught, and Triage wrongly
clears about 2 in 100. The walkthrough's own explanations weren't. A wrong
explanation is worse than none: a reviewer who trusts it skims past the
problem. So before Vera is offered to other teams, Nahuel rates them.

## Sample

15 pull requests from study 08's test set (never used to build or tune
anything): 5 each from Grafana, PostHog and Sentry, drawn at random (seed
`20261127-<repo>`), listed in `sample.json`. 5,746 changed lines. Each one
has the same diff the study used (the first version reviewers commented
on), the Briefer's places and Triage's skips from study 08's test runs, and
the spots that mattered.

## What Vera does

The Guide (`packages/agents/src/guide.ts`, as merged in #53) writes the
walkthrough for each pull request, on Sonnet 5.5 through the Batch API.
Each step's level comes from the study 08 runs, exactly as in the product:
Verify if it holds a Briefer place, Cleared if Triage cleared all of it (for
engineers), otherwise Skim.

## What Nahuel rates (cold: no rating or lean from Claude is shown)

For each step, with its code beside it:

1. **Accurate:** is everything the explanation says true of this code? (yes / no)
2. **Clear:** would a reviewer understand what this part does from it? (yes / no)

For each spot that mattered and falls in a Skim or Cleared step (outside
the Verify spots), shown as its lines highlighted in that step's code:

3. **Points there:** would this step's explanation have led you to look at
   these lines? (yes / no)

## Bar (Nahuel's call, 27 Nov 2026)

- **Accurate: at least 9 in 10 steps.**
- **Clear: at least 8 in 10 steps.**
- **Points there:** reported with no bar. There's nothing to compare it to
  yet, so this is the baseline.

## Budget

About $1 for the Guide on 15 pull requests (batch). Nahuel's time: about
45 minutes.

## Changes before any rating

**27 Nov 2026, after the walkthroughs were generated, before Nahuel rated
anything: "points there" counts spots outside the Briefer's places, not
outside Verify steps.** One Briefer place makes its whole step Verify, so
40 of the 64 steps are Verify and only 1 spot that mattered sits in a Skim
or Cleared step: too few to say anything. The question this measure is for
is the one study 08 left open: the spots that mattered outside the
Briefer's places (about 1 in 4), where the walkthrough's explanation is all
a reviewer has. So it now covers every spot that mattered that no Briefer
place covers (same file, within 3 lines, as study 08 scored Verify),
whatever its step's level. The step levels shown are unchanged, as the
product shows them. That 40 of 64 steps came out Verify is itself a
finding, reported with the results.

**27 Nov 2026, still before any rating: "points there" covers the whole
test set (Nahuel's call).** The 15 sampled PRs have only 3 spots that
mattered outside the Briefer's places (3 of 26; across all 105 test PRs
it's 53 of 215). So the Guide also writes walkthroughs for the other 90
test PRs, and their spots outside the Briefer's places are rated for
"points there" too, with the same question and the same view. Accuracy
and clarity stay on the 15 sampled PRs, with the bar unchanged.

## Round 2: Guide v2 on a fresh sample (written 27 Nov 2026, before any v2 walkthrough)

Round 1 missed both bars (accurate 81%, clear 79.7%; findings 13), rated by
Nahuel with AI assistance.

- **Guide v2** (`guide.ts`, tuned on round 1's 15 PRs only): never claim
  more than the code shows ("only", "every", "unless" only when proven), the
  exact verb for what happens, up to 70 words for steps that change logic,
  data, permissions, error handling or anything other code calls (with what
  changes for callers and what can fail), 35 for the rest, tests described
  by what they check, routine edits called what they are, and test fakes
  flagged when they share state.
- **Fresh sample:** 15 test PRs Nahuel has seen nothing of (not in round
  1's sample, and no spot of theirs was on the rating page), 5 per repo at
  random (seed `20261127b-<repo>`), in `sample-b.json`.
- **Rated by Nahuel alone, without AI help** (his call): accuracy and
  clarity only, same questions, same view.
- **Same bar:** accurate at least 9 in 10 steps, clear at least 8 in 10.
