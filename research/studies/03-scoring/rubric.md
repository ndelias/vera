# Stage 2 scoring rubric

Written before any pain is scored. Weights come from PLAN.md (fixed at the
start): frequency 3, cost 3, buyer 2, gap 2, agent fit 2. Score =
weighted sum, maximum 60.

Every score cites its evidence. Frequency is computed from data. The other
four are judgments against the anchors below, each with a written reason,
so anyone can disagree with a specific score.

## What gets scored

The 12 pains in findings/05-sample.md, every code with at least 1% of
relevant posts, plus eng-dependency (Blast Radius's pain, scored for the
record).

## Anchors

**Frequency (×3).** Share of relevant posts in the coded sample (weighted
by source):
5 ≥ 15% · 4 10–15% · 3 6–10% · 2 3–6% · 1 < 3%

**Cost (×3).** What one occurrence costs:
5 multi-day delays or production, security or customer impact, shown in
data or repeated first-hand accounts · 4 hours to days of waiting or
rework, with evidence · 3 hours · 2 minutes, an annoyance · 1 negligible

**Buyer (×2).** Is there someone with budget who'd pay to fix it?
5 an existing budget line: teams already pay for tools in this category ·
4 a clear team-level owner (e.g. an engineering manager) and spend is
plausible · 3 a team problem with unclear ownership · 2 one person's
problem · 1 nobody would pay

**Gap (×2).** How well existing tools solve it (from the competitor scan):
5 nothing addresses it · 4 tools exist but miss the core of the problem
(documented limits or complaints) · 3 partial, fragmented solutions ·
2 well served by several tools · 1 solved or commoditized

**Agent fit (×2).** Is an agent the right shape of solution?
5 multi-step, across several tools, needs judgment, and a person can check
the output before it matters · 4 most of those, one weak · 3 an agent
helps but a simpler tool might do · 2 mostly needs a non-agent fix
(process, culture, UI) · 1 not automatable, or mistakes can't be undone

## Then

The top 3 by score go to Stage 3 (deep dive). Ties are broken by first-hand
frequency.
