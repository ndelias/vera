"""Study 07: do coding agents' pull requests pile up? See studies/07-agent-backlog/DESIGN.md.

    python3 research/pipeline/analyze_agent_prs.py

D1, D2 and D3 against the thresholds written before the data was pulled,
for all repos and for active repos (10+ stars, a push in the last 30 days).
"""

import json
from datetime import datetime, timezone

from db import ROOT, connect
from evals import wilson

NOW = int(datetime(2026, 10, 23, tzinfo=timezone.utc).timestamp())
ACTIVE_PUSH = NOW - 30 * 24 * 3600
OUT = ROOT / "findings" / "11-agent-backlog.json"


def verdict(value: float, supported: float, disproved: float) -> str:
    return "supported" if value >= supported else "disproved" if value < disproved else "inconclusive"


def main() -> None:
    conn = connect()
    repos = {r: (s or 0, p or 0, a) for r, s, p, a in conn.execute("SELECT repo, stars, pushed_at, archived FROM ag_repos")}
    active = {r for r, (s, p, a) in repos.items() if s >= 10 and p >= ACTIVE_PUSH and not a}
    prs = conn.execute("SELECT id, agent, repo, state FROM ag_prs").fetchall()
    out = {"sampled_prs": len(prs), "repos": len(repos), "active_repos": len(active), "per_agent": {}}

    # Descriptive: merged, closed, still open, per agent and in active repos.
    for scope, keep in (("all", lambda r: True), ("active", lambda r: r in active)):
        for agent in sorted({p[1] for p in prs}):
            mine = [p for p in prs if p[1] == agent and keep(p[2])]
            if mine:
                out["per_agent"].setdefault(agent, {})[scope] = {
                    "n": len(mine), **{s: round(sum(p[3] == s for p in mine) / len(mine), 3) for s in ("merged", "closed", "open")}}

    # D1: still open two months on (active repos; all repos alongside).
    d1 = {}
    for scope, keep in (("all", lambda r: True), ("active", lambda r: r in active)):
        mine = [p for p in prs if keep(p[2])]
        k = sum(p[3] == "open" for p in mine)
        d1[scope] = {"open": k, "n": len(mine), "share": round(k / len(mine), 3), "ci95": [round(x, 3) for x in wilson(k, len(mine))]}
    d1["verdict"] = verdict(d1["active"]["share"], 0.20, 0.10)
    out["D1"] = d1

    # D2: active repos where one agent has 20+ PRs open for over 30 days (a lower bound: sampled repos only).
    counts = conn.execute("SELECT agent, repo, open_over_30d FROM ag_open_counts").fetchall()
    big = {r for a, r, n in counts if n >= 20}
    out["D2"] = {"repos_all": len(big), "repos_active": len(big & active),
                 "largest_active": sorted((n for a, r, n in counts if r in active), reverse=True)[:5],
                 "verdict": verdict(len(big & active), 50, 10)}

    # D3: can sampled open PRs still merge cleanly?
    rows = conn.execute("SELECT m.id, p.repo, m.mergeable, m.base_ahead FROM ag_mergeable m JOIN ag_prs p ON p.id = m.id").fetchall()
    d3 = {}
    for scope, keep in (("all", lambda r: True), ("active", lambda r: r in active)):
        known = [r for r in rows if keep(r[1]) and r[2] is not None]
        k = sum(r[2] == 0 for r in known)
        ahead = sorted(r[3] for r in rows if keep(r[1]) and r[3] is not None)
        d3[scope] = {"conflicts": k, "known": len(known), "unknown": sum(1 for r in rows if keep(r[1]) and r[2] is None),
                     "share": round(k / len(known), 3) if known else None,
                     "ci95": [round(x, 3) for x in wilson(k, len(known))] if known else None,
                     "median_base_commits_ahead": ahead[len(ahead) // 2] if ahead else None}
    d3["verdict"] = verdict(d3["active"]["share"] or 0, 0.30, 0.15) if d3["active"]["known"] else "inconclusive"
    out["D3"] = d3

    OUT.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
