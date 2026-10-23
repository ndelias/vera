"""Study 06 (M2): the team directory the Mapper reads. See studies/06-agents/DESIGN.md.

GitLab's public data/stages.yml (gitlab-com/www-gitlab-com) as it stood at
the start of each month: every team (group), its stage and section, its
product areas (categories) and focus, and which roles it has (PM,
designers, technical writer). People's names are dropped. Written to
research/data/directory/<YYYY-MM>.json (gitignored with the rest of data/).

    python3 research/pipeline/collect_directory.py
"""

import json
import re
import urllib.parse

from collect_gitlab import get, months
from db import ROOT

PROJECT = urllib.parse.quote("gitlab-com/www-gitlab-com", safe="")
FILE = "data/stages.yml"
OUT = ROOT / "data" / "directory"
# Fields naming who fills a review role; each may be one value or a list.
ROLE_OF = {"pm": "product", "tech_writer": "docs", "ux": "design", "pdm": "design"}


def parse(text: str) -> list[dict]:
    """The parts of stages.yml the Mapper needs. Stdlib only, so this reads
    the file's fixed layout (2 spaces per level) rather than all of YAML."""
    teams, stage, section, group, field = [], None, None, None, None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        body = line.strip()
        if indent == 2 and body.endswith(":"):
            stage, section, group = {"key": body[:-1], "name": body[:-1]}, None, None
        elif stage and indent == 4 and body.startswith("display_name:"):
            stage["name"] = body.split(":", 1)[1].strip().strip('"')
        elif stage and indent == 4 and body.startswith("section:"):
            section = body.split(":", 1)[1].strip().strip('"')
        elif stage and indent == 6 and body.endswith(":"):
            group = {"key": body[:-1], "name": body[:-1], "stage": stage["name"], "section": section,
                     "focus": "", "categories": [], "roles": []}
            teams.append(group)
            field = None
        elif group and indent == 8:
            key, _, value = body.partition(":")
            value = value.strip().strip('"')
            field = key
            if key == "name":
                group["name"] = value
            elif key == "focus":
                group["focus"] = value
            elif key in ROLE_OF and value and value.upper() != "TBD":
                group["roles"].append(ROLE_OF[key])
        elif group and indent == 10 and body.startswith("- ") and field:
            item = body[2:].strip().strip('"')
            if field == "categories":
                group["categories"].append(item)
            elif field in ROLE_OF and item and item.upper() != "TBD":
                group["roles"].append(ROLE_OF[field])
    for t in teams:
        t["roles"] = sorted(set(t["roles"]))
    return teams


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for lo, _ in months("2025-10-01", "2026-10-19"):
        commits, _ = get(f"projects/{PROJECT}/repository/commits",
                         {"ref_name": "master", "path": FILE, "until": lo, "per_page": 1})
        sha = commits[0]["id"]
        text = get(f"projects/{PROJECT}/repository/files/{urllib.parse.quote(FILE, safe='')}/raw", {"ref": sha}, raw=True).decode()
        teams = parse(text)
        (OUT / f"{lo[:7]}.json").write_text(json.dumps({"as_of": lo[:10], "commit": sha, "teams": teams}, indent=1))
        print(f"{lo[:7]}: {len(teams)} teams (commit {sha[:8]})", flush=True)


if __name__ == "__main__":
    main()
