"""Study 05 (M1): the evals, the rules baselines and the scorer.
See studies/05-evals/DESIGN.md.

    python3 research/pipeline/evals.py build      # gold labels per MR (ev_mrs)
    python3 research/pipeline/evals.py baselines  # B0, B1, B2 predictions (ev_predictions)
    python3 research/pipeline/evals.py check      # the fix-up label check sheet (gitignored)
    python3 research/pipeline/evals.py score      # every system's scores (ev_scores), printed

No model anywhere. The M2 agents write their predictions to ev_predictions
under their own system name, and `score` scores them the same way.
"""

import json
import math
import random
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

from db import ROOT, connect

SPLIT = int(datetime(2026, 4, 19, tzinfo=timezone.utc).timestamp())  # test from here on
ROLES = ("design", "product", "docs")
# Study 02's roles, as named here: GitLab files technical writers under
# marketing, and they are most of its reviewers on product MRs (DESIGN.md).
SOURCE_ROLE = {"design": "design", "product": "product", "docs": "marketing"}
WEEK = 7 * 24 * 3600
SEED = 20261022
MIN_POSITIVES = 30
LEAD_BUDGET = 1 / 6  # at most this share of MRs become a question to a lead (BUILD-PLAN, Routing)
FIX = re.compile(r"\bfix(es|ed)?\b|\brevert", re.I)
MAX_FILES = 30
# Files everyone touches: sharing one says nothing about a fix.
SHARED = re.compile(r"(^|/)(Gemfile\.lock|yarn\.lock|package-lock\.json|[^/]+\.lock)$|^locale/gitlab\.pot$|^db/structure\.sql$|^db/schema_migrations/")
CHECK_PATH = ROOT / "data" / "fixup-check.json"  # has titles: stays out of git
VERDICTS_PATH = ROOT / "studies" / "05-evals" / "fixup-verdicts.json"  # ids and verdicts only


def label(labels: str, prefix: str) -> str | None:
    found = [l[len(prefix):] for l in (labels or "").split(",") if l.startswith(prefix)]
    return found[0] if len(found) == 1 else None


# ---------- build: one row per MR with its gold labels ----------

def cmd_build() -> None:
    conn = connect()
    conn.executescript("""
      DROP TABLE IF EXISTS ev_mrs;
      CREATE TABLE ev_mrs (
        mr_id TEXT PRIMARY KEY, split TEXT, grp TEXT, devops TEXT,
        design INTEGER, product INTEGER, docs INTEGER,
        files INTEGER, lines INTEGER, ai INTEGER, fixup INTEGER, fixup_kind TEXT, fixup_by TEXT
      );
    """)
    rows = conn.execute("""
      SELECT m.id, m.created_at, m.merged_at, m.title, m.labels, m.reviewer_roles, s.ai_marker
      FROM s3_mrs s JOIN gl_mrs m ON m.id = s.mr_id
      WHERE s.mr_id IN (SELECT mr_id FROM ev_files_done)
    """).fetchall()
    reverts = defaultdict(list)  # 'revert "<title>"' → merge times, from every product MR
    for t, merged in conn.execute("SELECT title, merged_at FROM gl_mrs WHERE project = 'product' AND title LIKE 'Revert \"%' AND merged_at IS NOT NULL"):
        reverts[t.lower()].append(merged)
    # Fix-like MRs by path (collect_evals.py fixes): path → [(mr_id, merged_at)].
    fixes = defaultdict(list)
    for mr_id, path, merged in conn.execute("SELECT f.mr_id, f.path, m.merged_at FROM ev_fix_files f JOIN gl_mrs m ON m.id = f.mr_id"):
        if not SHARED.search(path):
            fixes[path].append((mr_id, merged))
    # A fix made after the last MR in the data would be missed: only MRs with a full week after them count.
    data_end = conn.execute("SELECT MAX(created_at) FROM gl_mrs WHERE project = 'product'").fetchone()[0]
    for mr_id, created, merged, title, labels, roles, ai in rows:
        files, lines = conn.execute("SELECT COUNT(*), COALESCE(SUM(added + deleted), 0) FROM ev_files WHERE mr_id = ? AND generated = 0", (mr_id,)).fetchone()
        paths = [p for p, in conn.execute("SELECT path FROM ev_files WHERE mr_id = ? AND generated = 0", (mr_id,)) if not SHARED.search(p)]
        roles = set((roles or "").split(","))
        fixup = kind = by = None
        if paths and len(paths) <= MAX_FILES and merged + WEEK <= data_end:
            fixup = 0
            if any(merged < t <= merged + WEEK for t in reverts.get(f'revert "{title.lower()}"', [])):
                fixup, kind = 1, "revert"
            else:
                hits = sorted((m, other) for p in paths for other, m in fixes.get(p, []) if other != mr_id and merged < m <= merged + WEEK)
                if hits:
                    fixup, kind, by = 1, "fix", hits[0][1]
        conn.execute("INSERT INTO ev_mrs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            mr_id, "train" if created < SPLIT else "test", label(labels, "group::"), label(labels, "devops::"),
            *(int(SOURCE_ROLE[r] in roles) for r in ROLES), files, lines, int(bool(ai)), fixup, kind, by))
    conn.commit()
    for split, n, g, fx, lab in conn.execute("SELECT split, COUNT(*), COUNT(grp), SUM(fixup), COUNT(fixup) FROM ev_mrs GROUP BY split"):
        print(f"{split}: {n} MRs, {g} with one group, {fx or 0} fix-ups of {lab} labelled")


