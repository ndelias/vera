#!/usr/bin/env node
// vera review <pull request URL> [--config .vera.yml] [--markdown | --comment] [--model claude-sonnet-5-5] [--out .vera/runs]
//   --markdown prints the review as a GitHub comment; --comment posts it (or updates Vera's earlier
//   one) and the "Vera: sign-off" check.
// vera sign-off <pull request URL> [--comment-id <id>]
//   Updates the sign-off check from the PR's approvals and `/vera sign-off` comments. No model calls.
//
// review needs ANTHROPIC_API_KEY (your own key; a review costs about 1-2 cents).
// GITHUB_TOKEN is optional for reading and raises GitHub's limit from 60 requests an hour;
// posting the comment and the check needs one that can write to the repo.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secret, toJsonl, totals } from "@vera/core";
import { review, type Review } from "./review.ts";
import { MARKER, toMarkdown } from "./markdown.ts";
import { CHECK, readPlan, status, statusBlock, toCheck, withStatus } from "./signoff.ts";
import { counts, parseSignoff, type Signoff } from "@vera/rules";
import { client as github, parsePullUrl, type PullRef } from "@vera/tools/github";

const USAGE = `Usage: vera review <GitHub pull request URL> [--config .vera.yml] [--markdown | --comment] [--model claude-sonnet-5-5] [--out .vera/runs]
       vera sign-off <GitHub pull request URL> [--comment-id <id>]`;

function optional(name: string): string | undefined {
  try {
    return secret(name);
  } catch {
    return undefined;
  }
}

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function print(r: Review, tracePath: string) {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const lines = [
    `Vera · ${r.pull.ref.owner}/${r.pull.ref.repo}#${r.pull.ref.number}: ${r.pull.title}`,
    `  ${r.pull.files.length} ${r.pull.files.length === 1 ? "file" : "files"}, +${add} -${del}${r.ai.length ? ` · likely AI-written: ${r.ai.join("; ")}` : ""}`,
    `  Owners from ${r.ownership.source === "none" ? "nothing declared" : `${r.ownership.source} (${r.ownership.areas.length} areas, ${r.ownership.people.length} people)`}`,
    ...(r.ownershipError ? [`  .vera.yml skipped: ${r.ownershipError}`] : []),
    "",
    "Touches",
    ...(!r.areas ? ["  (the Mapper gave no answer)"] : r.areas.teams.length ? r.areas.teams.flatMap((a) => [`  ${a.team} (${a.confidence})`, `      ${a.reason}`]) : ["  None of the declared areas fit this change."]),
    "",
    `Design decision: ${r.design ? `${r.design.visible ? "yes" : "no"} (${r.design.confidence}). ${r.design.what}` : "(no answer)"}`,
    "",
    "Where to look first (engineer)",
    ...(!r.brief ? ["  (the Briefer gave no answer)"] : [
      ...(r.brief.summary ? [`  ${r.brief.summary}`] : []),
      ...r.brief.places.flatMap((p, i) => [`  ${i + 1}. ${p.risk.padEnd(6)} ${p.file} ${p.lines}`, `      ${sentence(p.what)} ${p.why}`]),
    ]),
    "",
    "Who to ask",
    ...(r.plan.asks.length ? r.plan.asks.map((a) => `  ${a.who.padEnd(20)} ${a.role.padEnd(9)} ${{ ask: "ask", "ask-lead": "ask, as lead", suggest: "possible owner" }[a.action].padEnd(15)} ${a.why}`) : ["  Nobody named."]),
    ...(r.plan.notes.length ? ["", "Notes", ...r.plan.notes.map((n) => `  ${n}`)] : []),
    "",
    `$${t.costUsd.toFixed(4)} · ${t.modelCalls} model calls · ${t.toolCalls} GitHub calls · ${(t.latencyMs / 1000).toFixed(1)} s · trace ${tracePath}`,
  ];
  console.log(lines.join("\n"));
}

/** Updates the sign-off check. It's a side job: if the token can't write
 * checks, the review still stands, so this warns instead of failing. */
