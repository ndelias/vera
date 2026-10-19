"""Study 02: collects GitLab merge requests with author and reviewer roles.

    python3 research/pipeline/collect_gitlab.py roles     # team data → role per hashed username
    python3 research/pipeline/collect_gitlab.py mrs       # every MR in the window, per project
    python3 research/pipeline/collect_gitlab.py details   # review details for a random sample

Public API, no token (GitLab allows about 500 requests a minute). Usernames
are only ever stored as salted hashes; the salt lives in data/.salt and is
never committed.
"""

import hashlib
import io
import json
import random
import re
import secrets
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from db import ROOT, connect

API = "https://gitlab.com/api/v4"
ROUND = 5
PROJECTS = {
    "handbook": "gitlab-com/content-sites/handbook",
    # "marketing-site": its MRs are members-only (403), see DESIGN.md.
    "product": "gitlab-org/gitlab",
}
WINDOW = ("2024-10-19", "2026-10-19")
SAMPLE_PER_ROLE = 200
SEED = 20261019
SALT_PATH = ROOT / "data" / ".salt"
RAW_DIR = ROOT / "data" / "raw" / "gitlab"

_remaining = 500


def get(path: str, params: dict | None = None, raw: bool = False):
    global _remaining
    url = f"{API}/{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    for attempt in range(6):
        if _remaining < 20:
            time.sleep(15)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "blast-radius-research"}), timeout=60) as res:
                _remaining = int(res.headers.get("RateLimit-Remaining", 500))
                body = res.read()
                return body if raw else (json.loads(body), res.headers)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(int(e.headers.get("Retry-After", 2 ** (attempt + 2))))
                continue
            raise
        except OSError:
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f"gave up on {url}")


def salt() -> bytes:
    if not SALT_PATH.exists():
        SALT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SALT_PATH.write_text(secrets.token_hex(32))
    return SALT_PATH.read_text().strip().encode()


def hash_user(username: str, key: bytes) -> str:
    return hashlib.sha256(key + username.lower().encode()).hexdigest()[:16]


BOT = re.compile(r"(^|[-_])bot($|[-_])|^project_\d+_bot|^group_\d+_bot|^gitlab-bot$|^ghost$")


def is_bot(username: str) -> bool:
    return bool(BOT.search(username.lower()))


def classify(job_title: str, division: str) -> str:
    t = job_title.lower()
    if "support" in t:
        return "other"
    if any(k in t for k in ("designer", "ux research", "user experience", "design manager", "director of ux", "ux manager")):
        return "design"
    if any(k in t for k in ("marketing", "content", "brand", "communications", "social media", "events", "editor", "web ")):
        return "marketing"
    if any(k in t for k in ("product manager", "product management", "product operations", "of product", "product lead", "pm,")):
        return "product"
    if any(k in t for k in ("engineer", "developer", "architect", "sre", "maintainer", "engineering")):
        return "engineering"
    d = division.lower()
    return {"engineering": "engineering", "marketing": "marketing", "product": "product"}.get(d, "other")


def field(text: str, name: str) -> str:
    m = re.search(rf"^{name}:\s*(.*)$", text, re.M)
    return re.sub(r"<[^>]+>", "", m.group(1)).strip().strip('"') if m else ""


def cmd_roles() -> None:
    key = salt()
    archive = get("projects/7764/repository/archive.tar.gz",
                  {"sha": "master", "path": "data/team_members/person"}, raw=True)
    rows, counts = [], {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar:
            if not member.isfile() or not member.name.endswith(".yml"):
                continue
            text = tar.extractfile(member).read().decode("utf-8", "replace")
            username = field(text, "gitlab")
            if not username:
                continue
            role = classify(field(text, "job_title") or field(text, "role"), field(text, "division"))
            rows.append((hash_user(username, key), role))
            counts[role] = counts.get(role, 0) + 1
    conn = connect()
    conn.executemany("INSERT OR REPLACE INTO gl_people VALUES (?, ?)", rows)
    conn.commit()
    print(f"{len(rows)} team members:", dict(sorted(counts.items(), key=lambda kv: -kv[1])))


def ts(value: str | None) -> int | None:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()) if value else None


def months(start: str, end: str):
    y, m = map(int, start[:7].split("-"))
    while f"{y:04d}-{m:02d}" < end[:7] or (f"{y:04d}-{m:02d}" == end[:7]):
        ny, nm = (y + (m == 12), m % 12 + 1)
        yield f"{y:04d}-{m:02d}-01T00:00:00Z", f"{ny:04d}-{nm:02d}-01T00:00:00Z"
        y, m = ny, nm