# ---------- baselines ----------

def dirs(path: str) -> list[str]:
    """The file's directories, deepest first; "" is the repo root."""
    parts = path.split("/")[:-1]
    return ["/".join(parts[:i]) for i in range(len(parts), -1, -1)]


def mr_files(conn) -> dict[str, list[tuple[str, int, int]]]:
    """Per MR: (path, weight, new_file) for its non-generated files, or all of them if every file is generated."""
    out, gen = defaultdict(list), defaultdict(list)
    for mr_id, path, lines, new, generated in conn.execute("SELECT mr_id, path, added + deleted, new_file, generated FROM ev_files"):
        (gen if generated else out)[mr_id].append((path, lines + 1, new))
    for mr_id, fs in gen.items():
        out.setdefault(mr_id, fs)
    return out


def cmd_baselines() -> None:
    conn = connect()
    mrs = conn.execute("SELECT mr_id, split, grp, design, product, docs FROM ev_mrs").fetchall()
    gold = {m[0]: m for m in mrs}
    files = mr_files(conn)
    train = [m for m in mrs if m[1] == "train"]

    # B1: which train MRs touched each directory.
    seen: dict[str, set[str]] = defaultdict(set)
    for m in train:
        for path, _, _ in files[m[0]]:
            for d in dirs(path):
                seen[d].add(m[0])
    majority = Counter(m[2] for m in train if m[2]).most_common(1)[0][0]

    def b1(mr_id: str, leave_out: str | None):
        """Each file votes with its deepest directory seen in train (without leave_out), weighted by lines."""
        groups, roles, weight = Counter(), Counter(), 0
        for path, w, _ in files[mr_id]:
            for d in dirs(path):
                ids = seen.get(d, set()) - {leave_out}
                if not ids:
                    continue
                grp = Counter(gold[i][2] for i in ids if gold[i][2])
                total = sum(grp.values())
                for g, c in grp.items():
                    groups[g] += w * c / total
                for k, r in enumerate(ROLES):
                    roles[r] += w * sum(gold[i][3 + k] for i in ids) / len(ids)
                weight += w
                break
        ranked = [g for g, _ in groups.most_common()] or [majority]
        return ranked, {r: roles[r] / weight if weight else 0.0 for r in ROLES}

    # Routing thresholds: best F1 on train, each train MR scored without itself.
    train_scores = {m[0]: b1(m[0], m[0])[1] for m in train}
    threshold = {}
    for k, r in enumerate(ROLES):
        best = (0.0, 1.0)
        for t in sorted({round(s[r], 3) for s in train_scores.values()} - {0.0}):
            tp = sum(1 for m in train if m[3 + k] and train_scores[m[0]][r] >= t)
            fp = sum(1 for m in train if not m[3 + k] and train_scores[m[0]][r] >= t)
            fn = sum(1 for m in train if m[3 + k] and train_scores[m[0]][r] < t)
            f1 = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
            if f1 > best[0]:
                best = (f1, t)
        threshold[r] = best[1]
    print("B1 routing thresholds (picked on train):", threshold)

    # B1-ask: between f × threshold and threshold, ask the lead. f is the
    # lowest that keeps escalated train MRs within the lead budget.
    def asks(scores: dict, f: float) -> list[str]:
        return [r for r in ROLES if f * threshold[r] <= scores[r] < threshold[r]]

    factor = 1.0
    for f in (x / 100 for x in range(100, -1, -1)):
        if sum(1 for sc in train_scores.values() if asks(sc, f)) / len(train_scores) > LEAD_BUDGET:
            break
        factor = f
    print(f"B1-ask: ask the lead from {factor:.2f} × threshold")

    def b2(mr_id: str) -> list[str]:
        """The day-one .vera.yml rules, as written in DESIGN.md before the data."""
        out = set()
        for path, _, new in files[mr_id]:
            if path.endswith((".vue", ".scss", ".haml")) or path.startswith(("app/assets/", "app/views/", "app/components/")):
                out.add("design")
            if (new and path.startswith(("config/feature_flags/", "ee/config/feature_flags/"))) or path.startswith("config/metrics/"):
                out.add("product")
            if path.startswith("doc/") and not path.startswith("doc/api/graphql/reference/"):
                out.add("docs")
        return sorted(out)

    preds = []
    for m in mrs:
        ranked, roles = b1(m[0], None)
        preds += [
            ("B0", "mapping", m[0], json.dumps([majority])),
            ("B0", "routing", m[0], json.dumps([])),
            ("B1", "mapping", m[0], json.dumps(ranked[:3])),
            ("B1", "routing", m[0], json.dumps([r for r in ROLES if roles[r] >= threshold[r]])),
            ("B1-ask", "routing", m[0], json.dumps({"route": [r for r in ROLES if roles[r] >= threshold[r]], "ask": asks(roles, factor)})),
            ("B2", "routing", m[0], json.dumps(b2(m[0]))),
        ]
    conn.execute("DELETE FROM ev_predictions WHERE system IN ('B0', 'B1', 'B1-ask', 'B2')")
    conn.executemany("INSERT INTO ev_predictions VALUES (?, ?, ?, ?)", preds)
    conn.commit()
    print(f"{len(preds)} predictions written")


