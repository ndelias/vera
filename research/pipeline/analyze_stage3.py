"""Stage 3: tests R1–R5 exactly as written in studies/04-deep-dive/DESIGN.md.

    python3 research/pipeline/analyze_stage3.py
"""

import json
import random
import re
import statistics
import time
from datetime import datetime, timezone

from db import connect

ROUND, SEED, HOUR = 7, 20261020, 3600
ROUND_NOTE = ("Stage 3 deep dive: a random sample of 6,000 merged GitLab product MRs (Oct 2025 to Oct 2026) with "
              "AI-disclosure markers from descriptions and commits, plus the review-time trend over two years.")
BASE = """FROM gl_mrs m WHERE m.project = 'product' AND m.state = 'merged' AND m.merged_at IS NOT NULL
          AND m.author_role != 'bot' AND m.labels NOT LIKE '%automation:bot-authored%'"""


def med(xs):
    return statistics.median(xs) if xs else None


def ratio_ci(a, b, n=2000):
    if len(a) < 10 or len(b) < 10:
        return None
    rng = random.Random(SEED)
    rs = sorted(statistics.median(rng.choices(a, k=len(a))) / max(statistics.median(rng.choices(b, k=len(b))), 1e-9)
                for _ in range(n))
    return [round(rs[int(.025 * n)], 2), round(rs[int(.975 * n) - 1], 2)]


def record(conn, hid, method, result, verdict):
    conn.execute("""INSERT INTO tests (hypothesis_id, hypothesis_version, round_id, method, query_sql, result_json,
                    verdict, ran_at) VALUES (?, 1, ?, ?, NULL, ?, ?, ?)""",
                 (hid, ROUND, method, json.dumps(result), verdict, int(time.time())))
    conn.execute("UPDATE hypotheses SET status = ? WHERE id = ? AND version = 1",
                 ({"supports": "supported", "disproves": "disproved"}.get(verdict, "open"), hid))
    print(f"\n{hid}: {verdict}\n{json.dumps(result, indent=1)}")


def quarter(ts):
    d = datetime.fromtimestamp(ts, timezone.utc)
    q = (d.year - 2024) * 4 + (d.month - 1) // 3 - 3
    return q if 0 <= q <= 7 else None


def slope(pts):
    n = len(pts)
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    return sum((x - mx) * (y - my) for x, y in pts) / sum((x - mx) ** 2 for x, _ in pts)


def r1(conn):
    by_q = {}
    for created, dur in conn.execute(f"SELECT m.created_at, m.merged_at - m.created_at {BASE}"):
        q = quarter(created)
        if q is not None and dur >= 0:
            by_q.setdefault(q, []).append(dur / HOUR)
    pts = [(q, statistics.median(v)) for q, v in sorted(by_q.items())]
    s = slope(pts)
    rng = random.Random(SEED)
    boots = sorted(slope([(q, statistics.median(rng.choices(v, k=len(v)))) for q, v in sorted(by_q.items())])
                   for _ in range(500))
    ci = [round(boots[12], 2), round(boots[487], 2)]
    result = {"quarterly_median_hours": [round(v, 1) for _, v in pts],
              "mrs_per_quarter": [len(by_q[q]) for q, _ in pts],
              "slope_hours_per_quarter": round(s, 2), "slope_95ci": ci}
    record(conn, "R1", "Quarterly median time to merge, merged non-bot product MRs, Q4 2024 to Q3 2026; slope with a "
           "95% bootstrap interval (500 resamples within quarters).", result,
           "supports" if s > 0 and ci[0] > 0 else "disproves")


def bucket(files):
    return None if files is None else "1-3" if files <= 3 else "4-10" if files <= 10 else "11+"


def sample(conn):
    return conn.execute("""SELECT s.mr_id, s.files_changed, s.ai_marker, m.merged_at - m.created_at, m.notes_n,
                                  m.title, m.created_at, m.reviewer_roles
                           FROM s3_mrs s JOIN gl_mrs m ON m.id = s.mr_id""").fetchall()


