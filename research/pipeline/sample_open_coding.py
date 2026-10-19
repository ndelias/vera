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


def main_r6() -> None:
    """Round 6: 40 posts where product engineers speak, 40 where PMs do."""
    conn = connect()
    out = ROOT / "studies" / "01-discovery" / "open-coding-sample-r6.json"
    rng = random.Random(SEED + 6)
    taken: set[str] = set()
    sample = []
    for voice, prefixes in (("product-engineer", ("voice-pe-",)), ("pm", ("voice-tpm", "voice-pm-"))):
        pool = sorted({
            r[0] for r in conn.execute(
                "SELECT doc_id, query_id FROM match_checks WHERE round_id = 6 AND exact = 1")
            if r[1].startswith(prefixes)
        } - taken)
        for d in rng.sample(pool, 40):
            taken.add(d)
            sample.append({"doc_id": d, "voice": voice})
    out.write_text(json.dumps({"seed": SEED + 6, "per_voice": 40, "docs": sample}, indent=1))
    print(f"{len(sample)} posts → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    {"r3": main_r3, "r6": main_r6}.get(sys.argv[1] if sys.argv[1:] else "", main)()
