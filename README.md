# Blast Radius

Working name. An agentic B2B product for product teams. Which problem it
solves is decided by the research, not chosen in advance.

Status: research. Nothing gets built until the research
(`research/PLAN.md`) has chosen the problem.

- `research/PLAN.md`: the claims we're testing, the data sources, the methods
- `research/studies/`: one folder per study (scripts and notes)
- `research/data/`: processed datasets (raw downloads in `data/raw/` are gitignored)
- `research/findings/`: write-ups and charts, one per study
- `research/pipeline/`: collection, cleaning and coding scripts (Python, standard library only)
- `apps/panel/`: the discovery panel, a Next.js app that reads the research database

## Running it

```bash
python3 research/pipeline/collect_hn.py research/studies/01-discovery/queries-r1.json
python3 research/pipeline/collect_hn.py research/studies/01-discovery/queries-r2.json
python3 research/pipeline/check_matches.py
python3 research/pipeline/load_study.py
npm --prefix apps/panel install && npm --prefix apps/panel run dev   # http://localhost:3100
```

The database (`research/data/research.sqlite`) is rebuilt by the scripts and isn't committed.
