# Research plan

The data picks the product. The fixed constraints are: it's B2B, it's
agentic, and it's for **product teams** (PMs, designers, engineers,
marketers working together on a software product). Nothing else is decided.

Everything in this plan, including the scoring, gets written down before any
data is looked at. Git history shows the plan came first.

## Stage 1: Discovery (wide)

**Question:** where do product teams lose the most time, money or
confidence getting their work done?

No solution in mind. The output is a list of pains, each with evidence.

### Sources (all public)
- **Forums:** r/ProductManagement, r/webdev, r/ExperiencedDevs,
  r/userexperience, r/UXDesign, r/devops, Hacker News (Ask HN and comment
  threads). Pulled through official APIs where they exist, following each
  site's terms.
- **Survey microdata:** Stack Overflow Developer Survey (raw CSV, public),
  which covers time lost looking for answers, frustrations and workflows.
  Other public surveys where raw data or detailed tables are released.
- **Public company workflows:** GitLab (issues, MRs, handbook all public),
  PostHog, Cal.com, Sourcegraph. Their handbooks describe how work moves
  between roles. Their issue trackers show how long each step takes.

### Method
1. **Open coding:** read a random sample of ~300 forum posts by hand, and
   write down every distinct pain as a short label.
2. **Codebook:** merge the labels into ~15–25 pain categories, each with a
   one-line definition and an example.
3. **Code everything:** an LLM codes the full set (target ≥2,000 posts)
   with the codebook. I hand-code a random 10% and report how often we agree.
   Below 80% agreement, fix the codebook and recode.
4. **Back with numbers:** where a pain can be measured in survey or repo
   data (e.g. time between steps), measure it.

**Output:** `findings/01-pain-inventory.md`, the pain list with counts,
measured costs where available, and short quotes.

## Stage 2: Narrow

Score each pain from Stage 1, 1–5 on each criterion:

| Criterion | Question | Weight |
|---|---|---|
| Frequency | How often does it come up (share of posts, survey rates)? | 3 |
| Cost | How much time, money or risk does each occurrence cost? | 3 |
| Buyer | Is it a team or company problem with someone who has budget, not one person's annoyance? (B2B) | 2 |
| Gap | Is it still unsolved after a scan of existing tools? | 2 |
| Agent fit | Many steps, judgment calls, work across several tools, mistakes a review can catch? (agentic) | 2 |

Score = weighted sum. The weights are fixed now, before scoring.

The agent fit test is there to filter, not to find. A pain that scores high
everywhere except agent fit gets written up as such, not dropped quietly.

**Output:** `findings/02-ranking.md`, the scored table and the top 3.

## Stage 3: Deep dive on the top 3

For each of the top 3 pains:
- **Measure it properly:** design a study on public repo, issue or survey
  data that puts a number on the pain (e.g. median wait, how often it
  happens, cost per occurrence).
- **Write down what would disprove it:** the result that would mean the
  pain is smaller than Stage 1 suggested.
- **Competitor teardown:** who it's for, how it works, what it leaves unsolved.

**Output:** one `findings/03-<pain>.md` per pain.

## Stage 4: Choose and define

Pick one pain. Write:
- the problem statement, with the evidence behind it
- who has the problem and who pays
- what the product does, and what it deliberately doesn't do
- why agents (and which steps should *not* be agents)
- how success will be measured (the evals)

**Output:** `findings/04-decision.md`. Only then does product work start.

## Candidates we already have

Written down so they don't quietly steer discovery. Each gets scored in
Stage 2 like any other pain, and only if Stage 1 finds it.

- **Blast Radius:** non-engineers wait on engineering for small changes
  (copy, UI fixes) because engineers can't limit what they'd break. The idea
  is per-person scopes, an agent opening the PR, and review routed to the
  right engineer. If it reaches Stage 3, see the appendix.

- **Review and approval flow** (added 2026-10-19, after round 3, before any
  coding at scale): AI makes code ship much faster, which strains human
  review, AI review, consistency, and people understanding code they didn't
  write. A product that moves reviews and approvals along across roles. This
  is Nahuel's leaning, written down so the counts can confirm or reject it,
  not decide it.

## Appendix: Blast Radius studies (only if it reaches Stage 3)

1. **Wait time:** small text-only PRs (≤20 lines, copy, markup, style or
   content files) vs all PRs, time to first review and to merge. GitHub
   Archive on BigQuery, 12 months. Disproved if small PRs merge much faster.
2. **Non-engineer friction:** GitLab handbook MRs split by the author's
   department (from GitLab's public team page): time to merge, review
   rounds, share closed without merging. Disproved if non-engineers do as
   well as engineers.
3. **What goes wrong:** reverts and fix-ups within 72h of small PRs, sorted
   by cause (went out of scope, wrong edit, broke the build, visual
   regression). Disproved if most are wrong edits in the intended file.