# ---------- the fix-up label check ----------

def later_mrs(n: int, merged: int, paths: list[str]) -> tuple[list[dict], int]:
    """Every MR merged in the week after MR n that touched one of its paths, by
    file history. Slow on GitLab's side, so only for the check's negatives;
    returns the MRs and how many path queries failed."""
    base = "https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab"
    iso = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def fetch(url: str):
        req = urllib.request.Request(url, headers={"User-Agent": "blast-radius-research"})
        with urllib.request.urlopen(req, timeout=120) as res:
            return json.loads(res.read())

    shas, failed = {}, 0
    for path in paths:
        q = urllib.parse.urlencode({"ref_name": "master", "path": path, "since": iso(merged), "until": iso(merged + WEEK), "per_page": 100})
        try:
            for c in fetch(f"{base}/repository/commits?{q}"):
                shas.setdefault(c["id"], set()).add(path)
        except OSError:
            failed += 1
    out = {}
    for sha, shared in shas.items():
        for o in fetch(f"{base}/repository/commits/{sha}/merge_requests"):
            when = o.get("merged_at")
            when = int(datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp()) if when else None
            if o["iid"] != n and when and merged < when <= merged + WEEK:
                out.setdefault(o["iid"], {"iid": o["iid"], "title": o["title"], "labels": o.get("labels"), "shared": set()})["shared"] |= shared
    return [dict(v, shared=sorted(v["shared"])) for v in out.values()], failed


