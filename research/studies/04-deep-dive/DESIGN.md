# Stage 3: getting AI-made changes to merge safely

The top three pains from Stage 2 (AI-written code needing cleanup, review
overload, supervising agents) are studied as one problem space, measured on
GitLab's product repo (gitlab-org/gitlab). Written and committed before the
new data is pulled or any of these comparisons is run.

## Data

- **All product MRs already pulled** (study 02, 19 Oct 2024 to 19 Oct 2026).
- **New: a random sample of 6,000 merged, non-bot product MRs** created 19 Oct
  2025 to 19 Oct 2026 (fixed seed). For each: its commits (messages only)
  and its detail record (files changed). The description is scanned for
  markers and then discarded. Only the result is stored: whether an AI
  marker was found and which kind.

## What counts as an AI-disclosed MR

The MR description or any commit message contains an explicit authorship
marker (case-insensitive):

- a `Co-authored-by:` or `Assisted-by:` trailer naming an AI tool (claude,
  anthropic, cursor, copilot, codex, openai, gpt, gemini, duo, devin, aider,
  windsurf, cline, amp, junie)
- "generated / written / created with or by", "assisted by", or "with the help
  of" followed by an AI tool name or "AI"
- the 🤖 marker used by agent-written commits and PRs

Mentions of AI products as the *topic* of a change (GitLab builds Duo) don't
count. Undisclosed AI use is common, so the comparison is **disclosed vs not
disclosed**. Any real difference is diluted toward zero, which makes it a
conservative test.

## Hypotheses

**R1. Review is getting slower.** Quarterly median time to merge for
merged, non-bot product MRs, Q4 2024 to Q3 2026. Disproved if the 95%
bootstrap interval of the least-squares slope includes 0 or is below it.

**R2. AI-disclosed MRs take longer to merge.** Median time to merge,
AI-disclosed ÷ not, within size buckets (1–3, 4–10, 11+ files changed).
Disproved if the ratio is ≤ 1.0 in at least two of the three buckets.
Inconclusive if fewer than 200 AI-disclosed MRs are in the sample.

**R3. AI-disclosed MRs need more back-and-forth.** Median number of review
comments, same buckets, same rule as R2.

**R4. AI-disclosed MRs get reverted more.** A merged MR counts as reverted if
any product MR titled `Revert "<its title>"` was created after it.
Disproved if the AI-disclosed revert rate is ≤ the rest. Inconclusive if
fewer than 10 reverts fall in the AI-disclosed group.

**R5. Small changes reviewed across roles wait much longer** (replicates the
exploratory 2.6x from study 02 on new data). In the new sample, MRs with 1–3
files: median time to merge, reviewers from 2+ roles ÷ 1 role. Supported if
≥ 1.5; disproved if < 1.25; in between it's inconclusive.

All ratios come with 95% bootstrap intervals (2,000 resamples, fixed seed).

## Added after the first results: R6, how much code there is to review

Proposed by Nahuel after R1 (time to merge flat, MR count +55%). Committed
before any code-size data was pulled.

**Data:** 250 random merged, non-bot product MRs per quarter, Q4 2024 to Q3
2026 (2,000 total, fixed seed). For each MR, lines added plus deleted across
its diff (public diffs API). Files GitLab marks as generated are left out.
Files too large to show are counted but have no line count.

**R6. The amount of code each MR asks reviewers to read has grown.**
Quarterly median lines changed per MR, Q4 2024 to Q3 2026. Supported if the
95% bootstrap interval of the least-squares slope is above 0. Disproved
otherwise.

Reported alongside it (descriptive, no verdict): estimated total lines
changed per quarter (MR count × mean lines per MR), and its change from the
first to the last quarter.
