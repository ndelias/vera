# Stage 3: getting AI-made changes merged safely

Design committed before the data was pulled (`studies/04-deep-dive/DESIGN.md`).
6,000 merged GitLab product MRs, sampled at random from Oct 2025 to Oct 2026.
616 of them (10.3%) disclose AI help in their commits or description, mostly
`Co-authored-by` trailers (424). Teardown of the ten closest products in
`studies/04-deep-dive/teardown.md`.

## Results

| | Result | The numbers |
|---|---|---|
| R1 Review is getting slower | **Disproved** | Quarterly median time to merge stayed flat at 67–80 h (slope −0.1 h/quarter, 95% interval −0.65 to +0.49) while MRs per quarter rose **55%** (6,934 to 10,766) |
| R2 AI-disclosed MRs take longer | **Disproved** | Ratios 0.95, 0.95 and 1.07 by size. AI-disclosed changes merge as fast as the rest |
| R3 AI-disclosed MRs need more back-and-forth | **Supported, weakly** | **+28%** review comments on small changes (1.28, interval 1.00–1.44) and **+24%** on large ones (1.24, interval 0.98–1.48). Mid-size is equal. The intervals touch 1.0 |
| R4 AI-disclosed MRs get reverted more | Inconclusive | 2 reverts in the AI group (0.32% vs 0.06%), under the 10 needed |
| R6 There's more code to review per MR (Nahuel's hypothesis, added after R1) | **Supported** | Median lines changed per MR doubled, **37 to 76** (slope +4.9 lines per quarter, 95% interval +2.6 to +8.6). Estimated total lines per quarter: **~1.05M to ~2.05M (1.95x)** |
| R5 Small cross-role changes wait much longer | **Supported, replicated** | 1–3 file changes reviewed by 2+ roles: **83 h vs 38 h, 2.2x (interval 1.63–2.91)**. That's new data, and it confirms study 02's exploratory 2.6x |

### Exploratory (not part of the plan)
- **Reviewers now read twice the code in the same time.** Time to merge is
  flat (R1) while total code per quarter nearly doubled (R6). Review
  comments per MR rose 27% (11 to 14) while lines per MR rose 105% (37 to
  76). Comments per line of code fell by about **40%** (0.30 to 0.18 per
  median MR). Each line now gets less human attention.
- **AI help is spreading fast.** The share of MRs disclosing AI help rose from
  ~3% (Oct 2025–Feb 2026) to **22% (Oct 2026)**. Disclosure undercounts use,
  so the real share is higher.
- **Review held up per MR, not per line.** Median comments per MR rose from
  11 to 14, and MRs merged with no human reviewer fell from 15% to 2%.
  Volume is up 55% and each MR gets more comments, so the review
  conversation roughly **doubled** while time to merge stayed flat. But the
  code doubled too (R6), so attention per line still fell. The extra load
  landed on reviewers, not on wait time.
  (Comment counts include bot comments, which can't be separated without a
  login.)

## Market (teardown)
- **Most open:** proof that a reviewer **understood** a change. Nothing on
  the market checks it. The only example is a one-commit open-source GitHub
  Action.
- **Close second:** **sign-off across roles.** Chromatic covers design only;
  Slack Code brings non-engineers in but has no approval model.
- **Crowded:** automated rework (every major player) and review routing and
  queues (Graphite, Aviator, gitStream).
- Independent demand evidence: a CMU/Stanford study (via Semgrep) found PR
  volume up 3.1x while reviewers grew 1.5x, and silent approvals doubled.
  Practitioners call approval without understanding "theater approval".

## What Stage 3 says, together with everything before

1. **The pain is real and growing.** Reviewing and trusting AI-made changes
   is the largest cluster of pains (38.5% of relevant posts, 46% first-hand),
   and AI-assisted changes went from 3% to 22% of GitLab's MRs in a year.
2. **It isn't a waiting-time problem in a well-run team. It's an attention
   problem.** GitLab keeps time to merge flat (R1) and AI changes aren't
   slower (R2). But reviewers now get through **twice the code in the same
   time** (R6), with about 40% fewer comments per line. That matches what
   posts describe: overloaded reviewers, cleanup, losing grip on the
   codebase. Speed held. Attention per line didn't.
3. **Waiting appears where roles meet.** Small changes that need sign-off
   from several roles wait 2.2x longer (R5, replicated). This is the
   clearest measured delay in the whole study, and people rarely name it in
   posts.
4. **The open space is understanding and sign-off, not more review
   comments.** Review bots and auto-fix are commoditizing. Nobody verifies
   understanding or coordinates cross-role approval.

## Limits
- One company, unusually mature and public. Teams without GitLab's process
  may feel this as delay rather than burden.
- AI disclosure is voluntary, so the AI vs not comparisons are diluted
  toward zero.
- Reverts are too rare in a 6,000 sample to judge quality.
- All forum coding is by Claude. Nahuel's 10% check is still due.

## Correction (22 Oct 2026)

The "marketing" role includes GitLab's technical writers, who are most of
its reviewers on product MRs. Cross-role reviews here are often
engineering plus docs. See `09-evals.md`.
