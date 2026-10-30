# Vera

An agent that speeds up code review for teams shipping AI-written code.
Live at https://vera-agent.vercel.app. The research chose the problem,
not the other way round. "Blast Radius" was
the working name for the original idea, which the data ruled out.

Status: installable as a GitHub Action (v0.5.0), with understanding checks
for engineers. Questions for designers come next; the order from here is in
[`BUILD-PLAN.md`](BUILD-PLAN.md). The research
that chose the problem is in `research/findings/08-decision.md`.

- `research/PLAN.md`: the claims we're testing, the data sources, the methods
- `research/studies/`: one folder per study (scripts and notes)
- `research/data/`: processed datasets (raw downloads in `data/raw/` are gitignored)
- `research/findings/`: write-ups and charts, one per study
- `research/pipeline/`: collection, cleaning and coding scripts (Python, standard library only)
- `apps/panel/`: Vera's website (product, the case, the evidence), a static Next.js export built from a research snapshot
- `packages/core/`: Vera's core. So far: the trace format, cost per call, redaction, secrets

## Try it: `vera review`

Reviews one GitHub pull request: which areas it touches, whether it makes a
design decision, who should be asked, and where an engineer should look
first. Runs on your own Anthropic API key (about 2–4 cents a review on Claude
Sonnet 5.5, more on big PRs): the PR's title, file list and diff go to
Anthropic's API under that key, and the PR is read from GitHub. Nothing is
sent anywhere else.

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env     # your key; .env is gitignored
npm run vera -- review https://github.com/owner/repo/pull/123
```

It reads who owns what from the repo's `.vera.yml`, or its `CODEOWNERS`
when there's no `.vera.yml`. To try a `.vera.yml` before committing one:
`--config path/to/vera.yml` (see [`examples/vera.yml`](examples/vera.yml)).
Without either, it names the areas but no people. Set `GITHUB_TOKEN` to go
past GitHub's 60 requests an hour. Each run writes a trace (every step,
model call, cost and time) to `.vera/runs/`. Add `--markdown` to print the
review as a GitHub comment, or `--comment` to post it on the PR (it updates
Vera's earlier comment rather than adding another; needs a `GITHUB_TOKEN`
that can write to the repo).

## Use it on your repo: the GitHub Action

Vera can review every pull request on your repo and keep one comment up to
date on each, with a **Vera: sign-off** check showing who has signed off. It
reads the PR through GitHub's API and never runs its code.

The comment is laid out like the mock-up on
[Vera's site](https://vera-agent.vercel.app/#preview):

- **What this touches:** the 3–5 places that most need a person's
  judgment, each marked by risk, linked to its lines, and naming who should
  check it, with a flag when the change looks AI-written.
- **Before you sign off:** questions for the engineer, when the change is
  likely AI-written or has a high-risk place.
- **Sign-off:** who has to sign off and who has, updated as people sign off.
- **How Vera decided,** folded away below: the areas, the design call, and
  the cost.

The risk and sign-off squares are small images from Vera's site; if they
can't load, their text (High, Waiting) shows instead.

1. Add your Anthropic API key as a repository secret named
   `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions).
2. Add `.github/workflows/vera.yml`:

```yaml
name: Vera review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  pull_request_review:
    types: [submitted, dismissed]
  issue_comment:
    types: [created]
permissions:
  contents: read
  pull-requests: write
  checks: write
concurrency:
  group: vera-${{ github.event_name == 'pull_request' && 'review' || 'sign-off' }}-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  review:
    if: >-
      (github.event_name == 'pull_request' && !github.event.pull_request.draft) ||
      github.event_name == 'pull_request_review' ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request && contains(github.event.comment.body, '/vera sign'))
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: ndelias/vera@v0.5.0
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

3. Optionally pin the exact commit instead of the tag, so what runs with
   your key can't change under you:
   `ndelias/vera@513438f36c745b443ee8b3bb87a5bd472b13e654 # v0.5.0`.
4. Optionally add a `.vera.yml` naming your areas and people (see
   [`examples/vera.yml`](examples/vera.yml)); without it Vera uses CODEOWNERS.

Pull requests from forks don't get secrets, so Vera skips them with a note.

### Signing off

Everyone Vera asks has to sign off, one way or the other:

- **Approve the pull request**, as usual. It signs off every role you were
  asked for.
- **Comment `/vera sign-off`**, which also works on your own pull requests
  (GitHub won't let you approve those). Name a role to sign off for just
  that one: `/vera sign-off design`. Vera reacts 👍 when it counted, 😕
  when you weren't asked for that role.

Requesting changes takes your sign-off back.

### Understanding checks

When a change is likely AI-written, or its brief marks a place high risk,
Vera adds 1–3 questions for the engineer to its comment: questions only
someone who read the change could answer. Answer them where you sign off,
in your approval's text or under `/vera sign-off`, numbered:

```
/vera sign-off
1. It retries three times, then marks the job failed.
2. Only admins: the check is in the permissions middleware.
```

Vera grades each answer and the sign-off table shows the result, e.g.
"✓ signed off · understood 2 of 2". It records understanding; it doesn't
block the merge. What a good answer covers is kept in Vera's comment,
encrypted with a key derived from your `ANTHROPIC_API_KEY`, so only Vera's
own runs can read it. Grading an answer costs a fraction of a cent. The check turns green when
every role has signed off. Until then it's grey, not red: it's information
and doesn't block merging. These updates don't call the model, so they cost
nothing.

## Running it

```bash
python3 research/pipeline/collect_hn.py research/studies/01-discovery/queries-r1.json
python3 research/pipeline/collect_hn.py research/studies/01-discovery/queries-r2.json
python3 research/pipeline/check_matches.py
python3 research/pipeline/load_study.py
npm install                 # whole workspace (apps/* and packages/*)
npm run dev -w panel        # the website, http://localhost:3100
npm run build -w panel      # static export into apps/panel/out
npm run preview -w panel    # serve that export, http://localhost:3200
npm run ci                  # typecheck + tests (CI also builds the site)
```

Secrets (an Anthropic API key, later) go in `.env` at the repo root, which
is gitignored. Code reads them through `secret()` in `@vera/core`, which
never prints a value. Anything that looks like a credential is redacted
before it reaches a trace.

The database (`research/data/research.sqlite`) is rebuilt by the scripts and isn't committed.

The website doesn't read it. `python3 research/pipeline/export_site.py` writes
a publishable snapshot: every count the pages show, short excerpts (with
links) only for the 2,480 posts that were read or coded, and no merge request
titles or URLs. Its compressed copy, `apps/panel/data/site.sqlite.gz` (9 MB),
is committed and unpacked before each dev run and build.

### Deploying

The site is fully static, so any static host works. On Vercel: import the
repo, set the root directory to `apps/panel`, keep the Next.js preset.

## License

Vera's code is free and open source under the [Apache License 2.0](LICENSE):
use it, change it and share it, at work too. When the agents ship, they run
on your own Anthropic API key: you pay Anthropic for the model calls and
nothing to anyone else.

The research data isn't part of that license. The published snapshot
(`apps/panel/data/site.sqlite.gz`) holds counts and short, linked excerpts
from public posts, which stay under their sources' terms (Stack Exchange
content is CC BY-SA 4.0).
