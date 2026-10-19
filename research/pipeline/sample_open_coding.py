"""Draws open-coding samples with a fixed seed.

Round 2 (Hacker News): 30 corpus posts per stage. Round 3 (Stack Exchange,
no stages): 50 posts per source. Equal per group so every group gets read.
That's right for finding which pains exist. How often each pain occurs is
measured later, by coding the whole corpus.

    python3 research/pipeline/sample_open_coding.py        # round 2
    python3 research/pipeline/sample_open_coding.py r3     # round 3
"""

import json
import random
import sys

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


def main_r3() -> None:
    conn = connect()
    out = ROOT / "studies" / "01-discovery" / "open-coding-sample-r3.json"
    rng = random.Random(SEED + 3)
    sample = []
    for source in ("ux-se", "pm-se"):
        pool = [r[0] for r in conn.execute(
            "SELECT id FROM corpus WHERE source = ? ORDER BY id", (source,))]
        sample += [{"doc_id": d, "source": source} for d in rng.sample(pool, 50)]
    out.write_text(json.dumps({"seed": SEED + 3, "per_source": 50, "docs": sample}, indent=1))
    print(f"{len(sample)} posts → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main_r3() if sys.argv[1:] == ["r3"] else main()
