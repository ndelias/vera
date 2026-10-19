const TONE: Record<string, string> = {
  open: "is-open",
  supported: "is-good",
  supports: "is-good",
  disproved: "is-critical",
  disproves: "is-critical",
};

/** Status always carries its word; the dot only supports it. */
export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${TONE[status] ?? ""}`}>{status}</span>;
}
