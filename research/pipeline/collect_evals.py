"""Study 05 (M1): the data for the evals. See studies/05-evals/DESIGN.md.

    python3 research/pipeline/collect_evals.py files     # changed files of the 6,000 Stage 3 MRs
    python3 research/pipeline/collect_evals.py fixes     # changed files of every fix-like MR in the window
    python3 research/pipeline/collect_evals.py links     # label v2: MR links in descriptions, source branches

Public API, no token. Resumable: each MR is recorded as done once stored.
Paths and line counts only; diff text is never stored.
"""

import re
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from collect_gitlab import get, months
from db import connect
from evals import FIX, WEEK

PROJECT = urllib.parse.quote("gitlab-org/gitlab", safe="")


def iid(mr_id: str) -> int:
    return int(mr_id.split("!")[1])


def sample(conn) -> list[str]:
    return [r[0] for r in conn.execute("SELECT mr_id FROM s3_mrs ORDER BY mr_id")]


def files(n: int) -> list[tuple]:
    out, page = [], 1
    while page <= 30:
        diffs, headers = get(f"projects/{PROJECT}/merge_requests/{n}/diffs", {"per_page": 100, "page": page})
        for d in diffs:
            added = deleted = 0
            for line in (d.get("diff") or "").splitlines():
                if line.startswith("+") and not line.startswith("+++"):
                    added += 1
                elif line.startswith("-") and not line.startswith("---"):
                    deleted += 1
            path = d["new_path"] if not d.get("deleted_file") else d["old_path"]
            out.append((path, added, deleted, int(bool(d.get("new_file"))), int(bool(d.get("generated_file"))), int(bool(d.get("too_large")))))
        if not headers.get("X-Next-Page"):
            break
        page += 1
    return out


def cmd_files() -> None:
    conn = connect()
    done = {r[0] for r in conn.execute("SELECT mr_id FROM ev_files_done")}
    todo = [m for m in sample(conn) if m not in done]
    print(f"{len(todo)} MRs to fetch", flush=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, (mr_id, rows) in enumerate(zip(todo, ex.map(lambda m: files(iid(m)), todo)), 1):
            # A path can appear twice (renamed onto another); keep the first.
            conn.executemany("INSERT OR IGNORE INTO ev_files VALUES (?, ?, ?, ?, ?, ?, ?)", [(mr_id, *r) for r in rows])
            conn.execute("INSERT INTO ev_files_done VALUES (?)", (mr_id,))
            if i % 200 == 0:
                conn.commit()
                print(f"{i}/{len(todo)}", flush=True)
    conn.commit()


def fix_candidates(conn) -> list[str]:
    """Merged product MRs that look like a fix (title or type::bug), merged
    from the first sampled merge to 7 days after the last."""
    lo, hi = conn.execute("SELECT MIN(m.merged_at), MAX(m.merged_at) FROM s3_mrs s JOIN gl_mrs m ON m.id = s.mr_id").fetchone()
    return [mr_id for mr_id, title, labels in conn.execute(
        "SELECT id, title, labels FROM gl_mrs WHERE project = 'product' AND merged_at > ? AND merged_at <= ? ORDER BY id", (lo, hi + WEEK))
        if FIX.search(title or "") or "type::bug" in (labels or "").split(",")]


def cmd_fixes() -> None:
    conn = connect()
    done = {r[0] for r in conn.execute("SELECT mr_id FROM ev_fix_done")}
    todo = [m for m in fix_candidates(conn) if m not in done]
    print(f"{len(todo)} fix-like MRs to fetch", flush=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, (mr_id, rows) in enumerate(zip(todo, ex.map(lambda m: files(iid(m)), todo)), 1):
            conn.executemany("INSERT OR IGNORE INTO ev_fix_files VALUES (?, ?)", [(mr_id, r[0]) for r in rows if not r[4]])
            conn.execute("INSERT INTO ev_fix_done VALUES (?)", (mr_id,))
            if i % 200 == 0:
                conn.commit()
                print(f"{i}/{len(todo)}", flush=True)
    conn.commit()


# A product MR named in a description: !123, gitlab-org/gitlab!123, or its URL.
LINK = re.compile(r"(?:(?<![\w/])|gitlab-org/gitlab)!(\d+)\b|gitlab\.com/gitlab-org/gitlab/-/merge_requests/(\d+)")


def cmd_links() -> None:
    """Every merged product MR created from the Stage 3 window to the end of
    the data: the MRs its description links, and its source branch."""
    conn = connect()
    done = {m for m, in conn.execute("SELECT month FROM ev_links_done")}
    spans = [(lo, hi) for lo, hi in months("2025-10-01", "2026-10-19") if lo[:7] not in done]

    def fetch(span):
        lo, hi = span
        out, page = [], 1
        while True:
            items, headers = get(f"projects/{PROJECT}/merge_requests", {
                "state": "merged", "created_after": lo, "created_before": min(hi, "2026-10-19T00:00:00Z"),
                "per_page": 100, "page": page, "order_by": "created_at", "sort": "asc"})
            out += [(f"product!{mr['iid']}", mr.get("source_branch") or "",
                     {f"product!{a or b}" for a, b in LINK.findall(mr.get("description") or "")} - {f"product!{mr['iid']}"})
                    for mr in items]
            if not headers.get("X-Next-Page"):
                return out
            page += 1

    with ThreadPoolExecutor(max_workers=4) as ex:
        for (lo, _), rows in zip(spans, ex.map(fetch, spans)):
            conn.executemany("INSERT OR REPLACE INTO ev_branches VALUES (?, ?)", [(m, b) for m, b, _ in rows if b])
            conn.executemany("INSERT OR IGNORE INTO ev_links VALUES (?, ?)", [(m, l) for m, _, ls in rows for l in ls])
            conn.execute("INSERT INTO ev_links_done VALUES (?)", (lo[:7],))
            conn.commit()
            print(f"{lo[:7]}: {len(rows)} MRs, {sum(len(ls) for _, _, ls in rows)} links", flush=True)


if __name__ == "__main__":
    {"files": cmd_files, "fixes": cmd_fixes, "links": cmd_links}[sys.argv[1]]()
