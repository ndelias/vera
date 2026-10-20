"""Tests H1–H7 on the coded 2,000-post sample, as written in sample-plan.md.

Each test runs on relevant posts (level 1 or 2) and again on first-hand posts
(level 2). If the two verdicts differ, the result is inconclusive. Overall
counts are weighted by each source's share of the corpus.

    python3 research/pipeline/analyze_sample.py
"""

import json
import random
import time
from datetime import datetime, timezone

from db import connect

CODER = "cc-agents/claude-opus-5-5/v4-sample"
ROUND = 6
SEED = 20261020

AFTER = {"review-overload", "test-ci-friction", "qa-capacity", "ai-output-quality",
         "bottleneck-shift", "code-comprehension"}
WRITING = {"unclear-requirements", "design-drift", "interruptions", "late-alignment"}
REVIEW_Q = {"review-overload", "ai-output-quality", "change-impact", "code-comprehension"}


def load(conn):
    corpus = dict(conn.execute("SELECT source, COUNT(*) FROM corpus GROUP BY source"))
    posts = {}
    for doc, source, level, created in conn.execute(
        """SELECT m.doc_id, d.source, m.level, d.created_at FROM coding_meta m
           JOIN documents d ON d.id = m.doc_id WHERE m.coder = ?""", (CODER,)):
        posts[doc] = {"source": source, "level": level, "created": created, "codes": set()}
    for doc, code in conn.execute("SELECT doc_id, code_id FROM codings WHERE coder = ?", (CODER,)):
        if doc in posts:
            posts[doc]["codes"].add(code)
    sampled = {}
    for p in posts.values():
        sampled[p["source"]] = sampled.get(p["source"], 0) + 1
    weight = {s: corpus[s] / n for s, n in sampled.items()}
    return posts, weight


def est(posts, weight, pred) -> float:
    """Estimated number of corpus posts matching pred."""
    return sum(weight[p["source"]] for p in posts if pred(p))


def subset(posts, min_level):
    return [p for p in posts.values() if p["level"] >= min_level]


def combine(results: dict) -> str:
    verdicts = {r["verdict"] for r in results.values()}
    return verdicts.pop() if len(verdicts) == 1 else "inconclusive"


def record(conn, hid, method, result, verdict):
    conn.execute(
        """INSERT INTO tests (hypothesis_id, hypothesis_version, round_id, method, query_sql,
                              result_json, verdict, ran_at) VALUES (?, 1, ?, ?, NULL, ?, ?, ?)""",
        (hid, ROUND, method, json.dumps(result), verdict, int(time.time())))
    status = {"supports": "supported", "disproves": "disproved"}.get(verdict, "open")
    conn.execute("UPDATE hypotheses SET status = ? WHERE id = ? AND version = 1", (status, hid))
    print(f"\n{hid}: {verdict}\n{json.dumps(result, indent=1)}")


def h1(conn, posts, weight):
    out = {}
    for name, lvl in (("relevant", 1), ("first_hand", 2)):
        ps = subset(posts, lvl)
        after = est(ps, weight, lambda p: p["codes"] & AFTER)
        writing = est(ps, weight, lambda p: p["codes"] & WRITING)
        out[name] = {"after_code_posts": round(after), "while_writing_posts": round(writing),
                     "verdict": "supports" if after > writing else "disproves"}
    record(conn, "H1", "Estimated corpus posts with an after-code code vs a while-writing code (weighted by source).",
           out, combine(out))


def quarter(ts: int) -> int | None:
    d = datetime.fromtimestamp(ts, timezone.utc)
    idx = (d.year - 2024) * 4 + (d.month - 1) // 3 - 3  # Q4 2024 = 0
    return idx if 0 <= idx <= 7 else None


def slope(points: list[tuple[int, float]]) -> float:
    n = len(points)
    mx = sum(x for x, _ in points) / n
    my = sum(y for _, y in points) / n
    sxx = sum((x - mx) ** 2 for x, _ in points)
    return sum((x - mx) * (y - my) for x, y in points) / sxx if sxx else 0.0


def shares(rows: list[tuple[int, bool]]) -> list[tuple[int, float]]:
    pts = []
    for q in range(8):
        qs = [hit for qq, hit in rows if qq == q]
        if qs:
            pts.append((q, sum(qs) / len(qs)))
    return pts


