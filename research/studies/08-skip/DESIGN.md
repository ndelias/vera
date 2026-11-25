# Study 08: can Vera tell reviewers what to skip?

Written 25 Nov 2026, before any data was pulled.

## Why

Vera's understanding questions didn't get answered. On Vera's own two
repos, 39 pull requests had questions since late October, and almost none
were answered. Reviewers won't type essays; they'll click Approve. So
Vera's core changes (Nahuel's call, 25 Nov 2026): **shrink what humans
read.** Each pull request gets split into what a person needs to look at
and what they can skip, with a reason for each skip.

That only works if reviewers can trust "skip". This study measures it on
real pull requests before any of it is built into the Action.

## The question

If a reviewer had read only what Vera said to look at, how much reading
would they have saved, and how much of what real reviewers caught would
they have missed?

## Data

- **Repos:** grafana/grafana, PostHog/posthog, getsentry/sentry (the
  Briefer's three, study 06).
- **Pull requests:** merged, opened by a person (not a bot), 2–40 changed
  files, at most 1,500 changed lines, and at least one **spot that
  mattered** (below).
- **Two sets, picked at random (seed 20261125):**
  - **Train:** merged 1 Jul – 30 Sep 2026, up to 20 per repo. Prompts are
    tuned on these only.
  - **Test:** merged 1 Oct – 15 Nov 2026, up to 35 per repo. Scored once
    per version of the agent; every version's score is kept.
- **Kept:** file paths, line numbers, the diff, and counts. No comment
  text and no reviewer names. The diffs stay in the local research
  database, which is never committed; only counts are published.

## What counts as a spot that mattered (Nahuel's call)

A reviewer's line comment where **the author changed that code afterwards
in the same pull request**:

- The comment is from someone other than the author, and not a bot.
- It's on the **first version reviewers commented on**: the commit of the
  earliest line comment from a reviewer. Comments made on later versions
  are left out, so every spot can be placed on the one diff Vera reads.
- "Changed afterwards": between that commit and the pull request's last
  commit, a change touches the commented lines or the 3 lines on either
  side.

## What Vera does

A new agent reads the diff of that first reviewed version (base to that
commit) and labels every block of changes (each `@@` hunk) **Look** or
**Skip**, with a reason for each Skip. It sees only the diff: no comments,
reviews, or later commits.

A spot that mattered falls in the hunk that holds its line (new side for
comments on added or kept lines, old side for comments on deleted lines).

## Measures

- **Reading saved:** changed lines in Skip hunks ÷ all changed lines,
  pooled over the test set.
- **Misses:** spots that mattered in Skip hunks ÷ all spots that mattered.
- 95% bootstrap intervals, resampling pull requests.

## Baseline: simple rules, no model

Skip a hunk when its file is a lockfile, a snapshot, generated (a
`generated` or `__generated__` folder, or a header saying it's generated),
minified, or documentation (`.md`, `.mdx`, `.txt`, `.rst`), or when the
hunk only changes whitespace or import lines.

## Bar (Nahuel's call, 25 Nov 2026)

Vera passes on the test set when all three hold:

1. **Misses at most 1 in 30** of the spots that mattered (3.3%).
2. **Skips at least a third** of the changed lines.
3. **Beats the rules:** skips more lines than the baseline, with misses
   no higher than the baseline's.

## Budget

About $5 on Nahuel's personal Anthropic key, through the Batch API
(Sonnet 5.5). Each run's estimate is shown before it starts.

## Changes after data came in

**25 Nov 2026, after Triage v1 on 20 Grafana train PRs: docs are scored as
Verify.** Every spot both the rules and Triage wrongly cleared was a
documentation page that Grafana's docs reviewers commented on. Nahuel's
call: what Vera clears depends on the reader. Docs and wording (reasons
`docs` and `copy`) are cleared for engineers only and stay Verify for docs,
product and design reviewers. The study can't tell which reviewer left a
comment, so it scores the strictest view: those two reasons don't count as
cleared. The rules baseline keeps its docs rule as written, and the bar is
unchanged. No test data had been pulled.
