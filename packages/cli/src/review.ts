// `vera review <PR URL>`: one pull request, end to end. Reads the PR and the
// repo's ownership files, runs the Mapper, the design check and the
// engineer's brief, decides who is asked, and records every step in a trace.

import Anthropic from "@anthropic-ai/sdk";
import { costUsd } from "@vera/core/pricing";
import { createTrace, record, totals, type AgentName, type Trace } from "@vera/core/trace";
import { mapperRequest, parseMapper, type Change, type Directory, type MapperOutput } from "@vera/agents/mapper";
import { parseVisibility, visibilityRequest, type Visibility } from "@vera/agents/visibility";
import { briefRequest, parseBrief, type Brief } from "@vera/agents/briefer";
import { areasFor, ConfigError, fromCodeowners, fromVeraYml, matches, route, type Ownership, type Plan } from "@vera/rules";
import { client as github, parsePullUrl, type Pull } from "@vera/tools/github";

export type Review = {
  pull: Pull;
  ownership: Ownership;
  ownershipError?: string;
  areas: MapperOutput | null;
  design: Visibility | null;
  /** Where an engineer should look first. Only the engineer's brief is
   * used: it beat the baseline (study 06); a design brief needs screenshots. */
  brief: Brief | null;
  ai: string[];
  plan: Plan;
  trace: Trace;
};

// Explicit AI authorship markers, as in research study 04: trailers, "generated
// with" lines naming a tool, agent accounts, and the robot marker.
const AI_TOOL = "claude|anthropic|cursor|copilot|codex|openai|gpt|gemini|devin|aider|windsurf|cline|jules|amp|junie";
const AI_TRAILER = new RegExp(`^(co-authored-by|assisted-by):.*\\b(${AI_TOOL})`, "im");
const AI_GENERATED = new RegExp(`(generated|written|created) (with|by)\\s+\\[?(${AI_TOOL})`, "i");
// Coding agents with their own accounts. Other bots (Dependabot, Renovate) aren't AI-written.
const AI_ACCOUNT = /^(devin-ai-integration|copilot-swe-agent|google-labs-jules|cursor|claude|chatgpt-codex-connector)(\[bot\])?$/i;

export function aiSignals(pull: Pull): string[] {
  const out: string[] = [];
  if (AI_ACCOUNT.test(pull.author)) out.push(`opened by ${pull.author}`);
  const trailers = pull.commitMessages.filter((m) => AI_TRAILER.test(m)).length;
  if (trailers) out.push(`AI co-author trailer in ${trailers} of ${pull.commitMessages.length} commits`);
  if (AI_GENERATED.test(pull.body) || pull.body.includes("🤖") || pull.commitMessages.some((m) => AI_GENERATED.test(m))) out.push("says it was generated with an AI tool");
  return out;
}

/** What the Mapper sees of each area: for small configs, everything; for
 * big ones (CODEOWNERS files run to tens of thousands of tokens), only the
 * declared paths that cover a changed file or share its first three folders,
 * and the other areas by name. */