def h2(conn, posts, _weight):
    out = {}
    rng = random.Random(SEED)
    for name, lvl in (("relevant", 1), ("first_hand", 2)):
        rows = [(quarter(p["created"]), bool(p["codes"] & {"review-overload", "bottleneck-shift"}))
                for p in subset(posts, lvl) if p["source"] == "hn"]
        rows = [(q, h) for q, h in rows if q is not None]
        s = slope(shares(rows))
        boots = sorted(slope(shares(rng.choices(rows, k=len(rows)))) for _ in range(2000))
        lo, hi = boots[50], boots[1949]
        out[name] = {"posts": len(rows), "quarterly_share": [round(v, 3) for _, v in shares(rows)],
                     "slope_per_quarter": round(s, 4), "slope_95ci": [round(lo, 4), round(hi, 4)],
                     "verdict": "supports" if s > 0 and lo > 0 else "disproves"}
    record(conn, "H2", "Share of relevant HN posts coded review-overload or bottleneck-shift per quarter "
           "(Q4 2024 to Q3 2026); least-squares slope with a 95% bootstrap interval.", out, combine(out))


def ranking(ps, weight):
    codes = {c for p in ps for c in p["codes"]} - {"other"}
    return sorted(((round(est(ps, weight, lambda p, c=c: c in p["codes"])), c) for c in codes), reverse=True)


def h3(conn, posts, weight):
    out = {}
    for name, lvl in (("relevant", 1), ("first_hand", 2)):
        rank = ranking(subset(posts, lvl), weight)
        pos = next((i + 1 for i, (_, c) in enumerate(rank) if c == "eng-dependency"), None)
        pm = [p for p in subset(posts, lvl) if p["source"] == "pm-se"]
        pm_rank = ranking(pm, {"pm-se": 1})
        pm_pos = next((i + 1 for i, (_, c) in enumerate(pm_rank) if c == "eng-dependency"), None)
        out[name] = {"eng_dependency_rank": pos, "of_codes": len(rank), "top_8": [c for _, c in rank[:8]],
                     "pm_se_rank": pm_pos,
                     "verdict": "disproves" if pos is not None and pos <= 8 else "supports"}
    record(conn, "H3", "Rank of eng-dependency among codes by estimated corpus posts (weighted); PM SE reported separately.",
           out, combine(out))


def h4(conn):
    record(conn, "H4", "Not testable with codebook v4: there is no 'wrong edit' code to compare change-impact against.",
           {"note": "untestable with this codebook"}, "inconclusive")


def h6(conn, posts, weight):
    out = {}
    for name, lvl in (("relevant", 1), ("first_hand", 2)):
        ps = subset(posts, lvl)
        codes = sorted({c for p in ps for c in p["codes"]} - {"other"})
        pairs = []
        for i, a in enumerate(codes):
            for b in codes[i + 1:]:
                pairs.append((est(ps, weight, lambda p, a=a, b=b: a in p["codes"] or b in p["codes"]), a, b))
        pairs.sort(reverse=True)
        target = est(ps, weight, lambda p: p["codes"] & {"review-overload", "approval-delays"})
        top = pairs[0]
        pm = [p for p in ps if p["source"] == "pm-se"]
        pm_share = sum("approval-delays" in p["codes"] for p in pm) / len(pm) if pm else 0
        is_top = target >= top[0] - 1e-9
        out[name] = {"review_or_approval_posts": round(target), "largest_pair": [top[1], top[2], round(top[0])],
                     "top_5_pairs": [[a, b, round(n)] for n, a, b in pairs[:5]],
                     "approval_delays_share_of_pm_se": round(pm_share, 3),
                     "verdict": "supports" if is_top and pm_share >= 0.05 else "disproves"}
    record(conn, "H6", "Estimated posts coded review-overload or approval-delays vs every other pair of codes; "
           "approval-delays share of relevant PM SE posts.", out, combine(out))


def h7(conn, posts, weight):
    out = {}
    for name, lvl in (("relevant", 1), ("first_hand", 2)):
        ps = [p for p in subset(posts, lvl) if "non-eng-building" in p["codes"]]
        if len(ps) < 20:
            out[name] = {"non_eng_building_posts": len(ps), "verdict": "inconclusive"}
            continue
        share = est(ps, weight, lambda p: p["codes"] & REVIEW_Q) / est(ps, weight, lambda p: True)
        out[name] = {"non_eng_building_posts": len(ps), "share_with_review_codes": round(share, 3),
                     "verdict": "supports" if share >= 0.25 else "disproves"}
    record(conn, "H7", "Among posts coded non-eng-building, the share also coded review-overload, ai-output-quality, "
           "change-impact or code-comprehension. Under 20 posts: inconclusive.", out, combine(out))


def main():
    conn = connect()
    posts, weight = load(conn)
    print(f"{len(posts)} coded posts; weights {json.dumps({k: round(v, 2) for k, v in weight.items()})}")
    print("top codes (relevant, weighted):", ranking(subset(posts, 1), weight)[:12])
    h1(conn, posts, weight)
    h2(conn, posts, weight)
    h3(conn, posts, weight)
    h4(conn)
    h6(conn, posts, weight)
    h7(conn, posts, weight)
    conn.commit()


if __name__ == "__main__":
    main()
