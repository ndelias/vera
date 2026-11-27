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
