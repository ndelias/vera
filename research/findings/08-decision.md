# Stage 4: the decision

**Draft for Nahuel's review.** Every claim links to a committed finding. Where
the evidence is thin, it says so.

## The problem

> **As AI writes more of the code, reviewers approve changes they no longer
> fully understand, and changes that need sign-off from several roles wait
> twice as long.**

| Claim | Evidence | Source |
|---|---|---|
| AI-written changes are spreading fast | MRs disclosing AI help at GitLab: ~3% → 22% in one year (undercounted) | 07 |
| Reviewers read twice the code in the same time | Median lines per MR 37 → 76, total code per quarter 1.95x, time to merge flat | 07 (R1, R6) |
| Attention per line has dropped | Review comments per line down ~40% (exploratory) | 07 |
| It's the pain people talk about most | Changes made by AI (cleanup, review load, supervision, comprehension, missing context) make up 38.5% of relevant posts, 46% of first-hand ones. No other group comes close | 05 |
| AI changes need more back-and-forth | +24–28% review comments on small and large AI-disclosed MRs (weak) | 07 (R3) |
| Waiting happens where roles meet | Small changes reviewed by 2+ roles wait 2.2x longer (replicated; 1.7x across all sizes) | 03 (G3), 07 (R5) |
| Approval waiting is a big share of the time | First approval takes 37–70% of time to merge | 03 (G1) |
| Nobody verifies understanding or coordinates sign-off | Teardown of 10 nearest products: understanding checks don't exist commercially; cross-role sign-off is partial at best | 07, teardown |

### What the evidence ruled out
- **Blast Radius as first imagined** (non-engineers waiting on engineering to
  ship small changes). It ranks last of 25 pains (05, H3), and at GitLab
  non-engineers' changes are approved *faster* (03, G2). The idea was
  dropped, and so was the name.
- **Another review bot.** First-pass review and auto-fix are commoditizing:
  CodeRabbit, Copilot, Greptile, Graphite/Bugbot (06, teardown).
- **An agent supervision dashboard.** It scored third (06), but that market
  is crowded with dashboards that launch and display agent work. It's
  folded in where it overlaps: knowing what an agent did.
- **Knowledge in people's heads.** It tied for third in scoring, but it's a
  separate market (Glean, Confluence) with a different buyer.

## The product

**Vera: review for the AI era.**

*Named by Nahuel, 2026-10-20. Vera is both the product and the agent you
talk to ("@vera, who still needs to sign off?"). From "verify", and Latin
"vera", true. "Blast Radius" was the working name for the original idea.*

An agentic review layer for teams shipping AI-written code. It sits on top
of the review bots the team already uses (it reads their findings) and
answers three questions for every change:

1. **What does this touch?** Features, UI surfaces, data, permissions,
   public APIs, and how risky each one is.
2. **Did the reviewer understand it?** The parts that need human judgment,
   and a short check that they were understood.
3. **Who has to sign off, and has everyone?** Engineering, design, security
   and product, coordinated in parallel with one approval record.

### How it works on one change

1. **Map.** When an MR or PR opens, Vera maps what it touches and
   its risk, combining the diff, the codebase, ownership, the team's
   conventions, and any review-bot findings. It notes whether AI wrote it.
2. **Brief.** Each required reviewer gets a brief written for their role:
   the 3–5 places that need human judgment, ordered by risk. Engineers get
   code paths, designers get the UI preview, security gets the data flow,
   product gets the change in behavior.
3. **Check understanding.** On risky changes, the reviewer answers 1–3 short
   questions generated from the change, or explains it in their own words.
   An agent grades the answer against the change. The author can be asked
   the same about an agent's design choices. By default it records rather
   than blocks: the approval shows whether understanding was shown. Teams
   can make it a gate.
4. **Coordinate sign-off.** Team rules decide which roles must sign off. For
   example, UI paths need design, auth paths need security, and behavior
   changes need product. Vera asks them in parallel, not one after
   another, gives each what they need, chases in Slack, and keeps one
   approval record across roles. This targets the measured 2.2x wait.
5. **Record.** Who approved what, with what evidence of understanding.
   Auditable.

### What it deliberately doesn't do
- **No style or bug comments.** The review bots do that. Vera uses
  their findings.
- **No auto-fixing code.** Already crowded (teardown, gap 4).
- **Never approves on its own.** Agents propose; people decide.
- **Doesn't let anyone merge around engineering.** Engineering sign-off
  stays required. This avoids the governance gap Slack Code opened
  (teardown).
