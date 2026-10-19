# Open coding, round 2

300 posts from the corpus, 30 per stage, fixed seed
(`studies/01-discovery/open-coding-sample.json`). Read by Claude. Nahuel
hasn't reviewed it yet.

## How much of the corpus is about the problem

About **36%** of the sample (≈108 of 300) is relevant: someone describing a
problem with building or running a product as a team. The rest is job
posts, launches, the terms used in a technical sense, or other topics.

| Stage | Relevant (of 30) | Note |
|---|---|---|
| qa | ~19 | "QA team", "flaky tests" are mostly about the problem |
| review | ~13 | "code review" also appears in AI model discussions |
| coordination | ~12 | Jira mentions are often in passing |
| design | ~11 | "design system" brings in many job and launch posts |
| plan | ~11 | "tech debt" is often a passing remark |
| docs | ~11 | "tribal knowledge" also appears in non-software contexts |
| spec | ~11 | |
| build | ~10 | "context switching" often means the OS kind |
| release | ~7 | "release cycle" usually means product launches |
| feedback | ~3 | **"feedback loop" is almost all noise** (ML, economics, politics) |

If that rate holds, the 25,119-post corpus has roughly 9,000 relevant
posts. That's enough to code in full. Coding only relevant posts means
running a relevance pass first, which is cheap.

**Fix for round 3:** replace "feedback loop" with terms specific to
customer feedback.

## What stood out

1. **The bottleneck has moved.** The theme that comes up most across stages
   is that writing code got faster and the pain moved to review, QA, CI,
   design and product. Reviewers are overloaded, QA can't keep up, and PMs
   can't keep up with what engineers ship. This is very recent (2025–26).
2. **AI-written code makes rework.** Many posts describe AI output that's
   bloated or wrong and has to be cleaned up during review.
3. **AI tools lack the team's context.** Conventions, docs and decisions
   have to be repeated for every agent session, or the output gets fixed
   afterwards.
4. **Non-engineers depending on engineering came up once in 300.** This is
   the Blast Radius candidate. It's a warning sign, but see the source bias
   below.
5. **Small changes with unexpected effects** come up several times (configs,
   brittle tests breaking on minor UI changes, changes reaching other
   services). They line up with Blast Radius's "trust" claim, but from the
   engineer's side.

## Source bias

Hacker News is mostly engineers. PMs, designers and marketers are a small
minority. Any finding about non-engineers' pains (H3 especially) can't be
settled with HN alone. Round 3 needs sources where those roles write:

- UX Stack Exchange and Project Management Stack Exchange (public API, free)
- Reddit: r/ProductManagement, r/UXDesign, r/userexperience (needs a
  registered Reddit app)

## Outputs

- `studies/01-discovery/codebook-v1.json`: 21 codes (20 + other), each
  with a definition and examples from the sample
- `studies/01-discovery/hypotheses-r2.json`: H1–H5, each with what would
  disprove it
