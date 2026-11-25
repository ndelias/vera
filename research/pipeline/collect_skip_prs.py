"""Study 08, what reviewers can skip: merged GitHub PRs at the first version
reviewers commented on, and which commented spots the author changed
afterwards. See studies/08-skip/DESIGN.md.

    python3 research/pipeline/collect_skip_prs.py            # both sets
    python3 research/pipeline/collect_skip_prs.py train      # one set

Read-only through the GitHub CLI (`gh api`). Keeps paths, line numbers,
hunks and counts: no comment text, no reviewer names. Resumable.
"""

import random
import re
import sys
from datetime import datetime, timezone

from collect_agent_prs import gh, ts
from db import connect

REPOS = ["grafana/grafana", "PostHog/posthog", "getsentry/sentry"]
SETS = {
    "train": (datetime(2026, 7, 1, tzinfo=timezone.utc), datetime(2026, 10, 1, tzinfo=timezone.utc), 20),
    "test": (datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 11, 16, tzinfo=timezone.utc), 35),
}
SEED = 20261125
NEAR = 3  # lines either side of a comment that count as "that code"
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def is_bot(user: dict) -> bool:
    return user.get("type") == "Bot" or (user.get("login") or "").endswith("[bot]")


def merged_in(repo: str, start: datetime, end: datetime) -> list[int]:
    """Merged PRs in the window, from the closed list (newest created first)."""
    out = []
    for page in range(1, 200):
        rows = gh(f"repos/{repo}/pulls", state="closed", sort="created", direction="desc", per_page=100, page=page) or []
        for p in rows:
            m = p.get("merged_at")
            if m and start.timestamp() <= ts(m) < end.timestamp() and not is_bot(p.get("user") or {}):
                out.append(p["number"])
        if page % 10 == 0:
            print(f"  {repo}: listed {page * 100} closed PRs, {len(out)} merged in the window", flush=True)
        # Stop once PRs were created well before the window opened.
        if not rows or ts(rows[-1]["created_at"]) < start.timestamp() - 60 * 86400:
            break
    return sorted(set(out))


def hunks(patch: str) -> list[dict]:
    """Split one file's patch into hunks, with the changed lines' numbers."""
    out, cur, o, n, replacing = [], None, 0, 0, False
    for line in patch.split("\n"):
        h = HUNK.match(line)
        if h:
            o, n, replacing = int(h[1]), int(h[3]), False
            cur = {"old_start": o, "old_len": int(h[2] or 1), "new_start": n, "new_len": int(h[4] or 1),
                   "added": 0, "deleted": 0, "lines": [line], "old_changed": [], "new_changed": []}
            out.append(cur)
            continue
        if cur is None:
            continue
        cur["lines"].append(line)
        if line.startswith("+"):
            cur["added"] += 1
            cur["new_changed"].append(n)
            if not replacing:  # a pure insertion sits between old lines
                cur["old_changed"].append(o - 0.5)
            n += 1
        elif line.startswith("-"):
            cur["deleted"] += 1
            cur["old_changed"].append(o)
            replacing = True
            o += 1
        elif not line.startswith("\\"):
            replacing = False
            o += 1
            n += 1
    return out


def touched_later(later: dict, path: str, first: int, last: int) -> bool:
    """Did a later change touch lines first..last (± NEAR) of the reviewed version?"""
    f = later.get(path)
    if not f:
        return False
    lo, hi = first - NEAR, last + NEAR
    return any(lo - 0.5 <= x <= hi + 0.5 for h in f for x in h["old_changed"])


