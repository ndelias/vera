# Study 08: can Vera tell reviewers what to skip?

Design and every change to it, written before each result:
`studies/08-skip/DESIGN.md`. 165 merged pull requests from Grafana, PostHog
and Sentry, each with at least one spot a reviewer commented on and the
author then changed: 60 to tune on (Jul–Sep 2026), 105 to score once (1 Oct
– 15 Nov 2026). Scores in `studies/08-skip/scores-*.json`. Claude Sonnet 5.5
through the Batch API; the whole study cost $4.71.

## Results on the 105 unseen pull requests

38,250 changed lines; 215 spots that mattered.

| | Lines cleared | Spots that mattered, cleared | |
|---|---|---|---|
| Simple rules (lockfiles, generated, docs, imports, whitespace) | 5.2% (3.4–7.3%) | 24 of 215, **11.2%** (2.4–22.1%) | |
| **Triage v1** | **9.7%** (6.3–13.6%) | **5 of 215, 2.3%** (0.5–4.5%) | |

Scored for any reader: docs and wording count as Verify, since they're
cleared for engineers only (Nahuel's call, 25 Nov 2026).

**The bar (Nahuel's, written before any data):**

1. Misses at most 1 in 30 (3.3%): **2.3%, passes.** The interval reaches
   4.5%, so this rests on 5 misses.
2. Clears at least a third of the lines: **9.7%, fails.**
3. Beats the rules (more cleared, no more misses): **passes**, on both.

**Triage fails the bar.** What it clears is safe, but it clears a tenth of
the lines, not a third.

**Verify, measured alongside (no bar):** the Briefer's 3–5 places cover
**27.7%** of the changed lines (24.1–32.2%) and hold **75%** of the spots
that mattered (162 of 215; 68–83%).

| | Share of lines | Share of what reviewers caught |
|---|---|---|
| Verify (the Briefer's places) | 28% | 75% |
| Also changed | about 62% | about 23% |
| Cleared (Triage v1) | 10% | 2% |

## What it means

- **Shrinking what people read works by ordering, not by skipping.** A
  quarter of a change holds three quarters of what reviewers catch, and
  Vera finds that quarter from the diff alone. That's the headline: read
  this first.
- **Little can be skipped outright.** Reviewers comment on test setup,
  mocks, exports and docs, not only on logic. Triage keeps to what really
  is safe (imports, generated code, tests that only follow the code,
  repeated edits), and that's about a tenth of a change. Pushing it
  further made it worse: v2 cleared less and missed three times as much
  on the tuning set (9%, 3 of 99), and was dropped.
- **Docs depend on the reader.** Every spot the rules and v1 wrongly
  cleared at first was a docs page that Grafana's docs reviewers
  commented on. Clearing docs for engineers only fixed it.
- **"Also changed" can't be skipped.** About a quarter of what reviewers
  caught sits there. It can wait until after Verify; it can't be dropped.

## Tuning (60 train pull requests)

| | Lines cleared | Misses | Verify: lines, spots |
|---|---|---|---|
| Rules | 7.1% | 9 of 99 | |
| Triage v1 | 14.1% | 1 of 99 | |
| Triage v2 | 8.9% | 3 of 99 | |
| Briefer v2 | | | 26.7%, 69 of 99 (70%) |

## Limits

- **"Mattered" is a reviewer comment the author acted on.** Comments
  that led nowhere, and bugs nobody caught, aren't counted.
- **Three large, active open-source repos.** Teams with fewer tests or
  docs reviewers may differ.
- **The Verify measure gives credit for a spot within 3 lines** of the
  Briefer's range, the same allowance as "changed afterwards".
- **v1's run on the unseen set offered the `test-setup` reason** that
  v2 added (its instructions didn't mention it; 15 of 819 skips used it).
  Without those 15, v1 clears 9.5% and still misses 5 of 215: the
  verdict is the same.
