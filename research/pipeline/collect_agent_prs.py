"""Study 07: coding agents' pull requests on public GitHub. See studies/07-agent-backlog/DESIGN.md.

    python3 research/pipeline/collect_agent_prs.py sample     # up to 400 PRs per agent, Apr 23 - Aug 23 2026
    python3 research/pipeline/collect_agent_prs.py trim       # back to 400 per agent (the daily slices gather a few more)
    python3 research/pipeline/collect_agent_prs.py repos      # stars, last push for each sampled repo
    python3 research/pipeline/collect_agent_prs.py backlog    # per sampled repo: the agent's PRs open over 30 days
    python3 research/pipeline/collect_agent_prs.py mergeable  # up to 300 open PRs: can they still merge?

Reads through the GitHub CLI (`gh api`), with whoever is logged in, read-only.
Resumable. Keeps no titles, bodies or human authors.
"""

import json
import random
import subprocess
import sys
import time
from datetime import date, datetime, timedelta, timezone

from db import connect

AGENTS = ["devin-ai-integration[bot]", "copilot-swe-agent[bot]", "cursor[bot]", "google-labs-jules[bot]", "claude[bot]"]
START, END = date(2026, 4, 23), date(2026, 8, 23)
PER_AGENT = 400
SEED = 20261023
NOW = datetime(2026, 10, 23, tzinfo=timezone.utc)
CUTOFF_30D = (NOW - timedelta(days=30)).date().isoformat()


def gh(path: str, **params) -> dict:
    args = ["gh", "api", "-X", "GET", path] + [x for k, v in params.items() for x in ("-f", f"{k}={v}")]
    for attempt in range(6):
        res = subprocess.run(args, capture_output=True, text=True)
        if res.returncode == 0:
            return json.loads(res.stdout)
        if "rate limit" in res.stderr.lower() or "secondary" in res.stderr.lower() or "502" in res.stderr or "503" in res.stderr:
            time.sleep(30 * (attempt + 1))
            continue
        if "404" in res.stderr or "Not Found" in res.stderr or "451" in res.stderr:
            return {}
        time.sleep(5)
    raise RuntimeError(f"gave up on {path}: {res.stderr.strip()[:200]}")


def ts(v: str | None) -> int | None:
    return int(datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()) if v else None


def search(q: str, per_page: int = 100) -> dict:
    out = gh("search/issues", q=q, per_page=per_page, sort="created", order="asc")
    time.sleep(2.1)  # search allows 30 requests a minute
    return out


