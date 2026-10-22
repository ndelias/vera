# Study 05 (M1): evals and the rules baseline

Before any agent exists, measure how well plain rules do at the jobs the
agents will do, on real history, so M2 has a number to beat. No model is
used anywhere in this study. Written and committed before the new data is
pulled or any baseline is scored.

## Data

- **The Stage 3 sample:** 6,000 random merged, non-bot MRs on GitLab's
  product repo (gitlab-org/gitlab), created 19 Oct 2025 to 19 Oct 2026, with
  their AI-disclosure marker (study 04). Already pulled: labels, reviewer
  roles (from GitLab's public team data), times, comment counts.
- **New, per MR:** its changed files from the public diffs API: path, lines
  added and deleted, and whether GitLab marks the file as generated. Paths
  only; the diff text is never stored.
- **New, for fix-ups (product MRs only):** the commits that touched the same
  files on the default branch in the 7 days after the merge, and the MRs
  those commits came from (title, labels, merge time).
- **Split by time, not at random:** train = created before 19 Apr 2026,
  test = from 19 Apr 2026. Baselines learn from train only and every score
  is on test, so nothing is learned from a change made after the one being
  predicted.

Public API, no token. Everything goes into `research/data/research.sqlite`
(gitignored, rebuilt by the scripts with a fixed seed). The site gets only
scores and counts, under the existing rule: no MR titles or URLs.

## The three evals

### 1. Mapping: which part of the product a change touches

**Gold:** the MR's `group::` label, the GitLab team that owns the area
(about 80% of MRs have exactly one). MRs without one are left out of this
eval. Also reported at a coarser level: the `devops::` stage label.

**Scored:** top-1 accuracy, and recall@3 (the gold group is among the
three predicted). The M2 Mapper must reach recall ≥ 80% (BUILD-PLAN) and
beat the best baseline.

### 2. Routing: which non-engineering roles review it

**Gold:** whether anyone from design, product or marketing was a reviewer
(team data roles, as in study 02). These are people, not bots, so they
are a real record of who was pulled in. Engineering is left out: nearly
every MR has an engineer.

Not used as gold: the `frontend`, `backend`, `database` and `documentation`
labels. A bot applies them from file paths, so a path rule would score
near 100% by copying the bot, which says nothing.

**Scored, per role:** precision, recall and F1, with 95% Wilson intervals.
A role with fewer than 30 positives in test is reported as too rare to
score. The M2 target is ≥ 80% precision and recall.

### 3. Fix-ups: did the change need fixing within 7 days

**Label:** a merged MR is *fixed up* if, within 7 days of its merge,
another merged MR either reverts it (titled `Revert "<its title>"`) or
touches at least one of the same non-generated files and is a fix (title
starts with or contains "fix"/"fixes"/"fixed"/"revert", or it has the
`type::bug` label). Lockfiles, `locale/gitlab.pot`, `db/structure.sql`,
`db/schema_migrations/*` and files GitLab marks as generated don't count
as shared files: everyone touches them. MRs changing more than 30
non-generated files are left out (too many files to query, and a match
means little).

**Is the label reliable?** Before any rate is reported, 50 labelled
positives and 50 negatives (fixed seed) are read side by side (titles, the
shared files, the fix MR) and judged: does the second MR fix the first?
The label is used only if ≥ 80% of positives are real fix-ups and ≥ 90%
of negatives have no fix-up. If not, that is the result, and this eval
falls back to review comments per 100 lines changed, as BUILD-PLAN says.
The judgments and their counts are committed.

**Scored:** the fix-up rate overall and for AI-disclosed vs not, with
bootstrap intervals; and how well each signal ranks MRs by fix-up risk
(ROC AUC on test): lines changed (the "diff size alone" bar from
BUILD-PLAN), files changed, and AI disclosure. In M2, Vera's likely-AI
signals must beat diff size, or they stay out of routing.

## The baselines (rules, no model)

- **B0, majority:** always the most common answer in train (the most
  common group; never route to a role). The floor.
- **B1, path lookup:** learned from train. For each changed file, the
  deepest directory seen in train MRs, and the share of those MRs that had
  each group or each role. Votes are summed over the MR's files, weighted
  by lines changed. Mapping predicts the top groups; routing predicts a
  role when its score passes a threshold picked on train (best F1) before
  test is touched.
- **B2, hand rules:** what a team would write in `.vera.yml` on day one,
  written now, before the data:
  - design: any `.vue`, `.scss` or `.haml` file, or anything under
    `app/assets/`, `app/views/` or `app/components/`
  - product: any new file under `config/feature_flags/` or `ee/config/feature_flags/`, or
    any change under `config/metrics/`
  - marketing: any change under `doc/` that isn't `doc/api/graphql/reference/`

  Mapping has no hand-rule baseline: no one would hand-write a map of 80
  groups. (CODEOWNERS was considered: it names engineering teams, not
  groups or roles, and the path lookup learns the same thing from history.)

## Outputs

- Tables: `ev_mrs` (one row per MR: split, gold labels, size, AI marker),
  `ev_files` (paths), `ev_fixups` (each fix-up pair), `ev_predictions`
  (system, task, MR, prediction). Baselines write predictions there, and
  the M2 agents will write theirs to the same table, so one scorer scores
  both.
- `research/findings/09-evals.md`: the scores, the label check, and what
  the agents have to beat.
- The site gets an Evals page with the scores, built from the snapshot.
