# Study 07: do coding agents' pull requests pile up?

A lead from one conversation (23 Oct 2026): a team using Devin to open pull
requests on its own has hundreds it hasn't checked or merged; they can't
merge them blindly, and many are now out of date with the code. One story
isn't data. This measures whether it's common on public GitHub. Written
and committed before any data is pulled.

## Data

- **Agents with their own GitHub account,** so their PRs can be found by
  author: Devin (`devin-ai-integration[bot]`), GitHub's Copilot coding
  agent (`copilot-swe-agent[bot]`), Cursor (`cursor[bot]`), Jules
  (`google-labs-jules[bot]`) and Claude (`claude[bot]`). Agents that open
  PRs under a person's account can't be told apart and are left out.
- **Window:** PRs opened 23 Apr to 23 Aug 2026, so every one has had at
  least two months to be merged or closed.
- **Sample:** for each agent, up to 400 PRs drawn evenly across the
  window's days (GitHub's search returns at most 1,000 results per query,
  so it's queried day by day; fixed seed). State is read now: merged,
  closed without merging, or still open.
- **Repos:** each sampled PR's repository, with its stars and last push.
  **Active repos** have 10+ stars and a push in the last 30 days, so
  abandoned experiments and toy repos don't drive the result. Results are
  reported for all repos and for active repos.
- **Out of date:** for up to 300 still-open PRs (fixed seed), whether
  GitHub says they can still merge cleanly, and how many commits the base
  branch has moved since.

Public data, read-only, through the GitHub API with Nahuel's own account.
Only counts and repository-level figures are published; no PR titles,
authors or code.

## Hypotheses

**D1. Agent PRs often go nowhere.** Share of sampled agent PRs still open
two months on, in active repos. Supported if ≥ 20%; disproved if < 10%;
in between, inconclusive.

**D2. Some teams hold a backlog.** Number of active repos with 20 or more
agent PRs open for over 30 days (counted from GitHub's search, per agent
and repo). Supported if ≥ 50 repos; disproved if < 10.

**D3. The backlog goes stale.** Of the sampled open PRs in active repos,
share that can no longer merge cleanly (conflicts). Supported if ≥ 30%;
disproved if < 15%.

All shares come with 95% intervals. Merged and closed-without-merging
shares are reported for each agent, descriptively.

## Changes after the plan was committed

**23 Oct 2026, after sampling, before any analysis.** Slicing the window
by day gathered 423–492 PRs per agent (each day's share was rounded up),
so each agent was cut back to 400 at random (seed 20261024), as planned.

**23 Oct 2026, after the analysis.** D3's active-repo sample is 9 PRs: the
300 open PRs checked were drawn from all repos, and few were in active
ones. The rule gives "supported", but 9 is too few to rely on; it's
reported with that warning, beside the all-repo figure.