const SMALL = 20;
const head = (p: string, n: number) => p.replace(/^\//, "").replace(/\*.*$/, "").split("/").filter(Boolean).slice(0, n).join("/");

function directory(o: Ownership, paths: string[]): Directory {
  const roles = (name: string) => [...new Set(o.people.filter((p) => p.areas.includes(name)).map((p) => p.role))];
  const near = (pattern: string) => paths.some((x) => matches(pattern, x)) || (head(pattern, 3).split("/").length >= 3 && paths.some((x) => head(x, 3) === head(pattern, 3)));
  return {
    as_of: o.source,
    teams: o.areas.map((a) => {
      const shown = o.areas.length <= SMALL ? a.paths : a.paths.filter(near);
      return { key: a.name, name: a.name, stage: "", section: null, focus: shown.length || o.areas.length <= SMALL ? a.description : "", categories: shown, roles: roles(a.name) };
    }),
  };
}

export async function review(url: string, opts: { apiKey: string; githubToken?: string; model: string; config?: string }): Promise<Review> {
  const trace = createTrace();
  const ref = parsePullUrl(url);
  const t0 = Date.now();
  record(trace, { at: t0, type: "run.start", runId: `${ref.owner}-${ref.repo}-${ref.number}-${t0}`, change: { host: "github", repo: `${ref.owner}/${ref.repo}`, number: ref.number, url: ref.url }, models: { mapper: opts.model, visibility: opts.model, briefer: opts.model } });
  record(trace, { at: Date.now(), type: "agent.start", agent: "coordinator", task: "read the pull request and the repo's ownership files" });
  const gh = github(opts.githubToken, (c) => record(trace, { at: Date.now(), type: "tool.call", agent: "coordinator", ...c }));

  try {
    const pull = await gh.pull(ref);
    // A local .vera.yml (--config) stands in for the repo's, so a team can try one before committing it.
    const files = opts.config !== undefined ? { veraYml: opts.config, codeowners: null } : await gh.ownershipFiles(ref, pull.baseRef);
    let ownership: Ownership = { source: "none", areas: [], people: [] };
    let ownershipError: string | undefined;
    try {
      if (files.veraYml) ownership = fromVeraYml(files.veraYml);
      else if (files.codeowners) ownership = fromCodeowners(files.codeowners);
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      ownershipError = e.message;
      if (files.codeowners) ownership = fromCodeowners(files.codeowners);
    }
    record(trace, { at: Date.now(), type: "rule.eval", rule: "ownership source", matched: ownership.source !== "none", detail: `${ownership.source}: ${ownership.areas.length} areas, ${ownership.people.length} people${ownershipError ? `; .vera.yml skipped: ${ownershipError}` : ""}` });

    const paths = pull.files.map((f) => f.path);
    const counts = areasFor(ownership, paths);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const change: Change = {
      title: pull.title,
      files: pull.files.map((f) => ({ path: f.path, diff: f.patch ?? "", generated: false, tooLarge: !f.patch && f.additions + f.deletions > 0 })),
      ...(ownership.source !== "none" ? {
        ownership: [...counts].sort((a, b) => b[1] - a[1]).map(([team, n]) => ({ team, share: n / total })),
        ownershipLabel: "Declared paths (each area's share of the changed files under its paths)",
      } : {}),
    };

    const anthropic = new Anthropic({ apiKey: opts.apiKey });
    async function call<T>(agent: AgentName, task: string, params: Anthropic.MessageCreateParamsNonStreaming, parse: (m: Anthropic.Message) => T | null): Promise<T | null> {
      const start = Date.now();
      record(trace, { at: start, type: "agent.start", agent, task });
      const m = await anthropic.messages.create(params);
      const u = m.usage;
      record(trace, {
        at: Date.now(), type: "model.call", agent, model: params.model,
        inputTokens: u.input_tokens, outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        costUsd: costUsd(params.model, { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 }),
        latencyMs: Date.now() - start, stopReason: m.stop_reason ?? "unknown",
      });
      const out = parse(m);
      record(trace, { at: Date.now(), type: "agent.output", agent, output: out });
      record(trace, { at: Date.now(), type: "agent.end", agent, latencyMs: Date.now() - start });
      return out;
    }

    // The agents don't depend on each other, so they run at once.
    const [areas, design, brief] = await Promise.all([
      call("mapper", "which areas this change touches", mapperRequest(opts.model, directory(ownership, paths), change, "cli"), parseMapper),
      call("visibility", "does this change make a design decision?", visibilityRequest(opts.model, change, "v2"), parseVisibility),
      call("briefer", "where an engineer should look first", briefRequest(opts.model, change, "engineer"), parseBrief),
    ]);

    const plan = route(ownership, paths, (areas?.teams ?? []).map((t) => ({ area: t.team, confidence: t.confidence, reason: t.reason })),
      design ? { decision: design.visible, confidence: design.confidence, what: design.what } : null);
    for (const a of plan.asks) record(trace, { at: Date.now(), type: "rule.eval", rule: `${a.role}: ${a.action}`, matched: true, detail: `${a.who}: ${a.why}` });
    const ai = aiSignals(pull);
    record(trace, { at: Date.now(), type: "rule.eval", rule: "likely AI-written", matched: ai.length > 0, detail: ai.join("; ") || "no marker found" });
    record(trace, { at: Date.now(), type: "run.end", status: "ok" });
    return { pull, ownership, ...(ownershipError ? { ownershipError } : {}), areas, design, brief, ai, plan, trace };
  } catch (e) {
    record(trace, { at: Date.now(), type: "run.end", status: "error", error: (e as Error).message });
    throw Object.assign(e as Error, { trace });
  }
}

export { totals };
