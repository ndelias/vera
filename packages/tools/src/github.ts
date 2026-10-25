// Read-only GitHub access for one pull request: what it changes, its
// commits, and the repo's ownership files. A token (GITHUB_TOKEN) is
// optional; without one GitHub allows 60 requests an hour, which is enough
// for a few reviews.

const API = "https://api.github.com";

export type PullRef = { owner: string; repo: string; number: number; url: string };
export type PullFile = { path: string; status: string; additions: number; deletions: number; patch?: string };
export type Pull = {
  ref: PullRef;
  title: string;
  body: string;
  baseRef: string;
  author: string;
  files: PullFile[];
  commitMessages: string[];
};

export class GitHubError extends Error {}

export function parsePullUrl(url: string): PullRef {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url.trim());
  if (!m) throw new GitHubError(`Not a GitHub pull request link: ${url}. Expected https://github.com/<owner>/<repo>/pull/<number>.`);
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]), url: url.trim() };
}

/** Each call reports what it fetched and how long it took, for the trace. */
export type OnCall = (call: { tool: string; input: unknown; ok: boolean; latencyMs: number; summary: string; error?: string }) => void;

export function client(token: string | undefined, onCall: OnCall = () => {}) {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "vera-review", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function get<T>(tool: string, path: string, summarize: (v: T) => string, allow404 = false): Promise<T | null> {
    const t0 = Date.now();
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 404 && allow404) {
      onCall({ tool, input: path, ok: true, latencyMs: Date.now() - t0, summary: "not found" });
      return null;
    }
    if (!res.ok) {
      const limit = res.status === 403 || res.status === 429 ? " GitHub's rate limit may be used up; set GITHUB_TOKEN for more." : "";
      const error = `GitHub ${res.status} for ${path}.${limit}`;
      onCall({ tool, input: path, ok: false, latencyMs: Date.now() - t0, summary: "failed", error });
      throw new GitHubError(error);
    }
    const value = (await res.json()) as T;
    onCall({ tool, input: path, ok: true, latencyMs: Date.now() - t0, summary: summarize(value) });
    return value;
  }

  async function text(tool: string, path: string, ref: string): Promise<string | null> {
    const file = await get<{ content?: string; encoding?: string }>(tool, `${path}?ref=${encodeURIComponent(ref)}`, (f) => (f.content ? "found" : "empty"), true);
    return file?.content && file.encoding === "base64" ? Buffer.from(file.content, "base64").toString("utf8") : null;
  }

  return {
    async pull(ref: PullRef): Promise<Pull> {
      const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
      const pr = (await get<{ title: string; body: string | null; base: { ref: string }; user: { login: string } }>("github.pull", base, (p) => p.title))!;
      const files: PullFile[] = [];
      for (let page = 1; page <= 30; page++) {
        const batch = (await get<{ filename: string; status: string; additions: number; deletions: number; patch?: string }[]>(
          "github.files", `${base}/files?per_page=100&page=${page}`, (b) => `${b.length} files`))!;
        files.push(...batch.map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, ...(f.patch ? { patch: f.patch } : {}) })));
        if (batch.length < 100) break;
      }
      const commits = (await get<{ commit: { message: string } }[]>("github.commits", `${base}/commits?per_page=100`, (c) => `${c.length} commits`))!;
      return { ref, title: pr.title, body: pr.body ?? "", baseRef: pr.base.ref, author: pr.user.login, files, commitMessages: commits.map((c) => c.commit.message) };
    },

    /** `.vera.yml` and CODEOWNERS as they are on the branch the PR merges into. */
    async ownershipFiles(ref: PullRef, baseRef: string): Promise<{ veraYml: string | null; codeowners: string | null }> {
      const contents = `/repos/${ref.owner}/${ref.repo}/contents`;
      const veraYml = await text("github.file", `${contents}/.vera.yml`, baseRef);
      let codeowners: string | null = null;
      for (const p of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) {
        codeowners = await text("github.file", `${contents}/${p}`, baseRef);
        if (codeowners) break;
      }
      return { veraYml, codeowners };
    },
  };
}
