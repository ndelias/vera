"""Study 02 analysis: tests G1–G3 exactly as written in hypotheses-r5.json.

Each run stores one test row per hypothesis (method, the numbers, verdict)
and sets the hypothesis status. Ratios come with a 95% bootstrap interval
(2,000 resamples, fixed seed) so a verdict near the line is visible as such.

    python3 research/pipeline/analyze_gitlab.py
"""

import json
import random
import statistics
import time

from collect_gitlab import ROUND, WINDOW_START
from db import connect

NON_ENG = ("design", "product", "marketing", "other")
SEED = 20261019
HOUR = 3600


def median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def ratio_ci(a: list[float], b: list[float], n: int = 2000) -> tuple[float, float] | None:
    """95% bootstrap interval for median(a) / median(b)."""
    if len(a) < 10 or len(b) < 10:
        return None
    rng = random.Random(SEED)
    ratios = []
    for _ in range(n):
        ma = statistics.median(rng.choices(a, k=len(a)))
        mb = statistics.median(rng.choices(b, k=len(b)))
        if mb > 0:
            ratios.append(ma / mb)
    ratios.sort()
    return ratios[int(0.025 * len(ratios))], ratios[int(0.975 * len(ratios)) - 1]


def hours(xs: list[float]) -> list[float]:
    return [x / HOUR for x in xs]


def record(conn, hid: str, method: str, sql: str, result: dict, verdict: str) -> None:
    conn.execute(
        """INSERT INTO tests (hypothesis_id, hypothesis_version, round_id, method, query_sql,
                              result_json, verdict, ran_at)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?)""",
        (hid, ROUND, method, sql, json.dumps(result), verdict, int(time.time())),
    )
    status = {"supports": "supported", "disproves": "disproved"}.get(verdict, "open")
    conn.execute("UPDATE hypotheses SET status = ? WHERE id = ? AND version = 1", (status, hid))
    print(f"{hid}: {verdict}\n  {json.dumps(result, indent=1)}")


def g1(conn) -> None:
    sql = """SELECT m.project, d.first_review_at - m.created_at, m.merged_at - m.created_at
             FROM gl_mrs m JOIN gl_mr_details d ON d.mr_id = m.id
             WHERE m.state = 'merged' AND m.merged_at IS NOT NULL AND m.created_at >= ? AND m.author_role != 'bot'"""
    rows = conn.execute(sql, (WINDOW_START,)).fetchall()
    result = {}
    for project in sorted({r[0] for r in rows}):
        merge = [r[2] for r in rows if r[0] == project]
        approved = [r for r in rows if r[0] == project and r[1] is not None and r[1] >= 0]
        review = [r[1] for r in approved]
        mr, mm = median(review), median(merge)
        # Not part of the decision rule: the same comparison on only the MRs that
        # had an approval, since MRs merged without one are typically faster.
        mm_same = median([r[2] for r in approved])
        result[project] = {
            "sampled_merged": len(merge),
            "with_an_approval": len(review),
            "median_hours_to_first_approval": round(mr / HOUR, 1) if mr is not None else None,
            "median_hours_to_merge": round(mm / HOUR, 1) if mm is not None else None,
            "share": round(mr / mm, 2) if mr is not None and mm else None,
            "median_hours_to_merge_approved_only": round(mm_same / HOUR, 1) if mm_same is not None else None,
            "share_approved_only": round(mr / mm_same, 2) if mr is not None and mm_same else None,
        }
    shares = [v["share"] for v in result.values() if v["share"] is not None]
    verdict = "disproves" if shares and all(s < 0.10 for s in shares) else "supports"
    record(conn, "G1",
           "Median time to first approval (by someone other than the author, not a bot; comments need a login) "
           "as a share of median time to merge, sampled merged MRs, per project. Disproved if under 10% in every project.",
           sql, result, verdict)


def g2(conn) -> None:
    sql = """SELECT m.author_role, d.first_review_at - m.created_at
             FROM gl_mrs m JOIN gl_mr_details d ON d.mr_id = m.id
             WHERE m.project = 'handbook' AND m.state = 'merged' AND m.created_at >= ?
               AND d.files_changed IS NOT NULL AND d.files_changed <= 3
               AND d.first_review_at IS NOT NULL AND d.first_review_at >= m.created_at"""
    rows = conn.execute(sql, (WINDOW_START,)).fetchall()
    eng = [r[1] for r in rows if r[0] == "engineering"]
    non = [r[1] for r in rows if r[0] in NON_ENG]
    by_role = {
        role: {"n": len(xs), "median_hours_to_first_approval": round(median(xs) / HOUR, 1) if xs else None}
        for role in ("engineering", *NON_ENG)
        for xs in [[r[1] for r in rows if r[0] == role]]
    }
    me, mn = median(eng), median(non)
    ratio = mn / me if me else None
    ci = ratio_ci(non, eng)
    result = {
        "small_mrs": "3 files or fewer, merged, with an approval",
        "engineering_n": len(eng), "non_engineering_n": len(non),
        "median_hours_engineering": round(me / HOUR, 1) if me is not None else None,
        "median_hours_non_engineering": round(mn / HOUR, 1) if mn is not None else None,
        "ratio": round(ratio, 2) if ratio else None,
        "ratio_95ci": [round(x, 2) for x in ci] if ci else None,
        "by_role": by_role,
    }
    if ratio is None:
        verdict = "inconclusive"
    elif ratio <= 1.25:
        verdict = "disproves"
    else:
        verdict = "supports"
    record(conn, "G2",
           "Handbook, small merged MRs (3 files or fewer): median time to first approval for non-engineers "
           "(design, product, marketing, other) divided by engineers'. Disproved if 1.25x or less.",
           sql, result, verdict)


def g3(conn) -> None:
    sql = """SELECT reviewer_roles, merged_at - created_at FROM gl_mrs
             WHERE project = 'product' AND state = 'merged' AND merged_at IS NOT NULL AND created_at >= ?
               AND author_role != 'bot' AND reviewer_roles != ''"""
    rows = conn.execute(sql, (WINDOW_START,)).fetchall()

    def n_roles(s: str) -> int:
        return len({r for r in s.split(",") if r and r not in ("unknown", "bot")})

    one = [r[1] for r in rows if n_roles(r[0]) == 1]
    many = [r[1] for r in rows if n_roles(r[0]) >= 2]
    m1, m2 = median(one), median(many)
    ratio = m2 / m1 if m1 else None
    ci = ratio_ci(many, one)
    result = {
        "one_role_n": len(one), "two_plus_roles_n": len(many),
        "median_hours_one_role": round(m1 / HOUR, 1) if m1 is not None else None,
        "median_hours_two_plus_roles": round(m2 / HOUR, 1) if m2 is not None else None,
        "ratio": round(ratio, 2) if ratio else None,
        "ratio_95ci": [round(x, 2) for x in ci] if ci else None,
        "note": "Reviewers with unknown roles (not on the current team page) don't count as a role.",
    }
    verdict = "inconclusive" if ratio is None else ("disproves" if ratio <= 1.25 else "supports")
    record(conn, "G3",
           "Product repo, merged MRs with reviewers: median time to merge when reviewers span two or more roles, "
           "divided by one role. Disproved if 1.25x or less.",
           sql, result, verdict)


def main() -> None:
    conn = connect()
    g1(conn)
    g2(conn)
    g3(conn)
    conn.commit()


if __name__ == "__main__":
    main()
