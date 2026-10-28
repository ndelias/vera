"""Study 06, the Briefer: merged GitHub PRs and where reviewers left line
comments. See studies/06-agents/DESIGN.md ("The Briefer").

    python3 research/pipeline/collect_briefer_prs.py

Read-only through the GitHub CLI (`gh api`). Keeps file paths and comment
counts only: no comment text, no reviewer names. Resumable.
"""

import random
import sys
import time
from datetime import date, timedelta

from collect_agent_prs import gh, ts
from db import connect

REPOS = ["grafana/grafana", "PostHog/posthog", "getsentry/sentry"]
START, END = date(2026, 7, 1), date(2026, 9, 30)
PER_REPO = 35
SEED = 20261025


def candidates(repo: str) -> list[int]:
    """Every merged PR in the window, day by day (search returns at most 1,000 per query)."""
    out, day = [], START
    while day <= END:
        for page in range(1, 11):
            res = gh("search/issues", q=f"repo:{repo} is:pr is:merged merged:{day}..{day}", per_page=100, page=page)
            time.sleep(2.1)  # search allows 30 requests a minute
            items = res.get("items", [])
            out += [it["number"] for it in items if (it.get("user") or {}).get("type") != "Bot"]
            if len(items) < 100:
                break
        day += timedelta(days=1)
    return sorted(set(out))


def is_bot(user: dict) -> bool:
    return user.get("type") == "Bot" or (user.get("login") or "").endswith("[bot]")


def main() -> None:
    conn = connect()
    rng = random.Random(SEED)
    for repo in REPOS:
        kept = conn.execute("SELECT COUNT(*) FROM br_prs WHERE repo = ?", (repo,)).fetchone()[0]
        if kept >= PER_REPO:
            print(f"{repo}: {kept} already", flush=True)
            continue
        pool = candidates(repo)
        rng.shuffle(pool)
        seen = {i for i, in conn.execute("SELECT id FROM br_seen")}
        print(f"{repo}: {len(pool)} merged PRs in the window", flush=True)
        for number in pool:
            if kept >= PER_REPO:
                break
            pid = f"{repo}#{number}"
            if pid in seen:
                continue
            pr = gh(f"repos/{repo}/pulls/{number}")
            ok = bool(pr) and not is_bot(pr.get("user") or {}) and 2 <= pr.get("changed_files", 0) <= 40 \
                and pr.get("additions", 0) + pr.get("deletions", 0) <= 1500
            rows = []
            if ok:
                author = pr["user"]["login"]
                comments = gh(f"repos/{repo}/pulls/{number}/comments", per_page=100)
                by_path = {}
                for c in comments or []:
                    u = c.get("user") or {}
                    if not is_bot(u) and u.get("login") != author:
                        by_path[c["path"]] = by_path.get(c["path"], 0) + 1
                ok = sum(by_path.values()) >= 2
                if ok:
                    files = gh(f"repos/{repo}/pulls/{number}/files", per_page=100) or []
                    rows = [(pid, f["filename"], f["additions"] + f["deletions"], by_path.get(f["filename"], 0)) for f in files]
                    ok = any(r[3] for r in rows)  # comments on files still in the final diff
            conn.execute("INSERT OR REPLACE INTO br_seen VALUES (?, ?)", (pid, int(ok)))
            if ok:
                conn.execute("INSERT OR REPLACE INTO br_prs VALUES (?, ?, ?, ?, ?)",
                             (pid, repo, pr["changed_files"], pr["additions"] + pr["deletions"], ts(pr["merged_at"])))
                conn.executemany("INSERT OR REPLACE INTO br_files VALUES (?, ?, ?, ?)", rows)
                kept += 1
            conn.commit()
        print(f"{repo}: kept {kept}", flush=True)


if __name__ == "__main__":
    main()