def cmd_mrs() -> None:
    key = salt()
    conn = connect()
    roles = dict(conn.execute("SELECT user_hash, role FROM gl_people"))
    if not roles:
        sys.exit("run `roles` first")
    conn.execute("INSERT OR IGNORE INTO rounds (id, started_at, note) VALUES (?, ?, ?)", (
        ROUND, int(time.time()),
        "Study 02: GitLab merge requests (handbook, marketing site, product) with author and reviewer roles from GitLab's public team data. Behavioral data, in place of Reddit (round 4, dropped).",
    ))

    def role_of(username: str) -> str:
        if is_bot(username):
            return "bot"
        return roles.get(hash_user(username, key), "unknown")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for short, path in PROJECTS.items():
        if conn.execute("SELECT 1 FROM queries WHERE id = ? AND round_id = ?", (f"gitlab-{short}", ROUND)).fetchone():
            print(f"{short}: already pulled")
            continue
        pid = urllib.parse.quote(path, safe="")
        total = 0
        for lo, hi in months(*WINDOW):
            if lo >= f"{WINDOW[1]}T00:00:00Z":
                break
            page = 1
            while True:
                items, headers = get(f"projects/{pid}/merge_requests", {
                    "state": "all", "created_after": lo, "created_before": min(hi, f"{WINDOW[1]}T00:00:00Z"),
                    "per_page": 100, "page": page, "order_by": "created_at", "sort": "asc",
                })
                rows = []
                for mr in items:
                    author = mr["author"]["username"]
                    reviewer_roles = sorted({role_of(r["username"]) for r in mr.get("reviewers") or []} - {"bot"})
                    merger = (mr.get("merge_user") or mr.get("merged_by") or {}).get("username")
                    rows.append((
                        f"{short}!{mr['iid']}", short, mr["iid"], mr["title"],
                        hash_user(author, key), role_of(author),
                        ",".join(reviewer_roles), len(reviewer_roles and mr.get("reviewers") or []),
                        role_of(merger) if merger else None,
                        ",".join(mr.get("labels") or []), mr["state"], int(bool(mr.get("draft"))),
                        mr.get("user_notes_count") or 0,
                        ts(mr["created_at"]), ts(mr.get("merged_at")), ts(mr.get("closed_at")),
                        mr["web_url"], ROUND,
                    ))
                conn.executemany(
                    "INSERT OR REPLACE INTO gl_mrs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
                conn.commit()
                total += len(rows)
                if not headers.get("X-Next-Page"):
                    break
                page += 1
            print(f"{short:<15} {lo[:7]}  total {total}", flush=True)
        conn.execute(
            """INSERT OR REPLACE INTO queries (id, round_id, source, stage, q, hits_total, hits_pulled)
               VALUES (?, ?, 'gitlab', NULL, ?, ?, ?)""",
            (f"gitlab-{short}", ROUND, path, total, total),
        )
        conn.commit()


def cmd_details() -> None:
    key = salt()
    conn = connect()
    roles = dict(conn.execute("SELECT user_hash, role FROM gl_people"))
    rng = random.Random(SEED)
    done = {r[0] for r in conn.execute("SELECT mr_id FROM gl_mr_details")}
    for short, path in PROJECTS.items():
        pid = urllib.parse.quote(path, safe="")
        groups = conn.execute(
            """SELECT author_role, group_concat(id) FROM gl_mrs
               WHERE project = ? AND state = 'merged' AND author_role NOT IN ('bot')
               GROUP BY author_role""", (short,)).fetchall()
        for role, ids in groups:
            ids = sorted(ids.split(","))
            pick = rng.sample(ids, min(SAMPLE_PER_ROLE, len(ids)))
            for mr_id in pick:
                if mr_id in done:
                    continue
                iid = int(mr_id.split("!")[1])
                mr, _ = get(f"projects/{pid}/merge_requests/{iid}")
                author = mr["author"]["username"]
                notes, _ = get(f"projects/{pid}/merge_requests/{iid}/notes",
                               {"sort": "asc", "order_by": "created_at", "per_page": 100})
                first = next((n for n in notes if not n.get("system")
                              and n["author"]["username"] != author and not is_bot(n["author"]["username"])), None)
                approvals, _ = get(f"projects/{pid}/merge_requests/{iid}/approvals")
                approvers = [a["user"]["username"] for a in approvals.get("approved_by") or []]
                changes = str(mr.get("changes_count") or "")
                conn.execute("INSERT OR REPLACE INTO gl_mr_details VALUES (?, ?, ?, ?, ?)", (
                    mr_id,
                    int(changes) if changes.isdigit() else None,
                    ts(first["created_at"]) if first else None,
                    len(approvers),
                    ",".join(sorted({("bot" if is_bot(a) else roles.get(hash_user(a, key), "unknown")) for a in approvers})),
                ))
                conn.commit()
            print(f"{short:<15} {role:<12} {len(pick)} sampled", flush=True)


if __name__ == "__main__":
    {"roles": cmd_roles, "mrs": cmd_mrs, "details": cmd_details}[sys.argv[1]]()