- **No individual performance scores.** Understanding checks show up on an
  approval, never in rankings of people. Team-level numbers only.
- **Doesn't replace CODEOWNERS.** It reads it, and adds the roles beyond
  engineering.

## Who has it, who pays

- **Who feels it:** reviewers on teams where AI writes a growing share of the
  code. Mostly senior engineers, then the designers, security and product
  people asked to sign off.
- **Who owns it:** engineering managers and heads of engineering. They answer
  for quality and delivery.
- **Who pays:** the head or VP of engineering. The budget line already
  exists: teams pay $20–72 per user per month for review tools (scans A and
  B). Vera would sit in that line as the layer above the bots.
- **Best first customers:** teams of 10–200 engineers that adopted coding
  agents, have design or security reviewers, and ship UI. Cross-role
  sign-off hurts them most.

## Why agents, and which parts aren't

| Step | Agent? | Why |
|---|---|---|
| Map what a change touches | **Agent** | Multi-step reading across diff, codebase, ownership and bot findings; needs judgment about risk |
| Write role-specific briefs | **Agent** | Judgment about what each role needs; output checked by the reader |
| Generate and grade understanding checks | **Agent** | Has to be tailored to each change; grading needs judgment; graded answers are visible and contestable |
| Coordinate sign-off (ask, chase, summarize) | **Agent** | Works across GitHub/GitLab and Slack, follows up over time |
| Decide who **must** sign off | **Not an agent: rules** | Access and gating must be predictable. Team rules evaluated as code; agents can only suggest a rule |
| The merge gate | **Not an agent: a status check** | Deterministic, auditable, can't be talked out of it |
| The approval record | **Not an agent: a log** | Append-only and the same every time |

**Shape:** one coordinator per change, with four specialist agents: Mapper,
Briefer, Examiner and Sign-off. Each runs on skills and tools:
- **Skills:** codebase map, ownership, team conventions, the design system,
  sensitive paths.
- **Tools:** GitHub/GitLab, Slack, CI status, preview deployments, Figma,
  review-bot findings.

## How success is measured

**Before building on real users: offline evals.**

- **Routing.** Predicted reviewer roles vs the actual reviewer roles on
  thousands of historical GitLab MRs (already in the database). Bar:
  precision and recall ≥ 80%.
- **Mapping.** Touched surfaces vs GitLab's own labels (UX, security,
  database…) on historical MRs. Bar: recall ≥ 80% for the labeled areas.
- **Understanding checks.** Questions rated by people for being answerable
  from the change and actually telling apart someone who read it from
  someone who didn't. Grader agreement with human graders ≥ 80%, the same
  bar as the coding pilot.

**In the pilot** (Nahuel's portfolio repo plus a demo company repo with real
roles):
- Time until every sign-off is in, for small cross-role changes. Target:
  halve the 2.2x gap.
- Reviewer minutes per 100 lines changed.
- Share of approvals with understanding shown.
- Fix-ups and reverts within 7 days. Must not get worse.

**What would kill it:**
- Reviewers skip or game the checks (opt-out above 30% after two weeks).
- Routing can't reach 70% on historical data.
- Teams see it as surveillance.

## Risks
- **Quiz fatigue becomes its own theater.** Checks only run on risky parts,
  at most 3 questions, and explaining in your own words counts.
- **Platform risk.** GitHub, Cursor/Graphite or Slack could add this. The
  bets are that cross-role sign-off and understanding are outside their
  focus, and that sitting on top of all of them is the position.
- **Evidence limits.** One company's behavioral data (GitLab), forum coding
  by Claude, and Nahuel's 10% check still due. Pricing and features in the
  scans change fast.

## Open questions for Nahuel
1. ~~Is "record by default, gate if the team wants" the right stance on
   understanding checks?~~ **Decided (Nahuel, 2026-10-20): yes.** Record by
   default, gate optional.
2. ~~Pilot surfaces: GitHub first (portfolio repo) or GitLab (where the
   evidence came from)?~~ **Decided (Nahuel, 2026-10-20): GitHub first.**
   Offline evals still run on the historical GitLab data, since the core
   logic doesn't depend on the platform. The pilot runs on GitHub, starting
   with the portfolio repo.
3. ~~The portfolio tagline changes from "Lets non-engineers ship code
   safely…" to something about understanding and sign-off.~~ **Decided
   (Nahuel, 2026-10-20): the product is renamed Vera, with the tagline
   "Review for the AI era."**
