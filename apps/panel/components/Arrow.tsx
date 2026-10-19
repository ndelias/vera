/** The subset font has no arrow glyphs, so arrows are drawn. */
export function Arrow({ dir = "right" }: { dir?: "right" | "left" | "out" }) {
  const rotate = dir === "left" ? 180 : dir === "out" ? -45 : 0;
  return (
    <svg
      aria-hidden="true"
      width="0.85em"
      height="0.85em"
      viewBox="0 0 16 16"
      style={{ display: "inline-block", verticalAlign: "-0.08em", marginLeft: dir === "left" ? 0 : "0.3em", marginRight: dir === "left" ? "0.3em" : 0, transform: `rotate(${rotate}deg)` }}
    >
      <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
