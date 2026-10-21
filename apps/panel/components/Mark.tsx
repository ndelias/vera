/** Vera's mark: two strokes that don't quite meet, and the lime point where they would. */
export function Mark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flex: "none" }}
    >
      <path d="M9.5 9 L19 29" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <path d="M38.5 9 L29 29" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <rect x="19" y="34" width="10" height="10" rx="2.6" fill="#c9f23c" />
    </svg>
  );
}
