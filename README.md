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
