// GitLab's public API for the eval runners: a merge request's changed files
// and its description, cached under research/data/raw (gitignored).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChangedFile } from "../mapper.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RAW = join(ROOT, "research/data/raw");
const DIFFS = join(RAW, "diffs");
const MRS = join(RAW, "mrs");
const GITLAB = "https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab";

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": "blast-radius-research" } });
  if (!res.ok) throw new Error(`GitLab ${res.status} for ${url}`);
  return res;
}

type GitLabDiff = { new_path: string; old_path: string; deleted_file: boolean; diff: string; generated_file?: boolean; too_large?: boolean };

export async function files(mrId: string): Promise<ChangedFile[]> {
  const iid = mrId.split("!")[1];
  const cache = join(DIFFS, `${iid}.json`);
  if (!existsSync(cache)) {
    const all: GitLabDiff[] = [];
    for (let page = 1; page <= 30; page++) {
      const res = await get(`${GITLAB}/merge_requests/${iid}/diffs?per_page=100&page=${page}`);
      all.push(...((await res.json()) as GitLabDiff[]));
      if (!res.headers.get("x-next-page")) break;
    }
    mkdirSync(DIFFS, { recursive: true });
    writeFileSync(cache, JSON.stringify(all));
  }
  const raw = JSON.parse(readFileSync(cache, "utf8")) as GitLabDiff[];
  return raw.map((d) => ({
    path: d.deleted_file ? d.old_path : d.new_path,
    diff: d.diff ?? "",
    generated: Boolean(d.generated_file),
    tooLarge: Boolean(d.too_large),
  }));
}


/** A merge request's title and description. */
export async function details(mrId: string): Promise<{ title: string; description: string }> {
  const iid = mrId.split("!")[1];
  const cache = join(MRS, `${iid}.json`);
  if (!existsSync(cache)) {
    const mr = (await (await get(`${GITLAB}/merge_requests/${iid}`)).json()) as { title: string; description: string | null };
    mkdirSync(MRS, { recursive: true });
    writeFileSync(cache, JSON.stringify({ title: mr.title, description: mr.description ?? "" }));
  }
  return JSON.parse(readFileSync(cache, "utf8")) as { title: string; description: string };
}