def collect(conn, repo: str, number: int, split: str) -> bool:
    pid = f"{repo}#{number}"
    pr = gh(f"repos/{repo}/pulls/{number}")
    if not pr or is_bot(pr.get("user") or {}) or not 2 <= pr.get("changed_files", 0) <= 40 \
            or pr.get("additions", 0) + pr.get("deletions", 0) > 1500:
        return False
    author = pr["user"]["login"]
    comments = []
    for page in range(1, 6):
        rows = gh(f"repos/{repo}/pulls/{number}/comments", per_page=100, page=page) or []
        comments += rows
        if len(rows) < 100:
            break
    theirs = [c for c in comments if not is_bot(c.get("user") or {}) and (c.get("user") or {}).get("login") != author
              and c.get("original_line") and c.get("original_commit_id") and c.get("subject_type", "line") == "line"]
    if not theirs:
        return False
    reviewed = min(theirs, key=lambda c: c["created_at"])["original_commit_id"]
    spots = [c for c in theirs if c["original_commit_id"] == reviewed and not c.get("in_reply_to_id")]

    # The diff Vera reads: base to the reviewed commit.
    first = gh(f"repos/{repo}/compare/{pr['base']['sha']}...{reviewed}")
    if not first or not first.get("files"):
        return False
    hs, by_path = [], {}
    for f in first["files"]:
        for h in hunks(f.get("patch") or ""):
            h["path"] = f["filename"]
            by_path.setdefault(f["filename"], []).append(len(hs))
            hs.append(h)
    if not hs:
        return False

    # What changed afterwards: the reviewed commit to the last one.
    head = pr["head"]["sha"]
    later = {}
    if head != reviewed:
        cmp = gh(f"repos/{repo}/compare/{reviewed}...{head}")
        if not cmp or cmp.get("status") not in ("ahead", "identical"):
            return False  # history was rewritten; the reviewed commit isn't an ancestor
        for f in cmp.get("files") or []:
            later[f["filename"]] = hunks(f.get("patch") or "")

    rows = []
    for c in spots:
        side = c.get("side") or "RIGHT"
        last = c["original_line"]
        first_line = c.get("original_start_line") or last
        idx = None
        for i in by_path.get(c["path"], []):
            h = hs[i]
            lo, ln = (h["new_start"], h["new_len"]) if side == "RIGHT" else (h["old_start"], h["old_len"])
            if lo <= last < lo + max(ln, 1):
                idx = i
                break
        if idx is None:
            continue
        if side == "RIGHT":
            span = (first_line, last)
        else:  # a deleted line: judge the hunk's place in the reviewed version
            h = hs[idx]
            span = (h["new_start"], h["new_start"] + max(h["new_len"], 1) - 1)
        rows.append((pid, c["id"], c["path"], side, first_line, last, idx, int(touched_later(later, c["path"], *span))))
    if not any(r[-1] for r in rows):
        return False

    lines = sum(h["added"] + h["deleted"] for h in hs)
    conn.execute("INSERT OR REPLACE INTO sk_prs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                 (pid, repo, split, reviewed, head, len(first["files"]), lines, ts(pr["merged_at"])))
    conn.executemany("INSERT OR REPLACE INTO sk_hunks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     [(pid, i, h["path"], h["old_start"], h["old_len"], h["new_start"], h["new_len"],
                       h["added"], h["deleted"], "\n".join(h["lines"])) for i, h in enumerate(hs)])
    conn.executemany("INSERT OR REPLACE INTO sk_spots VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
    return True


def main() -> None:
    conn = connect()
    for split in sys.argv[1:] or list(SETS):
        start, end, per_repo = SETS[split]
        for repo in REPOS:
            kept = conn.execute("SELECT COUNT(*) FROM sk_prs WHERE repo = ? AND split = ?", (repo, split)).fetchone()[0]
            if kept >= per_repo:
                print(f"{split} {repo}: {kept} already", flush=True)
                continue
            pool = merged_in(repo, start, end)
            random.Random(f"{SEED}-{split}-{repo}").shuffle(pool)
            seen = {i for i, in conn.execute("SELECT id FROM sk_seen")}
            print(f"{split} {repo}: {len(pool)} merged PRs in the window", flush=True)
            for number in pool:
                if kept >= per_repo:
                    break
                pid = f"{repo}#{number}"
                if pid in seen:
                    continue
                ok = collect(conn, repo, number, split)
                conn.execute("INSERT OR REPLACE INTO sk_seen VALUES (?, ?)", (pid, int(ok)))
                conn.commit()
                kept += ok
                if ok:
                    print(f"  {pid} kept ({kept}/{per_repo})", flush=True)
            print(f"{split} {repo}: kept {kept}", flush=True)


if __name__ == "__main__":
    main()
