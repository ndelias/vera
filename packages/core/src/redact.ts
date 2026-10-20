// Traces and logs get published (the run viewer is public), so anything that
// looks like a credential is replaced before it's stored.

const PATTERNS: [string, RegExp][] = [
  ["anthropic-key", /sk-ant-[A-Za-z0-9_-]{8,}/g],
  ["github-token", /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["bearer", /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
];

const SECRET_KEYS = /^(authorization|api[_-]?key|token|secret|password|cookie)$/i;

export function redactText(text: string): string {
  let out = text;
  for (const [name, pattern] of PATTERNS) out = out.replace(pattern, `[redacted:${name}]`);
  return out;
}

/** Deep-copies a value, redacting secret-looking strings and secret-named fields. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) && v != null ? "[redacted:field]" : redact(v)]),
    );
  }
  return value;
}
