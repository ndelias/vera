// A trace is the full record of one Vera run on one change: every agent,
// model call and tool call, with tokens, cost and time. It drives the run
// viewer, the evals and debugging, so it's append-only and never holds
// secrets (every event passes through redact() on the way in).

import { redact } from "./redact.ts";

export const TRACE_VERSION = 1;

export type AgentName = "coordinator" | "mapper" | "briefer" | "examiner" | "signoff";

export type ChangeRef = {
  host: "github" | "gitlab";
  repo: string;
  number: number;
  url: string;
  title?: string;
};

type At = { at: number };

export type TraceEvent =
  | (At & { type: "run.start"; runId: string; change: ChangeRef; models: Partial<Record<AgentName, string>> })
  | (At & { type: "agent.start"; agent: AgentName; task: string })
  | (At & {
      type: "model.call";
      agent: AgentName;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      costUsd: number;
      latencyMs: number;
      stopReason: string;
    })
  | (At & {
      type: "tool.call";
      agent: AgentName;
      tool: string;
      input: unknown;
      summary: string;
      ok: boolean;
      latencyMs: number;
      error?: string;
    })
  | (At & { type: "agent.output"; agent: AgentName; output: unknown })
  | (At & { type: "agent.end"; agent: AgentName; latencyMs: number })
  | (At & { type: "rule.eval"; rule: string; matched: boolean; detail: string })
  | (At & { type: "run.end"; status: "ok" | "error"; error?: string });

export type Trace = { version: typeof TRACE_VERSION; events: TraceEvent[] };

export type Totals = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  toolCalls: number;
  latencyMs: number;
};

export function createTrace(): Trace {
  return { version: TRACE_VERSION, events: [] };
}

/** Appends an event, redacting anything that looks like a secret. */
export function record(trace: Trace, event: TraceEvent): TraceEvent {
  const clean = redact(event) as TraceEvent;
  trace.events.push(clean);
  return clean;
}

export function totals(trace: Trace): Totals {
  const t: Totals = { costUsd: 0, inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0, latencyMs: 0 };
  for (const e of trace.events) {
    if (e.type === "model.call") {
      t.costUsd += e.costUsd;
      t.inputTokens += e.inputTokens + e.cacheReadTokens + e.cacheWriteTokens;
      t.outputTokens += e.outputTokens;
      t.modelCalls += 1;
    } else if (e.type === "tool.call") {
      t.toolCalls += 1;
    }
  }
  const start = trace.events.find((e) => e.type === "run.start");
  const end = trace.events.findLast((e) => e.type === "run.end");
  if (start && end) t.latencyMs = end.at - start.at;
  t.costUsd = Math.round(t.costUsd * 1e6) / 1e6;
  return t;
}

/** One JSON object per line, so a trace can be streamed and appended to. */
export function toJsonl(trace: Trace): string {
  return [JSON.stringify({ version: trace.version }), ...trace.events.map((e) => JSON.stringify(e))].join("\n") + "\n";
}

export function fromJsonl(text: string): Trace {
  const [head, ...lines] = text.split("\n").filter((l) => l.trim());
  const meta = JSON.parse(head ?? "{}") as { version?: number };
  if (meta.version !== TRACE_VERSION) throw new Error(`unsupported trace version: ${String(meta.version)}`);
  return { version: TRACE_VERSION, events: lines.map((l) => JSON.parse(l) as TraceEvent) };
}
