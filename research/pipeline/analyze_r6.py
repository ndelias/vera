"""R6: has the amount of code per MR grown? Exactly as in studies/04-deep-dive/DESIGN.md.

    python3 research/pipeline/analyze_r6.py
"""

import random
import statistics

from analyze_stage3 import BASE, SEED, quarter, record, slope
from db import connect


def main() -> None:
    conn = connect()
    by_q: dict[int, list[int]] = {}
    for q, added, deleted in conn.execute("SELECT quarter, lines_added, lines_deleted FROM r6_size"):
        by_q.setdefault(q, []).append(added + deleted)
    mrs: dict[int, int] = {}
    for (created,) in conn.execute(f"SELECT m.created_at {BASE}"):
        q = quarter(created)
        if q is not None:
            mrs[q] = mrs.get(q, 0) + 1

    pts = [(q, statistics.median(v)) for q, v in sorted(by_q.items())]
    s = slope(pts)
    rng = random.Random(SEED)
    boots = sorted(slope([(q, statistics.median(rng.choices(v, k=len(v)))) for q, v in sorted(by_q.items())])
                   for _ in range(2000))
    ci = [round(boots[50], 1), round(boots[1949], 1)]
    totals = {q: mrs[q] * statistics.mean(v) for q, v in by_q.items()}
    first, last = min(totals), max(totals)
    tl = conn.execute("SELECT SUM(too_large_files), SUM(generated_files), SUM(files) FROM r6_size").fetchone()
    result = {
        "sampled_per_quarter": [len(by_q[q]) for q, _ in pts],
        "median_lines_per_mr": [round(v) for _, v in pts],
        "mean_lines_per_mr": [round(statistics.mean(by_q[q])) for q, _ in pts],
        "slope_lines_per_quarter": round(s, 1), "slope_95ci": ci,
        "mrs_per_quarter": [mrs[q] for q, _ in pts],
        "estimated_total_lines_per_quarter": [round(totals[q]) for q, _ in pts],
        "total_lines_last_vs_first_quarter": round(totals[last] / totals[first], 2),
        "files_too_large_generated_all": list(tl),
    }
    record(conn, "R6", "Quarterly median lines changed per merged non-bot product MR (250 sampled per quarter, generated "
           "files excluded), Q4 2024 to Q3 2026; slope with a 95% bootstrap interval. Total lines per quarter "
           "(MR count x mean) is descriptive.", result, "supports" if s > 0 and ci[0] > 0 else "disproves")
    conn.commit()


if __name__ == "__main__":
    main()