def cmd_check() -> None:
    conn = connect()
    rng = random.Random(SEED)
    pos = [r[0] for r in conn.execute("SELECT mr_id FROM ev_mrs WHERE fixup = 1 ORDER BY mr_id")]
    neg = [r[0] for r in conn.execute("SELECT mr_id FROM ev_mrs WHERE fixup = 0 ORDER BY mr_id")]
    sheet = []
    for kind, ids in (("positive", rng.sample(pos, min(50, len(pos)))), ("negative", rng.sample(neg, min(50, len(neg))))):
        for mr_id in ids:
            title, labels, merged = conn.execute("SELECT title, labels, merged_at FROM gl_mrs WHERE id = ?", (mr_id,)).fetchone()
            fixup_kind, by = conn.execute("SELECT fixup_kind, fixup_by FROM ev_mrs WHERE mr_id = ?", (mr_id,)).fetchone()
            paths = [p for p, in conn.execute("SELECT path FROM ev_files WHERE mr_id = ? AND generated = 0", (mr_id,)) if not SHARED.search(p)]
            entry = {"mr_id": mr_id, "label": kind, "title": title, "labels": labels, "files": paths}
            if kind == "positive":
                entry["kind"] = fixup_kind
                if by:
                    t, l = conn.execute("SELECT title, labels FROM gl_mrs WHERE id = ?", (by,)).fetchone()
                    shared = sorted(set(paths) & {p for p, in conn.execute("SELECT path FROM ev_fix_files WHERE mr_id = ?", (by,))})
                    entry["fix"] = {"mr_id": by, "title": t, "labels": l, "shared": shared}
            else:
                entry["later_mrs"], entry["failed_queries"] = later_mrs(int(mr_id.split("!")[1]), merged, paths)
                print(f"{mr_id}: {len(entry['later_mrs'])} later MRs, {entry['failed_queries']} queries failed", flush=True)
            sheet.append(entry)
            # Written as it goes: the negatives' file-history queries are slow.
            CHECK_PATH.write_text(json.dumps(sheet, indent=1))
    print(f"{len(sheet)} MRs to judge in {CHECK_PATH}; verdicts go in {VERDICTS_PATH}")


# ---------- scoring ----------

def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (math.nan, math.nan)
    p, z = k / n, 1.96
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def auc(scores: list[float], labels: list[int]) -> float:
    """ROC AUC by ranks, ties averaged."""
    pairs = sorted(zip(scores, labels))
    pos = sum(labels)
    neg = len(labels) - pos
    if not pos or not neg:
        return math.nan
    rank_sum, i = 0.0, 0
    while i < len(pairs):
        j = i
        while j < len(pairs) and pairs[j][0] == pairs[i][0]:
            j += 1
        rank_sum += sum(l for _, l in pairs[i:j]) * (i + j + 1) / 2
        i = j
    return (rank_sum - pos * (pos + 1) / 2) / (pos * neg)


def bootstrap(values: list, stat, rng: random.Random, n: int = 2000) -> tuple[float, float]:
    out = sorted(stat([values[rng.randrange(len(values))] for _ in values]) for _ in range(n))
    return out[int(0.025 * n)], out[int(0.975 * n) - 1]


