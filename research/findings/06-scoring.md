# Stage 2: scoring the pains

Rubric and weights committed before scoring (`studies/03-scoring/rubric.md`).
Frequency comes from the coded sample. Cost, buyer, gap and agent fit are
judgments, each with a written reason in `scores.json`. The gap scores rest
on two market scans with sources (`competitors-a.md`, `competitors-b.md`).

## The ranking (maximum 60)

| # | Pain | Score | F ×3 | C ×3 | B ×2 | G ×2 | A ×2 | Top 3 under nudging |
|---|---|---|---|---|---|---|---|---|
| 1 | AI-written code needs cleaning up | **53** | 5 | 4 | 5 | 3 | 5 | 98% |
| 2 | Code review is overloaded | **53** | 4 | 5 | 5 | 3 | 5 | 98% |
| 3 | Supervising agents is hard | **45** | 3 | 4 | 4 | 3 | 5 | 41% |
| 4 | Knowledge lives in people's heads | 45 | 3 | 4 | 5 | 3 | 4 | 33% |
| 5 | Nobody understands the code | 42 | 2 | 4 | 4 | 4 | 4 | 16% |
| 6 | Approvals and sign-offs stall work | 42 | 1 | 5 | 3 | 4 | 5 | 3% |
| 7 | Vague or changing requirements | 40 | 2 | 4 | 4 | 4 | 3 | 7% |
| 8 | AI tools lack the team's context | 39 | 2 | 3 | 4 | 3 | 5 | 2% |
| 9 | Tech debt never gets prioritised | 38 | 3 | 3 | 4 | 4 | 2 | 2% |
| 10 | Interruptions and context switching | 36 | 3 | 3 | 3 | 4 | 2 | 0% |
| 11 | Too many tools | 35 | 2 | 3 | 3 | 4 | 3 | 0% |
| 12 | Non-engineers depend on engineering | 31 | 1 | 2 | 4 | 3 | 4 | 0% |

**Top 3 under nudging:** every judged score was moved by −1, 0 or +1 at
random, 10,000 times. The column shows how often each pain still landed in
the top 3. It measures how much the result depends on my judgment calls.

## What it says

- **The top two are solid.** AI-written code needing cleanup and overloaded
  review stay in the top 3 in 98% of nudged runs. No reasonable
  disagreement over the judged scores changes them.
- **Third place is a judgment call.** Supervising agents and
  knowledge-in-heads tie at 45. The tie-break (first-hand frequency, 11.6%
  vs 4.0%) picks supervising agents, but it holds in only 41% of nudged
  runs. Comprehension is close behind.
- **The top pains sit in a crowded market.** Both score only 3 on gap,
  because AI review bots are close to commoditized. What the scans found
  unsolved is the core underneath:
  - nothing stops slop being produced or does the rework
  - nothing raises how much **human** reviewers can get through
  - nothing checks a person **understood** a change before it merged
    (comprehension, gap 4)
  - nothing coordinates **sign-off across roles** (approvals, gap 4, cost
    5, the pain G3 measured)
- **Blast Radius's original pain comes last** (31/60).

## Going into Stage 3

Top 3: AI-written code needs cleaning up, code review is overloaded,
supervising agents is hard. All three sit in the cluster of pains around
changes made by AI. The deep dive should study them as one problem space,
**getting AI-made changes to merge safely**, with comprehension and
cross-role approval as the unsolved parts where a product could stand out
from the review bots.

## Limits

- The judged scores are mine. The nudging test shows how much that matters:
  barely for the top two, a lot for third place.
- Competitor pricing and features changed often in 2026, and some come from
  third-party trackers (flagged in the scans).
