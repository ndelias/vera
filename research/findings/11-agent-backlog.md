# Study 07: do coding agents' pull requests pile up?

Design committed before the data was pulled (`studies/07-agent-backlog/DESIGN.md`).
2,000 pull requests opened by five coding agents on public GitHub between
23 Apr and 23 Aug 2026 (400 each: Devin, GitHub's Copilot coding agent,
Cursor, Jules, Claude), read on 23 Oct 2026. 1,319 repos; 145 are
**active** (10+ stars, a push in the last 30 days). Numbers in
`11-agent-backlog.json`.

## Results

| | Result | |
|---|---|---|
| **D1** At least 20% of agent PRs still open two months on, active repos | **6%** (95% interval 4–9%). Across all repos: 26%, mostly abandoned or toy repos | **Disproved** |
| **D2** At least 50 active repos with 20+ agent PRs open over 30 days | **4** (a lower bound: only repos in the sample were checked). Two of them hold **611** and **307** | **Disproved** |
| **D3** At least 30% of open agent PRs in active repos can't merge cleanly | 6 of 9 (35–88%); the base branch is a median 68 commits ahead. Across all repos: 24% (19–29%) | Supported, on too few PRs to rely on |

In active repos, merged / closed without merging / still open: Claude
84% / 15% / 2%, Copilot 64% / 33% / 3%, Devin 50% / 39% / 11%, Cursor
43% / 45% / 13%, Jules 60% / 20% / 20% (15 PRs).

## What it means

- **The story is real, but concentrated.** In most active public repos,
  agent PRs get merged or closed. Backlogs exist in a few teams that use
  agents heavily, and there they are large: hundreds of stale PRs in one
  repo.
- **Open agent PRs go stale.** Where they're left open in active repos,
  the base branch moves on quickly. The sample is too small to say how
  often they no longer apply.
- **Public GitHub is a blind spot for this question.** Teams like the one
  that raised it work in private repos, and agents that open PRs under a
  person's account can't be counted.
- **For Vera:** a trend to watch, not a target customer. One person
  raised it, and the public data shows it in a few heavy users, not most
  teams. As agents open more PRs, especially in small teams or where many
  people push at once, backlogs like these may become more common.
