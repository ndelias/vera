// Runs the fix-up judge on the 50 pairs Nahuel judges (study 06 DESIGN.md) as
// a message batch, and writes its verdicts and costs for evals.py.
//
//   node packages/agents/src/evals/judge-batch.ts estimate <model>
//   node packages/agents/src/evals/judge-batch.ts submit   <model> <system>
//   node packages/agents/src/evals/judge-batch.ts collect  <system>

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { secret } from "@vera/core";
import { PRICES, costUsd } from "@vera/core/pricing";
import { judgeRequest, parseVerdict, type Side } from "../fixup-judge.ts";
import { details, files } from "./gitlab.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATA = join(ROOT, "research/data");
const BATCHES = join(DATA, "batches");
const PAIRS = join(ROOT, "research/studies/06-agents/fixup-pairs-strata.json");
const db = new DatabaseSync(join(DATA, "research.sqlite"));
const client = () => new Anthropic({ apiKey: secret("ANTHROPIC_API_KEY", ROOT) });

async function side(mrId: string, withDiff: boolean): Promise<Side> {
  const d = await details(mrId);
  const fs = await files(mrId);
  const paths = fs.map((f) => f.path);
  const diff = fs.filter((f) => !f.generated && !f.tooLarge).map((f) => `--- ${f.path}\n${f.diff}`).join("\n\n");
  return withDiff ? { title: d.title, description: d.description, paths, diff } : { title: d.title, description: d.description, paths };
}

async function requests(model: string) {
  const pairs = Object.keys((JSON.parse(readFileSync(PAIRS, "utf8")) as { stratum_of: Record<string, string> }).stratum_of);
  const out: { custom_id: string; params: Anthropic.MessageCreateParamsNonStreaming }[] = [];
  for (const pair of pairs) {
    const [first, second] = pair.split("__") as [string, string];
    // custom_id allows letters, digits, _ and - only
    out.push({ custom_id: pair.replaceAll("!", "-"), params: judgeRequest(model, await side(first, false), await side(second, true)) });
  }
  return out;
}

async function estimate(model: string) {
  const c = client();
  let input = 0;
  const reqs = await requests(model);
  for (const r of reqs) {
    const { system, messages, output_config } = r.params;
    input += (await c.messages.countTokens({ model, system, messages, ...(output_config ? { output_config } : {}) } as Anthropic.MessageCountTokensParams)).input_tokens;
  }
  const usd = costUsd(model, { inputTokens: input, outputTokens: 400 * reqs.length }, true);
  console.log(JSON.stringify({ model, pairs: reqs.length, input_tokens: input, est_usd: Number(usd.toFixed(3)) }));
}

async function submit(model: string, system: string) {
  if (!PRICES[model]) throw new Error(`unknown model "${model}"`);
  if (!system) throw new Error("name the system, e.g. judge-haiku-v1");
  const batch = await client().messages.batches.create({ requests: await requests(model) });
  mkdirSync(BATCHES, { recursive: true });
  writeFileSync(join(BATCHES, `${system}.json`), JSON.stringify({ id: batch.id, system, model, submitted: new Date().toISOString() }));
  console.log(`submitted ${batch.id}: ${system}`);
}

async function collect(system: string) {
  const meta = JSON.parse(readFileSync(join(BATCHES, `${system}.json`), "utf8")) as { id: string; model: string };
  const c = client();
  const batch = await c.messages.batches.retrieve(meta.id);
  if (batch.processing_status !== "ended") {
    console.log(`${system}: ${batch.processing_status}, ${JSON.stringify(batch.request_counts)}`);
    return;
  }
  const pred = db.prepare("INSERT OR REPLACE INTO ev_predictions VALUES (?, 'fixup_judge', ?, ?)");
  const cost = db.prepare("INSERT OR REPLACE INTO ev_costs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let total = 0;
  for await (const r of await c.messages.batches.results(meta.id)) {
    const pair = r.custom_id.replace(/^product-/, "product!").replace("__product-", "__product!");
    if (r.result.type !== "succeeded") {
      cost.run(system, pair.split("__")[0]!, meta.model, null, null, null, null, null, r.result.type);
      continue;
    }
    const m = r.result.message, u = m.usage;
    const usd = costUsd(meta.model, { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 }, true);
    total += usd;
    const v = parseVerdict(m);
    cost.run(system, pair.split("__")[0]!, meta.model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, usd, v ? "ok" : "invalid");
    // Keyed by the first change (each is in one pair only); the pair travels in the prediction.
    pred.run(system, pair.split("__")[0]!, JSON.stringify(v ? { pair, ...v } : { pair }));
  }
  console.log(`${system}: done, $${total.toFixed(3)}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "estimate") await estimate(args[0]!);
else if (cmd === "submit") await submit(args[0]!, args[1]!);
else if (cmd === "collect") await collect(args[0]!);
else console.log("usage: estimate <model> | submit <model> <system> | collect <system>");