def cmd_sample() -> None:
    conn = connect()
    rng = random.Random(SEED)
    days = [(START + timedelta(days=i)) for i in range((END - START).days + 1)]
    per_day = -(-PER_AGENT // len(days))  # ceil
    done = {(a, d) for a, d in conn.execute("SELECT agent, day FROM ag_days_done")}
    for agent in AGENTS:
        for day in days:
            if (agent, day.isoformat()) in done:
                continue
            hour = rng.randrange(24)  # a random hour of the day, so the sample isn't early-morning PRs
            lo = f"{day.isoformat()}T{hour:02d}:00:00Z"
            hi = f"{day.isoformat()}T{hour:02d}:59:59Z"
            items = search(f"is:pr is:public author:{agent} created:{lo}..{hi}").get("items", [])
            pick = rng.sample(items, min(per_day, len(items)))
            rows = []
            for it in pick:
                repo = it["repository_url"].split("/repos/")[1]
                pr = it.get("pull_request") or {}
                state = "merged" if pr.get("merged_at") else ("closed" if it["state"] == "closed" else "open")
                rows.append((f"{repo}#{it['number']}", agent, repo, ts(it["created_at"]), state, ts(it.get("closed_at")), ts(it.get("updated_at"))))
            conn.executemany("INSERT OR REPLACE INTO ag_prs VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
            conn.execute("INSERT INTO ag_days_done VALUES (?, ?)", (agent, day.isoformat()))
            conn.commit()
        n = conn.execute("SELECT COUNT(*) FROM ag_prs WHERE agent = ?", (agent,)).fetchone()[0]
        print(f"{agent}: {n} PRs", flush=True)


def cmd_trim() -> None:
    """The plan says up to 400 PRs per agent; slicing by day rounds up, so each
    agent is cut back to 400 at random (fixed seed)."""
    conn = connect()
    rng = random.Random(SEED + 1)
    for agent in AGENTS:
        ids = [i for i, in conn.execute("SELECT id FROM ag_prs WHERE agent = ? ORDER BY id", (agent,))]
        if len(ids) > PER_AGENT:
            drop = set(ids) - set(rng.sample(ids, PER_AGENT))
            conn.executemany("DELETE FROM ag_prs WHERE id = ?", [(i,) for i in drop])
        print(f"{agent}: {min(len(ids), PER_AGENT)} kept of {len(ids)}")
    conn.commit()


def cmd_repos() -> None:
    conn = connect()
    todo = [r for r, in conn.execute("SELECT DISTINCT repo FROM ag_prs WHERE repo NOT IN (SELECT repo FROM ag_repos)")]
    print(f"{len(todo)} repos", flush=True)
    for i, repo in enumerate(todo, 1):
        r = gh(f"repos/{repo}")
        conn.execute("INSERT OR REPLACE INTO ag_repos VALUES (?, ?, ?, ?, ?)",
                     (repo, r.get("stargazers_count"), ts(r.get("pushed_at")), int(bool(r.get("archived"))), int(bool(r.get("private")))))
        if i % 100 == 0:
            conn.commit()
            print(f"{i}/{len(todo)}", flush=True)
    conn.commit()


def cmd_backlog() -> None:
    """For each agent and each sampled repo where it has an open PR: how many of
    its PRs there are open and older than 30 days. A lower bound on backlogs:
    only repos that came up in the sample are counted."""
    conn = connect()
    done = {(a, r) for a, r in conn.execute("SELECT agent, repo FROM ag_open_counts")}
    todo = [(a, r) for a, r in conn.execute("SELECT DISTINCT agent, repo FROM ag_prs WHERE state = 'open'") if (a, r) not in done]
    print(f"{len(todo)} agent-repo pairs", flush=True)
    for i, (agent, repo) in enumerate(todo, 1):
        n = search(f"is:pr is:open author:{agent} repo:{repo} created:<{CUTOFF_30D}", per_page=1).get("total_count", 0)
        conn.execute("INSERT OR REPLACE INTO ag_open_counts VALUES (?, ?, ?)", (agent, repo, n))
        if i % 50 == 0:
            conn.commit()
            print(f"{i}/{len(todo)}", flush=True)
    conn.commit()


def cmd_mergeable() -> None:
    conn = connect()
    done = {i for i, in conn.execute("SELECT id FROM ag_mergeable")}
    open_ids = [i for i, in conn.execute("SELECT id FROM ag_prs WHERE state = 'open' ORDER BY id")]
    todo = [i for i in random.Random(SEED).sample(open_ids, min(300, len(open_ids))) if i not in done]
    print(f"{len(todo)} open PRs", flush=True)
    for n, pr_id in enumerate(todo, 1):
        repo, num = pr_id.split("#")
        pr = gh(f"repos/{repo}/pulls/{num}")
        if pr and pr.get("mergeable") is None:  # GitHub computes it on demand
            time.sleep(3)
            pr = gh(f"repos/{repo}/pulls/{num}")
        ahead = None
        if pr.get("head") and pr.get("base"):
            cmp = gh(f"repos/{repo}/compare/{pr['head']['sha']}...{pr['base']['ref']}")
            ahead = cmp.get("ahead_by")
        m = pr.get("mergeable")
        conn.execute("INSERT OR REPLACE INTO ag_mergeable VALUES (?, ?, ?, ?)",
                     (pr_id, None if m is None else int(m), pr.get("mergeable_state"), ahead))
        if n % 25 == 0:
            conn.commit()
            print(f"{n}/{len(todo)}", flush=True)
    conn.commit()


if __name__ == "__main__":
    {"sample": cmd_sample, "trim": cmd_trim, "repos": cmd_repos, "backlog": cmd_backlog, "mergeable": cmd_mergeable}[sys.argv[1]]()
