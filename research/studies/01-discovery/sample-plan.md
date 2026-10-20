# The coded sample and how H1–H7 are tested on it

Written and committed before any sample post is coded.

## Sample

2,000 corpus posts, random with a fixed seed, excluding the 480 already
coded in the pilot. Drawn per source:

| Source | Posts | Why |
|---|---|---|
| Hacker News (rounds 1, 2, 6) | 1,200 | The main corpus, mostly engineers |
| Project Management SE | 500 | The PM voice; 42% relevant in open coding |
| UX Stack Exchange | 300 | Mostly off-topic (0 of 50 relevant), kept so the result is measured, not assumed |

Overall figures weight each source by its share of the corpus. Figures by
source are reported as they are. Coded once with codebook v4 by Claude Code
helper agents (80 posts per agent). The pilot showed two passes agree at
kappa 0.93.

## How each hypothesis is tested

"Relevant" means relevance 1 or 2. Each test is run on all relevant posts,
and again on first-hand posts only (relevance 2). If the two disagree, the
test is reported as inconclusive.

- **H1:** count relevant posts with at least one after-code-is-written code
  (review-overload, test-ci-friction, qa-capacity, ai-output-quality,
  bottleneck-shift, code-comprehension) and those with at least one
  while-writing code (unclear-requirements, design-drift, interruptions,
  late-alignment). Disproved if after-code ≤ while-writing.
- **H2:** share of relevant HN posts coded review-overload or
  bottleneck-shift per quarter, Q4 2024 to Q3 2026. Disproved if the slope
  of a least-squares line is ≤ 0, or its 95% bootstrap interval includes 0.
- **H3:** eng-dependency's rank among the 25 codes (excluding other), by
  number of relevant posts. Disproved if it ranks in the top 8. Reported
  separately for PM SE.
- **H4:** can't be tested with this codebook. It has no "wrong edit" code to
  compare change-impact against. Stays open, marked untestable here.
- **H5:** belongs to Stage 2 scoring, not coding. Not tested here.
- **H6:** the number of relevant posts coded review-overload or
  approval-delays, compared with every other pair of codes (posts with
  either one). Disproved if any other pair is larger, or if approval-delays
  is under 5% of relevant PM SE posts.
- **H7:** among relevant posts coded non-eng-building, the share also coded
  review-overload, ai-output-quality, change-impact or code-comprehension.
  Disproved if under 25%. If fewer than 20 posts are coded non-eng-building,
  it's inconclusive.
