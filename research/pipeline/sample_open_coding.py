"""Draws the open-coding sample: 30 corpus posts per stage, fixed seed.

Equal per stage so every stage gets read. That's right for finding which
pains exist. How often each pain occurs is measured later, by coding the
whole corpus.

    python3 research/pipeline/sample_open_coding.py
"""

import json
import random

from db import ROOT, connect

SEED = 20261019
PER_STAGE = 30
OUT = ROOT / "studies" / "01-discovery" / "open-coding-sample.json"


def main() -> None:
    conn = connect()
    rows = conn.execute(
        """SELECT DISTINCT q.stage, m.doc_id FROM match_checks m
           JOIN queries q ON q.id = m.query_id AND q.round_id = m.round_id
           WHERE m.exact = 1 ORDER BY q.stage, m.doc_id"""
    ).fetchall()
    by_stage: dict[str, list[str]] = {}
    for stage, doc_id in rows:
        by_stage.setdefault(stage, []).append(doc_id)

    rng = random.Random(SEED)
    taken: set[str] = set()
    sample = []
    for stage in sorted(by_stage):
        pool = [d for d in by_stage[stage] if d not in taken]
        for doc_id in rng.sample(pool, min(PER_STAGE, len(pool))):
            taken.add(doc_id)
            sample.append({"doc_id": doc_id, "stage": stage})

    OUT.write_text(json.dumps({"seed": SEED, "per_stage": PER_STAGE, "docs": sample}, indent=1))
    print(f"{len(sample)} posts → {OUT.relative_to(ROOT)}")
    for stage in sorted(by_stage):
        print(f"  {stage:<13} {len(by_stage[stage]):>6} in corpus")


if __name__ == "__main__":
    main()
