"""Stage 2: weighted scores from scores.json + frequency.json, plus a sensitivity check.

Sensitivity: every judged score (cost, buyer, gap, agent fit) is nudged by
-1, 0 or +1 at random (clamped to 1-5), 10,000 times. Reports how often each
pain lands in the top 3.

    python3 research/pipeline/score.py
"""

import json
import random
from pathlib import Path

DIR = Path(__file__).resolve().parents[1] / "studies" / "03-scoring"
JUDGED = ("cost", "buyer", "gap", "agent_fit")


def total(p: dict, w: dict) -> int:
    return p["frequency"] * w["frequency"] + sum(p[k] * w[k] for k in JUDGED)


def top3(pains: list[dict], w: dict) -> list[str]:
    ranked = sorted(pains, key=lambda p: (total(p, w), p["share_first_hand"]), reverse=True)
    return [p["code"] for p in ranked[:3]]


def main() -> None:
    spec = json.loads((DIR / "scores.json").read_text())
    freq = {f["code"]: f for f in json.loads((DIR / "frequency.json").read_text())}
    w = spec["weights"]
    pains = [{**p, "frequency": freq[p["code"]]["frequency_score"],
              "share": freq[p["code"]]["share_relevant"],
              "share_first_hand": freq[p["code"]]["share_first_hand"]} for p in spec["pains"]]
    ranked = sorted(pains, key=lambda p: (total(p, w), p["share_first_hand"]), reverse=True)

    rng = random.Random(20261020)
    hits = {p["code"]: 0 for p in pains}
    runs = 10_000
    for _ in range(runs):
        nudged = [{**p, **{k: min(5, max(1, p[k] + rng.choice((-1, 0, 1)))) for k in JUDGED}} for p in pains]
        for code in top3(nudged, w):
            hits[code] += 1

    rows = []
    for i, p in enumerate(ranked, 1):
        rows.append({"rank": i, "code": p["code"], "label": p["label"], "score": total(p, w),
                     "frequency": p["frequency"], "cost": p["cost"], "buyer": p["buyer"], "gap": p["gap"],
                     "agent_fit": p["agent_fit"], "share": p["share"], "share_first_hand": p["share_first_hand"],
                     "top3_under_nudging": round(hits[p["code"]] / runs, 3)})
        print(f"{i:>2}. {p['label']:<38} {total(p, w):>2}  F{p['frequency']} C{p['cost']} B{p['buyer']} "
              f"G{p['gap']} A{p['agent_fit']}   top-3 in {hits[p['code']] / runs:.0%} of nudged runs")
    (DIR / "ranking.json").write_text(json.dumps({"weights": w, "runs": runs, "ranking": rows}, indent=1))


if __name__ == "__main__":
    main()
