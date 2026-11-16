// The team's GitHub App, which the server acts as on GitHub: it reads pull
// requests and posts the sign-offs people make in Slack. Comments it posts
// show as "<app>[bot]", and the Action counts a Slack sign-off only from
// that author (packages/rules/src/slack-signoff.ts). Its tokens last an hour
// and are made on demand, so there's nothing to rotate. Plain node:crypto,
// no dependencies (Nahuel's call, 6 Nov 2026).

import { createSign } from "node:crypto";
import type { Fetch } from "./slack.ts";

export type AppCreds = { appId: string; privateKey: string };
const API = "https://api.github.com";
const HEADERS = { accept: "application/vnd.github+json", "user-agent": "vera-slack", "x-github-api-version": "2022-11-28" };

/** The app's own short-lived proof of identity (a JWT, RS256), good for asking for repo tokens. */
export function appJwt(c: AppCreds, nowMs = Date.now()): string {
  const now = Math.floor(nowMs / 1000);
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  // A minute back for clock drift; GitHub allows ten minutes at most.
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iat: now - 60, exp: now + 540, iss: c.appId })}`;
  // Vercel's form keeps line breaks, but a key pasted as one line has "\n" in it.
  const key = c.privateKey.includes("\\n") ? c.privateKey.replace(/\\n/g, "\n") : c.privateKey;
  return `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url")}`;
}

/** Hands out a token for a repo the app is installed on, reusing it until five minutes before it runs out. */
export function appTokens(c: AppCreds, fetchImpl: Fetch = fetch) {
  const cache = new Map<string, { token: string; until: number }>();
  async function call<T>(method: string, path: string, jwt: string): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, { method, headers: { ...HEADERS, authorization: `Bearer ${jwt}` } });
    if (res.status === 404 && path.endsWith("/installation")) throw new Error(`the GitHub App isn't installed on ${path.split("/").slice(2, 4).join("/")}`);
    if (!res.ok) throw new Error(`GitHub ${res.status} for the app's ${path.endsWith("/installation") ? "installation" : "token"}. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY`);
    return (await res.json()) as T;
  }
  return async (owner: string, repo: string, nowMs = Date.now()): Promise<string> => {
    const key = `${owner}/${repo}`.toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.until > nowMs) return hit.token;
    const jwt = appJwt(c, nowMs);
    const { id } = await call<{ id: number }>("GET", `/repos/${owner}/${repo}/installation`, jwt);
    const t = await call<{ token: string; expires_at: string }>("POST", `/app/installations/${id}/access_tokens`, jwt);
    cache.set(key, { token: t.token, until: Date.parse(t.expires_at) - 5 * 60_000 });
    return t.token;
  };
}
