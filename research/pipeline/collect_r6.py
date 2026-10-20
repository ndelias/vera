"""R6: lines changed for 250 random merged product MRs per quarter.

Counts '+' and '-' lines in each file's diff (headers excluded), leaving out
files GitLab marks as generated. See studies/04-deep-dive/DESIGN.md.

    python3 research/pipeline/collect_r6.py
"""

import random
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from analyze_stage3 import BASE, quarter
from collect_gitlab import get
from db import connect

PROJECT = urllib.parse.quote("gitlab-org/gitlab", safe="")
PER_QUARTER, SEED = 250, 20261021


def size(iid: int) -> tuple:
    added = deleted = files = generated = too_large = 0
    page = 1
    while page <= 10:
        diffs, headers = get(f"projects/{PROJECT}/merge_requests/{iid}/diffs", {"per_page": 100, "page": page})
        for d in diffs:
            files += 1
            if d.get("generated_file"):
                generated += 1
                continue
            if d.get("too_large"):
                too_large += 1
                continue
            for line in (d.get("diff") or "").splitlines():
                if line.startswith("+") and not line.startswith("+++"):
                    added += 1
                elif line.startswith("-") and not line.startswith("---"):
                    deleted += 1
        if not headers.get("X-Next-Page"):
            break
        page += 1
    return added, deleted, files, generated, too_large


def main() -> None:
    conn = connect()
    by_q: dict[int, list[str]] = {}
    for mr_id, created in conn.execute(f"SELECT m.id, m.created_at {BASE} ORDER BY m.id"):
        q = quarter(created)
        if q is not None:
            by_q.setdefault(q, []).append(mr_id)
    rng = random.Random(SEED)
    todo = []
    done = {r[0] for r in conn.execute("SELECT mr_id FROM r6_size")}
    for q in sorted(by_q):
        todo += [(m, q) for m in rng.sample(by_q[q], PER_QUARTER) if m not in done]
    print(f"{len(todo)} MRs to measure", flush=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, ((mr_id, q), row) in enumerate(zip(todo, ex.map(lambda t: size(int(t[0].split("!")[1])), todo)), 1):
            conn.execute("INSERT OR REPLACE INTO r6_size VALUES (?, ?, ?, ?, ?, ?, ?)", (mr_id, q, *row))
            if i % 250 == 0:
                conn.commit()
                print(f"{i}/{len(todo)}", flush=True)
    conn.commit()


if __name__ == "__main__":
    main()
