# Study 02 results: how long work waits at GitLab

105,397 merge requests (MRs) from 19 Oct 2024 to 19 Oct 2026, in GitLab's
handbook and product repo. 2,400 sampled for approval times (up to 200 per
author role per project). Each test exactly as written in
`hypotheses-r5.json` before pulling. The changes to the design (marketing
site dropped, first review measured as first approval) are in
`studies/02-gitlab-flow/DESIGN.md`.

## G1: waiting for approval is a big part of the time. **Supported.**

| Project | To first approval | To merge (same MRs) | Share |
|---|---|---|---|
| Handbook | 20.4 h | 29.0 h | 70% |
| Product | 23.1 h | 62.8 h | 37% |

The test compares against all merged MRs (handbook share 128%, product 41%).
That's skewed in the handbook, because a third of its MRs merge with no
approval at all, and those are the fast ones. On the same MRs, approval
waiting is 70% of the handbook's time to merge and 37% of the product's.
Both are far above the 10% that would have disproved it.

## G2: non-engineers' small changes wait longer. **Disproved.**

Handbook, small merged MRs (3 files or fewer), median time to first approval:

| Author | Median | MRs |
|---|---|---|
| Design | 6.3 h | 143 |
| Other (sales, support, people…) | 11.5 h | 112 |
| Product | 18.5 h | 129 |
| Engineering | 22.0 h | 142 |
| Marketing | 23.8 h | 69 |

Non-engineers together: **13.1 h vs 22.0 h for engineers, 0.59x (95%
interval 0.33x to 0.93x).** Non-engineers' small changes are approved
faster, not slower. At GitLab, the Blast Radius claim doesn't hold.

Caveat: GitLab is unusually built for this. It's handbook-first, and
everyone is expected to edit by MR, so it's the best case for non-engineers.
A company where non-engineers can't open MRs at all wouldn't show up in
this data. Still, together with the forum data (non-engineers waiting on
engineering came up once in 400 posts), the evidence keeps pointing away
from Blast Radius as the main pain.

## G3: changes reviewed by more than one role take longer. **Supported.**

Product repo, merged MRs with reviewers, median time to merge:

| Reviewers | Median | MRs |
|---|---|---|
| One role | 74.4 h (3.1 days) | 56,073 |
| Two or more roles | 126.3 h (5.3 days) | 6,490 |

**1.70x (95% interval 1.63x to 1.78x).**

### Exploratory: is that just bigger changes? (not part of the test)

In the sample, where file counts are known:

| Size | One role | Two or more roles | Ratio |
|---|---|---|---|
| 1–3 files | 30.5 h (n=499) | 79.9 h (n=152) | **2.62x** |
| 4–10 files | 117.1 h (n=186) | 135.3 h (n=46) | 1.16x |
| 11+ files | 137.4 h (n=99) | 215.0 h (n=32) | 1.56x |

The gap isn't only size. It's **largest for small changes**. A small
change that needs sign-off from more than one role (say, engineering and
UX) takes 2.6x as long as one reviewed within a single role. The groups
are small and this is a correlation, so it's a lead, not a finding.

## What this means

- **Waiting for approval is real and large** (G1). That supports H6 and
  the review-and-approval candidate with behavior, not just posts.
- **Who opens the change isn't the bottleneck** (G2). What slows work is
  how many kinds of people have to sign off (G3), and that hurts small
  changes most.
- The candidates point the same way: the problem isn't access to code,
  it's the path a change takes through review and approval, especially
  across roles.

## Correction (22 Oct 2026)

The "marketing" role includes GitLab's technical writers, who are most of
its reviewers on product MRs. Cross-role reviews here are often
engineering plus docs. See `09-evals.md`.