async function writeCheck(token: string | undefined, ref: PullRef, sha: string, s: Signoff) {
  try {
    const url = await github(token).check(ref, sha, CHECK, toCheck(s));
    console.log(`Sign-off: ${toCheck(s).title} (${url})`);
  } catch (e) {
    const hint = process.env.GITHUB_ACTIONS
      ? " Add `checks: write` to the workflow's permissions."
      : " GitHub only lets apps write checks, so this part works in GitHub Actions, not with a personal token.";
    console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}The ${CHECK} check wasn't updated: ${(e as Error).message}${hint}`);
  }
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
if (!["review", "sign-off"].includes(args[0] ?? "") || !args[1]) {
  console.error(USAGE);
  process.exit(2);
}

if (args[0] === "sign-off") {
  const token = optional("GITHUB_TOKEN");
  try {
    const ref = parsePullUrl(args[1]);
    const gh = github(token);
    const [pull, comments] = await Promise.all([gh.pull(ref), gh.comments(ref)]);
    const vera = comments.find((c) => c.body.includes(MARKER));
    const asks = vera && readPlan(vera.body);
    if (!asks) {
      console.log(vera ? "Vera's comment here predates sign-off; its next review adds the check." : "Vera hasn't reviewed this pull request yet, so there's no sign-off to update.");
      process.exit(0);
    }
    const s = status(asks, pull.author, await gh.reviews(ref), comments, MARKER);
    await writeCheck(token, ref, pull.headSha, s);
    // The comment's status block too, so it doesn't say "waiting" after someone signed off.
    const body = withStatus(vera.body, statusBlock(s, asks));
    if (body && body !== vera.body) await gh.comment(ref, body, MARKER).catch((e) => console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Vera's comment wasn't updated: ${(e as Error).message}`));
    // A thumbs-up tells the person their sign-off counted; a confused face, that it didn't.
    const id = Number(flag("--comment-id", ""));
    const c = comments.find((x) => x.id === id);
    const roles = c && parseSignoff(c.body);
    if (c && roles) await gh.react(ref, c.id, counts(asks, pull.author, c.who, c.trusted, roles) ? "+1" : "confused").catch(() => {});
  } catch (e) {
    console.error(`vera: ${(e as Error).message}`);
    process.exit(1);
  }
  process.exit(0);
}
const out = flag("--out", ".vera/runs");
let apiKey: string;
try {
  apiKey = secret("ANTHROPIC_API_KEY");
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
const githubToken = optional("GITHUB_TOKEN");
const configPath = args.includes("--config") ? flag("--config", "") : "";
let config: string | undefined;
if (configPath) {
  try {
    config = readFileSync(configPath, "utf8");
  } catch {
    console.error(`vera: can't read ${configPath}`);
    process.exit(2);
  }
}
try {
  const r = await review(args[1], { apiKey, model: flag("--model", "claude-sonnet-5-5"), ...(githubToken ? { githubToken } : {}), ...(config !== undefined ? { config } : {}) });
  mkdirSync(out, { recursive: true });
  const path = join(out, `${r.trace.events[0]?.type === "run.start" ? r.trace.events[0].runId : Date.now()}.jsonl`);
  writeFileSync(path, toJsonl(r.trace));
  if (args.includes("--comment")) {
    // Sign-offs from before this push still count, so they're read first.
    const gh = github(githubToken);
    // If they can't be read, the review is still posted, showing everyone as waiting,
    // but the check is left as it was rather than reset; the next sign-off corrects both.
    const s = await Promise.all([gh.reviews(r.pull.ref), gh.comments(r.pull.ref)])
      .then(([reviews, comments]) => status(r.plan.asks, r.pull.author, reviews, comments, MARKER))
      .catch(() => null);
    console.log(`Posted: ${await gh.comment(r.pull.ref, toMarkdown(r, s ?? undefined), MARKER)}`);
    if (s) await writeCheck(githubToken, r.pull.ref, r.pull.headSha, s);
    else console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}Couldn't read the PR's reviews, so the ${CHECK} check wasn't updated.`);
  } else if (args.includes("--markdown")) {
    console.log(toMarkdown(r));
  } else {
    print(r, path);
  }
} catch (e) {
  console.error(`vera: ${(e as Error).message}`);
  process.exit(1);
}
