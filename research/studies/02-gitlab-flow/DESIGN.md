# Study 02: how work waits at GitLab, by role

The forum posts tell us what people say hurts. This study measures what
actually happens: how long changes wait for review and approval, by the
role of the person who made them. GitLab works in public, so its designers,
PMs, marketers and engineers all open and review merge requests (MRs) in
the open.

Designed and committed before any MR data was pulled (round 5 in the
database).

## Data

- **MRs created 19 Oct 2024 to 19 Oct 2026** in three public projects:
  - `gitlab-com/content-sites/handbook`: the company handbook. Every role edits it.
  - `gitlab-com/marketing/digital-experience/about-gitlab-com`: the marketing website.
  - `gitlab-org/gitlab`: the product. Mostly engineers write it, while
    designers, PMs and others review it.
- **For every MR:** author, reviewers, who merged it, labels, comment
  count, title, and when it was created, merged and closed. All from the
  public MR list API.
- **For a random sample** of merged MRs (up to 200 per project per author
  role, fixed seed): files changed, time to first comment from someone
  other than the author (not a bot), and who approved it.
- **Roles** come from GitLab's public team data (`data/team_members/person`
  in `gitlab-com/www-gitlab-com`). Each username maps to one of
  engineering, design, product, marketing or other, by job title and then
  division. Authors not on the current team page are `unknown`; bots are
  `bot`.

## Privacy

Usernames are stored only as salted hashes. The salt stays local and is
never committed. Nothing else from team files is kept: no names, bios,
locations or social links. Results are only ever shown by role, never by
person.

## Limitations

- The team page shows the current team only. People who left are
  `unknown`, and people who changed roles get their current one.
- GitLab is an unusually documentation-heavy, remote, all-public company.
  Its numbers describe one well-run company, not every product team.
- Time to merge includes time the author spent working, not only waiting.
  Time to first review is the cleaner measure of waiting.

## Hypotheses (see hypotheses-r5.json)

G1 to G3, each with what would disprove it, fixed before pulling.
