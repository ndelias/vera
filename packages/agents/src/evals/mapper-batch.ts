// Runs the Mapper on a fixed sample of GitLab MRs as a message batch (half
// price), and writes its predictions and costs where research/pipeline/evals.py
// scores them. See research/studies/06-agents/DESIGN.md.
//
//   node packages/agents/src/evals/mapper-batch.ts estimate <sample> <model>   # counts tokens, free
//   node packages/agents/src/evals/mapper-batch.ts submit   <sample> <model> <system> [v2]
//   (v2 adds ownership history from research/data/ownership, written by evals.py ownership;
//    "visibility" / "visibility-v2" run the visibility check instead of the Mapper, stored as task "visibility")
//   node packages/agents/src/evals/mapper-batch.ts collect  <system>
//
// Diffs come from GitLab's public API and are cached under research/data/raw
// (gitignored); they're never written to the database.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { secret } from "@vera/core";
import { files } from "./gitlab.ts";
import { PRICES, costUsd } from "@vera/core/pricing";
import { parseVisibility, visibilityRequest } from "../visibility.ts";
import { mapperRequest, parseMapper, type Change, type Directory, type MapperVersion, type Ownership } from "../mapper.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATA = join(ROOT, "research/data");
const BATCHES = join(DATA, "batches");

const db = new DatabaseSync(join(DATA, "research.sqlite"));

type Row = { mr_id: string; title: string; created_at: number };

function sample(name: string): Row[] {
  const rows = db
    .prepare(
      `SELECT s.mr_id, m.title, m.created_at FROM ev_samples s JOIN gl_mrs m ON m.id = s.mr_id
       WHERE s.name = ? ORDER BY s.mr_id`,
    )
    .all(name) as Row[];
  if (!rows.length) throw new Error(`no sample named ${name}; draw it with evals.py sample`);
  return rows;
}

function directoryFor(createdAt: number): Directory {
  const ym = new Date(createdAt * 1000).toISOString().slice(0, 7);
  return JSON.parse(readFileSync(join(DATA, "directory", `${ym}.json`), "utf8")) as Directory;
}

function ownership(mrId: string): Ownership {
  const file = join(DATA, "ownership", `${mrId.replace("!", "-")}.json`);
  if (!existsSync(file)) throw new Error(`no ownership evidence for ${mrId}; run evals.py ownership <sample>`);
  return (JSON.parse(readFileSync(file, "utf8")) as { teams: Ownership }).teams;
}

async function requests(name: string, model: string, version = "v1") {
  if (!["v1", "v2", "visibility", "visibility-v2"].includes(version)) throw new Error(`unknown version "${version}"`);
  const out: { custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming }[] = [];
  for (const row of sample(name)) {
    const change: Change = { title: row.title, files: await files(row.mr_id) };
    if (version === "v2") change.ownership = ownership(row.mr_id);
    const params = version.startsWith("visibility")
      ? visibilityRequest(model, change, version === "visibility-v2" ? "v2" : "v1")
      : mapperRequest(model, directoryFor(row.created_at), change, version as MapperVersion);
    // custom_id allows only letters, digits, _ and -
    out.push({ custom_id: row.mr_id.replace("!", "-"), params });
  }
  return out;
}

const client = () => new Anthropic({ apiKey: secret("ANTHROPIC_API_KEY", ROOT) });

async function estimate(name: string, model: string, version = "v1") {
  const c = client();
  const reqs = await requests(name, model, version);
  let input = 0;
  for (const r of reqs) {
    const { model: m, system, messages, output_config } = r.params;
    const counted = await c.messages.countTokens({ model: m, system, messages, ...(output_config ? { output_config } : {}) } as Anthropic.MessageCountTokensParams);
    input += counted.input_tokens;
  }
  // Output isn't known before the run: assume 1,500 tokens a change (answer plus thinking).
  const output = 1500 * reqs.length;
  // The directory is the same for every change in a month: priced as cache reads after the first.
  const usd = costUsd(model, { inputTokens: input, outputTokens: output }, true);
  console.log(JSON.stringify({ sample: name, model, changes: reqs.length, input_tokens: input, est_output_tokens: output, est_usd_no_cache: Number(usd.toFixed(3)) }));
}

async function submit(name: string, model: string, system: string, version = "v1") {
  if (!PRICES[model]) throw new Error(`unknown model "${model}"`);
  if (!system) throw new Error("name the system, e.g. mapper-haiku-pilot");
  const reqs = await requests(name, model, version);
  const batch = await client().messages.batches.create({ requests: reqs });
  mkdirSync(BATCHES, { recursive: true });
  writeFileSync(join(BATCHES, `${system}.json`), JSON.stringify({ id: batch.id, system, sample: name, model, version, submitted: new Date().toISOString() }));
  console.log(`submitted ${batch.id}: ${reqs.length} changes, ${system}`);
}

async function collect(system: string) {
  const meta = JSON.parse(readFileSync(join(BATCHES, `${system}.json`), "utf8")) as { id: string; model: string; version?: string };
  const visibility = meta.version?.startsWith("visibility") ?? false;
  const c = client();
  const batch = await c.messages.batches.retrieve(meta.id);
  if (batch.processing_status !== "ended") {
    console.log(`${system}: ${batch.processing_status}, ${JSON.stringify(batch.request_counts)}`);
    return;
  }
  const pred = db.prepare(`INSERT OR REPLACE INTO ev_predictions VALUES (?, '${visibility ? "visibility" : "mapping"}', ?, ?)`);
  const cost = db.prepare("INSERT OR REPLACE INTO ev_costs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let ok = 0, total = 0;
  for await (const r of await c.messages.batches.results(meta.id)) {
    const mrId = r.custom_id.replace("-", "!");
    if (r.result.type !== "succeeded") {
      cost.run(system, mrId, meta.model, null, null, null, null, null, r.result.type);
      continue;
    }
    const m = r.result.message;
    const u = m.usage;
    const usd = costUsd(meta.model, {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    }, true);
    total += usd;
    const out = visibility ? parseVisibility(m) : parseMapper(m);
    cost.run(system, mrId, meta.model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, usd, out ? "ok" : "invalid");
    pred.run(system, mrId, JSON.stringify(visibility ? out : out && "teams" in out ? out.teams.map((t) => t.team) : []));
    if (out) ok++;
    // The full answer (reasons, confidence) is kept for reading, not scored.
    mkdirSync(join(BATCHES, system), { recursive: true });
    writeFileSync(join(BATCHES, system, `${r.custom_id}.json`), JSON.stringify(out));
  }
  console.log(`${system}: ${ok} answers, $${total.toFixed(3)} total`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "estimate") await estimate(args[0]!, args[1]!, args[2]);
else if (cmd === "submit") await submit(args[0]!, args[1]!, args[2]!, args[3]);
else if (cmd === "collect") await collect(args[0]!);
else console.log("usage: estimate <sample> <model> | submit <sample> <model> <system> | collect <system>");
