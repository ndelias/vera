// GitHub access for one pull request: what it changes, its commits, reviews
// and comments, and the repo's ownership files. Reading needs no token
// (GitHub allows 60 requests an hour without one); Vera's only writes are
// its own comment, its sign-off check and a reaction to sign-off comments.

const API = "https://api.github.com";

export type PullRef = { owner: string; repo: string; number: number; url: string };
export type PullFile = { path: string; status: string; additions: number; deletions: number; patch?: string };
export type Pull = {
  ref: PullRef;
  title: string;
  body: string;
  baseRef: string;
  headSha: string;
  author: string;
  files: PullFile[];
  commitMessages: string[];
};

export type PullReview = { who: string; state: string; trusted: boolean; at: string };
export type Comment = { id: number; who: string; body: string; trusted: boolean; at: string };
export type Check = { conclusion: "success" | "neutral" | "failure"; title: string; summary: string };

export class GitHubError extends Error {}

// Owners, members and collaborators can write to the repo; anyone else can only comment.
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

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

  async function send(tool: string, method: string, path: string, body: unknown, what: string): Promise<unknown> {
    if (!token) throw new GitHubError(`${what} needs GITHUB_TOKEN (a token that can write to the repo).`);
    const t0 = Date.now();
    const res = await fetch(`${API}${path}`, { method, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    onCall({ tool, input: path, ok: res.ok, latencyMs: Date.now() - t0, summary: res.ok ? "done" : "failed", ...(res.ok ? {} : { error: `GitHub ${res.status}` }) });
    if (!res.ok) throw new GitHubError(`GitHub ${res.status}: ${what} failed. The token may not be allowed to do this on the repo.`);
    return res.json();
  }

  async function all<T>(tool: string, path: string): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 30; page++) {
      const batch = (await get<T[]>(tool, `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`, (b) => `${b.length} items`))!;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  async function comments(ref: PullRef): Promise<Comment[]> {
    const raw = await all<{ id: number; user: { login: string } | null; body: string | null; author_association: string; created_at: string }>(
      "github.comments", `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`);
    return raw.map((c) => ({ id: c.id, who: c.user?.login ?? "ghost", body: c.body ?? "", trusted: TRUSTED.has(c.author_association), at: c.created_at }));
  }

  async function text(tool: string, path: string, ref: string): Promise<string | null> {
    const file = await get<{ content?: string; encoding?: string }>(tool, `${path}?ref=${encodeURIComponent(ref)}`, (f) => (f.content ? "found" : "empty"), true);
    return file?.content && file.encoding === "base64" ? Buffer.from(file.content, "base64").toString("utf8") : null;
  }

  return {
    async pull(ref: PullRef): Promise<Pull> {
      const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
      const pr = (await get<{ title: string; body: string | null; base: { ref: string }; head: { sha: string }; user: { login: string } }>("github.pull", base, (p) => p.title))!;
      const files = (await all<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>("github.files", `${base}/files`))
        .map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, ...(f.patch ? { patch: f.patch } : {}) }));
      const commits = (await get<{ commit: { message: string } }[]>("github.commits", `${base}/commits?per_page=100`, (c) => `${c.length} commits`))!;
      return { ref, title: pr.title, body: pr.body ?? "", baseRef: pr.base.ref, headSha: pr.head.sha, author: pr.user.login, files, commitMessages: commits.map((c) => c.commit.message) };
    },

    comments,

    /** Submitted reviews, oldest first. */
    async reviews(ref: PullRef): Promise<PullReview[]> {
      const raw = await all<{ user: { login: string } | null; state: string; author_association: string; submitted_at?: string }>("github.reviews", `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`);
      return raw.map((r) => ({ who: r.user?.login ?? "ghost", state: r.state, trusted: TRUSTED.has(r.author_association), at: r.submitted_at ?? "" }));
    },

    /** Posts Vera's comment on the PR, or updates the one it posted before
     * (found by a hidden marker), so a PR never collects a pile of them.
     * Needs a token that can write to the repo. */
    async comment(ref: PullRef, body: string, marker: string): Promise<string> {
      const base = `/repos/${ref.owner}/${ref.repo}/issues`;
      const existing = (await comments(ref)).find((c) => c.body.includes(marker));
      const posted = existing
        ? await send("github.comment.update", "PATCH", `${base}/comments/${existing.id}`, { body }, "Updating Vera's comment")
        : await send("github.comment.create", "POST", `${base}/${ref.number}/comments`, { body }, "Posting Vera's comment");
      return (posted as { html_url: string }).html_url;
    },

    /** Creates the named check on a commit, or updates the one already
     * there, so a commit shows one "Vera: sign-off" however often it runs.
     * Needs `checks: write`. */
    async check(ref: PullRef, sha: string, name: string, c: Check): Promise<string> {
      const base = `/repos/${ref.owner}/${ref.repo}`;
      const runs = (await get<{ check_runs: { id: number; name: string }[] }>("github.checks", `${base}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}`, (r) => `${r.check_runs.length} runs`))!.check_runs;
      const body = { name, status: "completed", conclusion: c.conclusion, output: { title: c.title, summary: c.summary } };
      const done = runs[0]
        ? await send("github.check.update", "PATCH", `${base}/check-runs/${runs[0].id}`, body, `Updating the ${name} check`)
        : await send("github.check.create", "POST", `${base}/check-runs`, { ...body, head_sha: sha }, `Creating the ${name} check`);
      return (done as { html_url: string }).html_url;
    },

    /** Reacts to a comment, so the person who wrote it sees Vera read it. */
    async react(ref: PullRef, commentId: number, content: "+1" | "confused"): Promise<void> {
      await send("github.react", "POST", `/repos/${ref.owner}/${ref.repo}/issues/comments/${commentId}/reactions`, { content }, "Reacting to the comment");
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
