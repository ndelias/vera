// The small squares and the lime label from the site's comment mock-up
// (apps/panel/public/dots), in light and dark. GitHub comments can't take
// CSS, so they're images; if they don't load, the alt text says the same.

const DOTS = "https://vera-agent.vercel.app/dots";

export type Dot = "high" | "medium" | "low" | "done";

export const dot = (name: Dot, alt: string) =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="${DOTS}/${name}-dark.svg"><img src="${DOTS}/${name}.svg" width="16" height="10" alt="${alt}"></picture>`;

/** Lime with dark text reads the same on light and dark, so one image. */
export const aiFlag = () => `<img src="${DOTS}/ai-flag.svg" width="140" height="19" alt="Likely AI-written">`;
