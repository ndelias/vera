// Per-million-token prices in USD (Anthropic first-party, as of 2026-10-06).
// Used to put a cost on every model call in a trace. Update when prices change.
// Input, output, and Opus/Sonnet cache reads are published rates. Cache writes
// are assumed at 1.25x input and Haiku cache reads at 10% of input, until checked.

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };

export function costUsd(model: string, u: Usage, batch = false): number {
  const p = PRICES[model];
  if (!p) throw new Error(`no price for model ${model}; add it to pricing.ts`);
  const usd =
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      (u.cacheReadTokens ?? 0) * p.cacheRead +
      (u.cacheWriteTokens ?? 0) * p.cacheWrite) /
    1e6;
  return batch ? usd / 2 : usd;
}
