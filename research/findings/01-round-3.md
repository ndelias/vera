# Round 3: designers and PMs

Round 3 added every question and answer from UX Stack Exchange (8,715
posts) and Project Management Stack Exchange (1,970) from the last five
years. I read 100 at random, 50 from each site. Nahuel hasn't reviewed
them yet.

## How much is about the problem

| Source | About a pain | Note |
|---|---|---|
| Project Management SE | 21 of 50 (42%) | Higher than Hacker News (36%) |
| UX Stack Exchange | 0 of 50 | Design-craft Q&A: which control, which pattern, which wording |

**UX Stack Exchange is the wrong source.** Designers ask it how to design
something, not about how their team works. It stays in the database, but
it can't tell us what designers' pains are. The designer's view has to
come from a community where people vent about work (r/UXDesign,
r/userexperience). That needs a registered Reddit app, which only Nahuel
can create.

## What PMs talk about

- **Approvals stall work.** Design approvals pass through several parties
  in a row (architecture, vendor, app owner, security), and each one adds
  days. "Risk of delay in tasks that require review or multiple
  approvals" came up as a question and in its answer.
- **Estimates get demanded, then turned into KPIs** (bug ratios, story
  points per developer, UAT estimates).
- **Unclear who decides what.** A PO directs the technical approach, a
  lead has responsibility without authority, or management styles clash.
- **Requirements change mid-sprint** (already coded as
  unclear-requirements).
- **Tools don't fit the process** (Asana boards, Jira setup, MS Project).

These became three new codes in **codebook v2**: approval-delays,
estimation-pressure and role-boundaries.

## The Blast Radius candidate

**Non-engineers waiting on engineering for small changes came up 0 times
in 50 PM posts.** Two posts are next to it:

- A question about limiting developers' access to parts of the code. The
  answer argues that limiting access slows teams down, because every
  boundary needs documenting and integrating. That's an argument against
  scoped permissions, from the opposite direction.
- "Citizen development" (non-developers building software with low-code
  tools). The answer dismisses it as configuration, not development.

Across 400 posts read so far, the specific Blast Radius pain has appeared
once. The evidence keeps pointing away from it as the main pain. The
designer and marketer view is still missing, though: UX Stack Exchange
turned out to be off-topic, and no marketing source has been added yet.

## New hypothesis

**H6:** waiting on reviews and approvals is a pain shared across roles.
Engineers describe it as code review overload, PMs as approval chains.
Together it would be the largest group of relevant posts. If that holds,
the strongest opportunity is around review and approval flow, not around
who's allowed to open a PR.
