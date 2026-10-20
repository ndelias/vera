"""Agreement between two codebook-v4 coders on relevance level (2 / 1 / 0).

Reports exact agreement and Cohen's kappa on the three levels, the same
collapsed to relevant-or-not (level >= 1), and the cross-table.

    python3 research/pipeline/agreement_levels.py <coder A> <coder B>
"""

import json
import sys
from collections import Counter

from db import connect


def kappa(pairs: list[tuple[int, int]], cats: list[int]) -> tuple[float, float]:
    n = len(pairs)
    agree = sum(a == b for a, b in pairs) / n
    ca, cb = Counter(a for a, _ in pairs), Counter(b for _, b in pairs)
    chance = sum(ca[c] * cb[c] for c in cats) / (n * n)
    return agree, (agree - chance) / (1 - chance) if chance < 1 else 1.0


def main(a: str, b: str) -> None:
    conn = connect()
    pairs = conn.execute(
        """SELECT x.level, y.level FROM coding_meta x
           JOIN coding_meta y ON y.doc_id = x.doc_id AND y.coder = ?
           WHERE x.coder = ?""", (b, a)).fetchall()
    three = kappa(pairs, [0, 1, 2])
    two = kappa([(int(x > 0), int(y > 0)) for x, y in pairs], [0, 1])
    table = Counter(pairs)
    print(json.dumps({
        "n": len(pairs),
        "three_levels": {"agreement": round(three[0], 3), "kappa": round(three[1], 3)},
        "relevant_or_not": {"agreement": round(two[0], 3), "kappa": round(two[1], 3)},
        "cross_table (A level, B level): count": {f"{x},{y}": n for (x, y), n in sorted(table.items())},
    }, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:])
