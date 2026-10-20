"""Relevance agreement between two coders on the posts both judged.

Reports percent agreement and Cohen's kappa (agreement beyond chance),
overall and per source, plus the posts they disagree on.

    python3 research/pipeline/agreement.py <coder A> <coder B>
"""

import json
import sys

from db import connect


def kappa(pairs: list[tuple[int, int]]) -> tuple[float, float]:
    n = len(pairs)
    agree = sum(a == b for a, b in pairs) / n
    pa = sum(a for a, _ in pairs) / n
    pb = sum(b for _, b in pairs) / n
    chance = pa * pb + (1 - pa) * (1 - pb)
    return agree, (agree - chance) / (1 - chance) if chance < 1 else 1.0


def main(a: str, b: str) -> None:
    conn = connect()
    rows = conn.execute(
        """SELECT d.source, x.doc_id, x.relevant, y.relevant FROM relevance x
           JOIN relevance y ON y.doc_id = x.doc_id AND y.coder = ?
           JOIN documents d ON d.id = x.doc_id
           WHERE x.coder = ?""", (b, a)).fetchall()
    out = {}
    for source in [None, *sorted({r[0] for r in rows})]:
        pairs = [(r[2], r[3]) for r in rows if source is None or r[0] == source]
        if not pairs:
            continue
        agree, k = kappa(pairs)
        out[source or "all"] = {
            "n": len(pairs), "agreement": round(agree, 3), "kappa": round(k, 3),
            "a_relevant": sum(p[0] for p in pairs), "b_relevant": sum(p[1] for p in pairs),
            "a_only": sum(p == (1, 0) for p in pairs), "b_only": sum(p == (0, 1) for p in pairs),
        }
    print(json.dumps(out, indent=1))
    disagree = [r[1] for r in rows if r[2] != r[3]]
    print(f"\n{len(disagree)} disagreements:", " ".join(disagree[:60]))


if __name__ == "__main__":
    main(*sys.argv[1:])