def compare(rows, idx, scale, hid, label, conn):
    ai = [r for r in rows if r[2]]
    if len(ai) < 200:
        record(conn, hid, label, {"ai_disclosed": len(ai), "note": "under 200 AI-disclosed MRs"}, "inconclusive")
        return
    out, above = {}, 0
    for b in ("1-3", "4-10", "11+"):
        a = [r[idx] / scale for r in rows if r[2] and bucket(r[1]) == b]
        n = [r[idx] / scale for r in rows if not r[2] and bucket(r[1]) == b]
        ra = med(a) / med(n) if a and n and med(n) else None
        above += ra is not None and ra > 1.0
        out[b] = {"ai_n": len(a), "other_n": len(n), "ai_median": round(med(a), 1) if a else None,
                  "other_median": round(med(n), 1) if n else None,
                  "ratio": round(ra, 2) if ra else None, "ratio_95ci": ratio_ci(a, n)}
    out["ai_disclosed_total"] = len(ai)
    record(conn, hid, label, out, "supports" if above >= 2 else "disproves")


def r4(conn, rows):
    reverts = {}
    for title, created in conn.execute(
            "SELECT title, created_at FROM gl_mrs WHERE project = 'product' AND title LIKE 'Revert \"%'"):
        m = re.match(r'^Revert "(.*)"\s*$', title)
        if m:
            reverts.setdefault(m.group(1), []).append(created)

    def reverted(r):
        return any(t > r[6] for t in reverts.get(r[5], []))

    ai = [r for r in rows if r[2]]
    other = [r for r in rows if not r[2]]
    ra, ro = sum(map(reverted, ai)), sum(map(reverted, other))
    result = {"ai_disclosed": len(ai), "ai_reverted": ra, "ai_rate": round(ra / len(ai), 4) if ai else None,
              "other": len(other), "other_reverted": ro, "other_rate": round(ro / len(other), 4) if other else None}
    if ra < 10:
        verdict = "inconclusive"
    else:
        verdict = "supports" if ra / len(ai) > ro / len(other) else "disproves"
    record(conn, "R4", "Share of sampled MRs later reverted (a product MR titled Revert \"<title>\" created after it), "
           "AI-disclosed vs not.", result, verdict)


def r5(conn, rows):
    def roles(s):
        return {x for x in (s or "").split(",") if x and x not in ("unknown", "bot")}

    small = [r for r in rows if r[1] is not None and r[1] <= 3 and roles(r[7])]
    one = [r[3] / HOUR for r in small if len(roles(r[7])) == 1]
    many = [r[3] / HOUR for r in small if len(roles(r[7])) >= 2]
    ra = med(many) / med(one) if one and many else None
    result = {"one_role_n": len(one), "two_plus_n": len(many),
              "one_role_median_hours": round(med(one), 1) if one else None,
              "two_plus_median_hours": round(med(many), 1) if many else None,
              "ratio": round(ra, 2) if ra else None, "ratio_95ci": ratio_ci(many, one)}
    verdict = "inconclusive" if ra is None else "supports" if ra >= 1.5 else "disproves" if ra < 1.25 else "inconclusive"
    record(conn, "R5", "Sampled MRs with 1–3 files: median time to merge, reviewers from 2+ roles ÷ 1 role.",
           result, verdict)


def main():
    conn = connect()
    conn.execute("INSERT OR IGNORE INTO rounds (id, started_at, note) VALUES (?, ?, ?)",
                 (ROUND, int(time.time()), ROUND_NOTE))
    r1(conn)
    rows = sample(conn)
    print(f"\n{len(rows)} sampled MRs, {sum(1 for r in rows if r[2])} AI-disclosed")
    compare(rows, 3, HOUR, "R2", "Median hours to merge, AI-disclosed ÷ not, by size bucket.", conn)
    compare(rows, 4, 1, "R3", "Median review comments, AI-disclosed ÷ not, by size bucket.", conn)
    r4(conn, rows)
    r5(conn, rows)
    conn.commit()


if __name__ == "__main__":
    main()
