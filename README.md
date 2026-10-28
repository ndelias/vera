# Vera

An agent that speeds up code review for teams shipping AI-written code.
Live at https://vera-agent.vercel.app. The research chose the problem,
not the other way round. "Blast Radius" was
the working name for the original idea, which the data ruled out.

Status: research done (`research/findings/08-decision.md`). Building next.

- `research/PLAN.md`: the claims we're testing, the data sources, the methods
- `research/studies/`: one folder per study (scripts and notes)
- `research/data/`: processed datasets (raw downloads in `data/raw/` are gitignored)
- `research/findings/`: write-ups and charts, one per study
- `research/pipeline/`: collection, cleaning and coding scripts (Python, standard library only)
- `apps/panel/`: Vera's website (product, the case, the evidence), a static Next.js export built from a research snapshot
- `packages/core/`: Vera's core. So far: the trace format, cost per call, redaction, secrets

## Try it: `vera review`

Reviews one GitHub pull request: which areas it touches, whether it makes a
design decision, and who should be asked. Runs on your own Anthropic API key
(about 1–2 cents a review): the PR's title, file list and diff go to
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
date on each. It reads the PR through GitHub's API and never runs its code.

1. Add your Anthropic API key as a repository secret named
   `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions).
2. Add `.github/workflows/vera.yml`:

```yaml
name: Vera review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    steps:
      - uses: ndelias/vera@main   # pin a release tag once there is one
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

3. Optionally add a `.vera.yml` naming your areas and people (see
   [`examples/vera.yml`](examples/vera.yml)); without it Vera uses CODEOWNERS.

Pull requests from forks don't get secrets, so Vera skips them with a note.

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
