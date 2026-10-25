#!/usr/bin/env node
// vera review <pull request URL> [--config .vera.yml] [--model claude-sonnet-5-5] [--out .vera/runs]
//
// Needs ANTHROPIC_API_KEY (your own key; a review costs about 1-2 cents).
// GITHUB_TOKEN is optional and raises GitHub's limit from 60 requests an hour.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secret, toJsonl, totals } from "@vera/core";
import { review, type Review } from "./review.ts";

const USAGE = "Usage: vera review <GitHub pull request URL> [--config .vera.yml] [--model claude-sonnet-5-5] [--out .vera/runs]";

function optional(name: string): string | undefined {
  try {
    return secret(name);
  } catch {
    return undefined;
  }
}

function print(r: Review, tracePath: string) {
  const t = totals(r.trace);
  const add = r.pull.files.reduce((n, f) => n + f.additions, 0);
  const del = r.pull.files.reduce((n, f) => n + f.deletions, 0);
  const lines = [
    `Vera · ${r.pull.ref.owner}/${r.pull.ref.repo}#${r.pull.ref.number}: ${r.pull.title}`,
    `  ${r.pull.files.length} files, +${add} -${del}${r.ai.length ? ` · likely AI-written: ${r.ai.join("; ")}` : ""}`,
    `  Owners from ${r.ownership.source === "none" ? "nothing declared" : `${r.ownership.source} (${r.ownership.areas.length} areas, ${r.ownership.people.length} people)`}`,
    ...(r.ownershipError ? [`  .vera.yml skipped: ${r.ownershipError}`] : []),
    "",
    "Touches",
    ...(r.areas?.teams.length ? r.areas.teams.flatMap((a) => [`  ${a.team} (${a.confidence})`, `      ${a.reason}`]) : ["  (the Mapper gave no answer)"]),
    "",
    `Design decision: ${r.design ? `${r.design.visible ? "yes" : "no"} (${r.design.confidence}). ${r.design.what}` : "(no answer)"}`,
    "",
    "Who to ask",
    ...(r.plan.asks.length ? r.plan.asks.flatMap((a) => [`  ${a.who}, ${a.role}: ${{ ask: "ask", "ask-lead": "ask, as lead (Vera isn't sure who should review)", suggest: "possible owner (Vera isn't sure)" }[a.action]}`, `      ${a.why}`]) : ["  Nobody named."]),
    ...(r.plan.notes.length ? ["", "Notes", ...r.plan.notes.map((n) => `  ${n}`)] : []),
    "",
    `$${t.costUsd.toFixed(4)} · ${t.modelCalls} model calls · ${t.toolCalls} GitHub calls · ${(t.latencyMs / 1000).toFixed(1)} s · trace ${tracePath}`,
  ];
  console.log(lines.join("\n"));
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
if (args[0] !== "review" || !args[1]) {
  console.error(USAGE);
  process.exit(2);
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
  print(r, path);
} catch (e) {
  console.error(`vera: ${(e as Error).message}`);
  process.exit(1);
}
