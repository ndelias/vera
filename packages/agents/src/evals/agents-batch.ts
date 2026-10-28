// Batch runs for the Briefer and the Examiner (study 06 DESIGN.md). Answers
// are saved under research/data/batches/<system>/ and costs in ev_costs.
//
//   node packages/agents/src/evals/agents-batch.ts estimate <job> <model>
//   node packages/agents/src/evals/agents-batch.ts submit   <job> <model> <system> [from-system]
//   node packages/agents/src/evals/agents-batch.ts collect  <system>
//
// Jobs: brief (engineering briefs on the GitHub PRs in br_prs), exam
// (design questions on the examiner20 sample), answers (good / vague / wrong
// answers to each question, from an exam system), grade (the grader on those
// answers, from an answers system).

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { secret } from "@vera/core";
import { PRICES, costUsd } from "@vera/core/pricing";
import { client as github } from "@vera/tools/github";
import { briefRequest, parseBrief } from "../briefer.ts";
import { answersRequest, examRequest, gradeRequest, parseJson, type Exam, type Grade, type Question } from "../examiner.ts";
import { files as gitlabFiles } from "./gitlab.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATA = join(ROOT, "research/data");
const BATCHES = join(DATA, "batches");
const db = new DatabaseSync(join(DATA, "research.sqlite"));
const client = () => new Anthropic({ apiKey: secret("ANTHROPIC_API_KEY", ROOT) });
type Req = { custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming };
const cid = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);

function optional(name: string): string | undefined {
  try {
    return secret(name, ROOT);
  } catch {
    return undefined;
  }
}

function saved<T>(system: string): Map<string, T> {
  const dir = join(BATCHES, system);
  const out = new Map<string, T>();
  if (existsSync(dir)) for (const f of readdirSync(dir)) out.set(f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(dir, f), "utf8")) as T);
  return out;
}

async function requests(job: string, model: string, from?: string): Promise<Req[]> {
  if (job === "brief") {
    const gh = github(optional("GITHUB_TOKEN"));
    const out: Req[] = [];
    for (const { id } of db.prepare("SELECT id FROM br_prs ORDER BY id").all() as { id: string }[]) {
      const [repo, n] = id.split("#") as [string, string];
      const [owner, name] = repo.split("/") as [string, string];
      const pull = await gh.pull({ owner, repo: name, number: Number(n), url: `https://github.com/${repo}/pull/${n}` });
      const files = pull.files.map((f) => ({ path: f.path, diff: f.patch ?? "", generated: false, tooLarge: !f.patch && f.additions + f.deletions > 0 }));
      out.push({ custom_id: cid(id), params: briefRequest(model, { title: pull.title, files }, "engineer") });
    }
    return out;
  }
  if (job === "exam") {
    const rows = db.prepare("SELECT s.mr_id, m.title FROM ev_samples s JOIN gl_mrs m ON m.id = s.mr_id WHERE s.name = 'examiner20' ORDER BY s.mr_id").all() as { mr_id: string; title: string }[];
    const out: Req[] = [];
    for (const r of rows) out.push({ custom_id: cid(r.mr_id), params: examRequest(model, { title: r.title, files: await gitlabFiles(r.mr_id) }, "design") });
    return out;
  }
  if (job === "answers" || job === "grade") {
    if (!from) throw new Error(`${job} needs the system to build on`);
    if (job === "answers") {
      const out: Req[] = [];
      for (const [id, exam] of saved<Exam | null>(from)) exam?.questions.forEach((q, i) => out.push({ custom_id: `${id}__q${i}`, params: answersRequest(model, q) }));
      return out;
    }
    const answers = saved<{ good: string; vague: string; wrong: string } | null>(from);
    const examSystem = JSON.parse(readFileSync(join(BATCHES, `${from}.json`), "utf8")).from as string;
    const exams = saved<Exam | null>(examSystem);
    const out: Req[] = [];
    for (const [key, a] of answers) {
      if (!a) continue;
      const [id, qi] = key.split("__q") as [string, string];
      const q = exams.get(id)?.questions[Number(qi)] as Question | undefined;
      if (!q) continue;
      for (const kind of ["good", "vague", "wrong"] as const) out.push({ custom_id: `${key}__${kind}`, params: gradeRequest(model, q, a[kind]) });
    }
    return out;
  }
  throw new Error(`unknown job "${job}"`);
}

async function estimate(job: string, model: string, from?: string) {
  const c = client();
  const reqs = await requests(job, model, from);
  let input = 0;
  for (const r of reqs) {
    const { system, messages, output_config } = r.params;
    input += (await c.messages.countTokens({ model, system, messages, ...(output_config ? { output_config } : {}) } as Anthropic.MessageCountTokensParams)).input_tokens;
  }
  console.log(JSON.stringify({ job, model, requests: reqs.length, input_tokens: input, est_usd: Number(costUsd(model, { inputTokens: input, outputTokens: 600 * reqs.length }, true).toFixed(3)) }));
}

async function submit(job: string, model: string, system: string, from?: string) {
  if (!PRICES[model]) throw new Error(`unknown model "${model}"`);
  if (!system) throw new Error("name the system");
  const reqs = await requests(job, model, from);
  const batch = await client().messages.batches.create({ requests: reqs });
  mkdirSync(BATCHES, { recursive: true });
  writeFileSync(join(BATCHES, `${system}.json`), JSON.stringify({ id: batch.id, job, system, model, from, submitted: new Date().toISOString() }));
  console.log(`submitted ${batch.id}: ${reqs.length} requests, ${system}`);
}

async function collect(system: string) {
  const meta = JSON.parse(readFileSync(join(BATCHES, `${system}.json`), "utf8")) as { id: string; job: string; model: string };
  const c = client();
  const batch = await c.messages.batches.retrieve(meta.id);
  if (batch.processing_status !== "ended") {
    console.log(`${system}: ${batch.processing_status}, ${JSON.stringify(batch.request_counts)}`);
    return;
  }
  const cost = db.prepare("INSERT OR REPLACE INTO ev_costs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const dir = join(BATCHES, system);
  mkdirSync(dir, { recursive: true });
  let total = 0, ok = 0;
  for await (const r of await c.messages.batches.results(meta.id)) {
    if (r.result.type !== "succeeded") {
      cost.run(system, r.custom_id, meta.model, null, null, null, null, null, r.result.type);
      continue;
    }
    const m = r.result.message, u = m.usage;
    const usd = costUsd(meta.model, { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 }, true);
    total += usd;
    const out = meta.job === "brief" ? parseBrief(m) : meta.job === "grade" ? parseJson<Grade>(m) : parseJson<unknown>(m);
    if (out) ok++;
    cost.run(system, r.custom_id, meta.model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, usd, out ? "ok" : "invalid");
    writeFileSync(join(dir, `${r.custom_id}.json`), JSON.stringify(out));
  }
  console.log(`${system}: ${ok} answers, $${total.toFixed(3)}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "estimate") await estimate(args[0]!, args[1]!, args[2]);
else if (cmd === "submit") await submit(args[0]!, args[1]!, args[2]!, args[3]);
else if (cmd === "collect") await collect(args[0]!);
else console.log("usage: estimate <job> <model> [from] | submit <job> <model> <system> [from] | collect <system>");
