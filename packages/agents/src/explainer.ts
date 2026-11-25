// The Explainer: answers a reviewer's question in the thread on a spot to
// verify (Nahuel's call, 25 Nov 2026: "Explain this"). It reads the spot, the
// file's changes and the thread so far. When the answer depends on what the
// author meant rather than on what the code does, it says so, and Vera asks
// the author in the thread. It explains; it never approves.

import type Anthropic from "@anthropic-ai/sdk";

export type Question = {
  title: string;
  about: string | null;
  spot: { file: string; lines: string; what: string; why: string };
  /** The file's diff in this pull request. */
  diff: string;
  /** The thread so far, oldest first, ending with the question. */
  thread: { who: string; body: string }[];
};
export type Explanation = { answer: string; needsAuthor: boolean };

const INSTRUCTIONS = `You are Vera, a code review assistant. A reviewer asked a question in the thread on a spot Vera told them to verify. Answer it from the change itself: what the code does, what it affects, and what could go wrong.

Answer in at most 120 words, plainly, as a colleague who has read the diff. Point at line numbers when it helps. Only claim what the diff and the thread show; if something isn't in them, say so.

Set "needsAuthor" to true when the answer depends on what the author intended or on something outside the diff (a decision, a ticket, how it's deployed). Then answer what you can and say what only the author can tell them.

Never say the change is approved, correct or safe to merge: whether it's right is the reviewer's call.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, needsAuthor: { type: "boolean" } },
  required: ["answer", "needsAuthor"],
  additionalProperties: false,
} as const;

export function explainRequest(model: string, q: Question): Anthropic.MessageCreateParamsNonStreaming {
  const content = [
    `Pull request: ${q.title}`,
    ...(q.about ? [`What it does: ${q.about}`] : []),
    "",
    `The spot: ${q.spot.file} lines ${q.spot.lines}. ${q.spot.what}. Why it needs a person: ${q.spot.why}`,
    "",
    "The file's changes:",
    "```diff",
    q.diff.slice(0, 30000),
    "```",
    "",
    "The thread:",
    ...q.thread.map((c) => `${c.who}: ${c.body}`),
  ].join("\n");
  return {
    model,
    max_tokens: 4000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  };
}

export function parseExplanation(message: Anthropic.Message): Explanation | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  try {
    const out = text ? (JSON.parse(text) as Partial<Explanation>) : null;
    return out && typeof out.answer === "string" && out.answer.trim() ? { answer: out.answer.trim(), needsAuthor: !!out.needsAuthor } : null;
  } catch {
    return null;
  }
}