def cmd_score() -> None:
    conn = connect()
    conn.execute("DELETE FROM ev_scores")  # the table is in schema.sql
    test = {r[0]: r for r in conn.execute("SELECT mr_id, grp, devops, design, product, docs, lines, files, ai, fixup FROM ev_mrs WHERE split = 'test'")}
    train_groups = {g for g, in conn.execute("SELECT DISTINCT grp FROM ev_mrs WHERE split = 'train' AND grp IS NOT NULL")}
    preds = defaultdict(dict)
    for system, task, mr_id, p in conn.execute("SELECT system, task, mr_id, prediction FROM ev_predictions"):
        if mr_id in test:
            preds[(system, task)][mr_id] = json.loads(p)
    rows = []

    for (system, task), by_mr in sorted(preds.items()):
        if task == "mapping":
            # Also scored on teams that existed in train: GitLab reorganized
            # during the year, and no lookup can name a team it never saw.
            for subset, keep in (("group", lambda g: True), ("group_seen", lambda g: g in train_groups)):
                scored = [(test[m][1], p) for m, p in by_mr.items() if test[m][1] and keep(test[m][1])]
                n = len(scored)
                for metric, k in (("top1", sum(p[:1] == [g] for g, p in scored)), ("recall@3", sum(g in p[:3] for g, p in scored))):
                    rows.append((system, task, metric, subset, k / n, *wilson(k, n), n))
        elif task == "routing":
            # A plain list is "route to these"; {"route", "ask"} adds asking the lead.
            asked = {m: set(p["ask"]) for m, p in by_mr.items()} if isinstance(next(iter(by_mr.values())), dict) else None
            if asked is not None:
                by_mr = {m: p["route"] for m, p in by_mr.items()}
                k = sum(1 for a in asked.values() if a)
                rows.append((system, task, "ask_rate", "any", k / len(asked), *wilson(k, len(asked)), len(asked)))
            for i, r in enumerate(ROLES):
                gold = {m: test[m][3 + i] for m in by_mr}
                pos = sum(gold.values())
                tp = sum(1 for m, p in by_mr.items() if gold[m] and r in p)
                fp = sum(1 for m, p in by_mr.items() if not gold[m] and r in p)
                if pos < MIN_POSITIVES:
                    rows.append((system, task, "too_rare", r, pos, None, None, pos))
                    continue
                rows.append((system, task, "recall", r, tp / pos, *wilson(tp, pos), pos))
                rows.append((system, task, "precision", r, tp / (tp + fp) if tp + fp else math.nan, *wilson(tp, tp + fp), tp + fp))
                rows.append((system, task, "f1", r, 2 * tp / (pos + tp + fp) if tp else 0.0, None, None, pos))
                if asked is not None:
                    caught = sum(1 for m in by_mr if gold[m] and (r in by_mr[m] or r in asked[m]))
                    rows.append((system, task, "recall_with_ask", r, caught / pos, *wilson(caught, pos), pos))

    # Fix-ups: the label failed its check (DESIGN.md), so only the check's
    # result is kept, and the fallback is scored: review comments per 100 lines.
    verdicts = json.loads(VERDICTS_PATH.read_text())["summary"] if VERDICTS_PATH.exists() else None
    if verdicts:
        k, n = verdicts["real"], verdicts["positives_judged"]
        rows.append(("label:fixup-v1", "fixup", "share_real", "positives", k / n, *wilson(k, n), n))
    rng = random.Random(SEED)
    rates = conn.execute("""
      SELECT e.ai, 100.0 * m.notes_n / e.lines FROM ev_mrs e JOIN gl_mrs m ON m.id = e.mr_id
      WHERE e.lines > 0 AND m.notes_n IS NOT NULL""").fetchall()
    median = lambda v: sorted(v)[len(v) // 2]
    for subset, vals in (("all", [r for _, r in rates]), ("ai", [r for a, r in rates if a]), ("not_ai", [r for a, r in rates if not a])):
        rows.append(("data", "attention", "comments_per_100_lines", subset, median(vals), *bootstrap(vals, median, rng), len(vals)))

    conn.executemany("INSERT INTO ev_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
    conn.commit()
    for r in rows:
        ci = f" [{r[5]:.3f}, {r[6]:.3f}]" if r[5] is not None and not math.isnan(r[5]) else ""
        print(f"{r[0]:<13} {r[1]:<8} {r[2]:<10} {r[3]:<10} {r[4]:.3f}{ci}  n={r[7]}")


if __name__ == "__main__":
    {"build": cmd_build, "baselines": cmd_baselines, "check": cmd_check, "score": cmd_score}[sys.argv[1]]()
