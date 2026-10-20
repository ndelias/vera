# The coded sample: which pains are biggest

2,000 random posts (1,200 HN, 500 PM SE, 300 UX SE) coded with codebook v4
by Claude Code helper agents, per `studies/01-discovery/sample-plan.md`
(committed before coding). All 730 evidence quotes verified in their posts.
Shares are weighted by each source's share of the corpus.

- **572 relevant posts** (222 first-hand). That puts an estimated **~9,800
  relevant posts (27%)** in the 36,769-post corpus.

## The ranking

Share of relevant posts, with a 95% bootstrap interval:

| Pain | All relevant | First-hand |
|---|---|---|
| **AI-written code needs cleaning up** | **17.7%** [14.0, 21.1] | **23.8%** [17.8, 30.1] |
| **Code review is overloaded** | **12.4%** [9.6, 15.3] | **13.2%** [8.7, 18.3] |
| Supervising agents is hard | 7.7% [5.5, 10.4] | 11.6% [7.2, 16.5] |
| Tech debt never gets prioritised | 7.6% [5.2, 10.1] | 4.9% [2.1, 8.0] |
| Knowledge lives in people's heads | 6.4% [4.3, 8.6] | 4.0% [1.6, 6.9] |
| Interruptions and context switching | 6.3% [4.2, 8.6] | 9.0% [5.2, 13.2] |
| Too many tools | 5.8% [3.9, 8.0] | 8.1% [4.7, 12.1] |
| Vague or changing requirements | 5.6% [3.7, 7.8] | 6.2% [3.2, 9.7] |
| Nobody understands the code | 4.4% [2.7, 6.5] | 5.8% [2.7, 9.3] |
| AI tools lack the team's context | 4.0% [2.2, 5.9] | 6.9% [3.6, 10.6] |
| Approvals stall work | 1.2% [0.3, 2.3] | 2.6% [0.6, 5.3] |
| Non-engineers depend on engineering | 0.7% [0.0, 1.5] | 1.6% [0.0, 3.7] |

**Exploratory (not part of the plan):** six of these belong together. They're
the pains around changes made by AI: cleanup, review load, supervising
agents, comprehension, missing context, and the bottleneck moving. Together
they're in **38.5% of relevant posts [33.9, 42.8] and 46.0% of first-hand
posts [39.2, 53.3]**. No other pain comes close.

## The hypotheses

| | Result | What it says |
|---|---|---|
| H1 | **Supported** | After-code pains outnumber while-writing pains ~2.2 to 1 (both levels) |
| H2 | **Disproved** (by the rule) | Review/bottleneck share rises (slope +1.5 pts per quarter, last quarter 31%), but the 95% interval includes 0 ([-0.2, +3.1]). Rising, but not clearly enough to call. |
| H3 | **Supported** | Non-engineers depending on engineering ranks **last of 25** (15th within PM SE) |
| H4 | Untestable | No "wrong edit" code in this codebook |
| H6 | **Disproved** | Approval delays are rare in posts (1.2%, and 1.4% of PM SE). The largest pair is AI cleanup + review overload. |
| H7 | Inconclusive | Only 5 posts coded non-engineers building, under the 20 needed |

## What this means for the product

1. **The strongest pain is reviewing and trusting changes made by AI.** It
   covers bloated or wrong AI code, overloaded review, supervising agents,
   understanding code nobody wrote by hand, and agents that lack the team's
   context. It's the largest group whether counting discussions or
   first-hand accounts.
2. **Blast Radius as first imagined is out.** Two independent measures say
   the same thing: non-engineers waiting on engineering ranks last in posts
   (H3), and their changes aren't slower in GitLab's data (G2).
3. **Approval chains slow work but people don't talk about them.** GitLab's
   data shows work reviewed by several roles takes 1.7x longer (G3), yet
   approvals are 1–3% of posts. It's a real cost people don't name, which
   makes it a feature inside the product, not the headline.

## Limits

- All coders are Claude. Nahuel's blind 10% check is still due.
- Forums over-represent people who post. GitLab's behavioral data offsets
  part of that.
- The sample is 2,000 of 36,769 posts. Intervals are shown so small gaps
  aren't read as real ones.
