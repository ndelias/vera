# Study 09: is the walkthrough right, and does it help?

Design and every change to it, written before the ratings:
`studies/09-walkthrough/DESIGN.md`. The Guide (Sonnet 5.5, PR #53) wrote
walkthroughs for all 105 of study 08's test PRs ($1.30). Nahuel rated the 64
steps of 15 sampled PRs for accuracy and clarity, and the 53 spots that
mattered outside the Briefer's places for "points there". Answers and notes
in `studies/09-walkthrough/ratings.json`.

**How the ratings were made: by Nahuel with AI assistance** (his account,
27 Nov 2026). This is not a pure human rating. A model reading alongside
tends to catch fine-print slips a busy reviewer wouldn't, so accuracy and
clarity may read strict, and "points there" may read generous.

## Results

| | Result | Bar | |
|---|---|---|---|
| **Accurate** | 52 of 64 steps, **81%** (72–91%) | 9 in 10 | **Fails** |
| **Clear** | 51 of 64, **79.7%** (70–89%) | 8 in 10 | **Fails by one step** |
| **Points there** | 45 of 53, **85%** | none: the baseline | |

By level: Verify steps 31 of 40 accurate and 29 of 40 clear; Skim 19 of 20
and 19 of 20; Cleared 2 of 4 and 3 of 4. 40 of the 64 steps came out Verify:
one Briefer place makes its whole step Verify.

**Together with study 08:** the Verify spots hold 162 of the 215 spots that
mattered (75%), and the walkthrough's explanation points toward 45 of the
other 53. So Vera flags or points toward about **96%** (207 of 215) of what
reviewers caught, with the rating caveat above.

## What went wrong (from the notes)

- **Claims broader than the code:** "only", "every", "unless one already
  exists", "non-kiosk" where the code checks one kiosk mode.
- **The wrong verb for what happens:** "ignores" where it refuses,
  "clamps" where it filters out, "persists" where nothing saves.
- **Too short for big steps:** explanations stop at 40 words (median 30).
  Most "not clear" notes ask for consequences: what fails, what changes for
  callers, what a push or upgrade does. Verify steps, the biggest and
  riskiest, suffered most.
- **Where "points there" missed:** steps marked Cleared or Skim gave no
  reason to look (test fakes with shared state, a doc table with a typo),
  and explanations that called formatter churn "minor cleanups".

## Next

A Guide v2 tuned on these 15: no claim wider than the code shows, the exact
verb, and room in Verify steps for what the change does to callers and what
can fail. Then a fresh sample, rated the same way, against the same bar.
