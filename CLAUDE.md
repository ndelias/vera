# Vera

Review for the AI era: an agentic layer above code review bots. For each
pull request it maps what the change touches, checks that the reviewer
understood it, and gets every role that has to sign off to do it in
parallel. A portfolio piece for Nahuel: read as evidence of product
judgment, engineering craft and taste. It should work and run, but it's
a portfolio app, not a business.

- The case and every number behind it: research/findings/ (08-decision.md
  picked Vera), shown on the site at /why and /evidence.
- How it gets built: BUILD-PLAN.md (path C: run viewer, CLI and GitHub
  Action first; then a thin hosted layer and Slack on a demo workspace).
- Live site: https://vera-zeta-pink.vercel.app (Vercel project "vera" in
  Nahuel's personal scope). Repo: github.com/ndelias/vera (public).

## Layout
- research/: pipeline (Python, standard library only), studies (plans,
  search terms, codebooks, hypotheses), findings. research/data/ holds the
  159 MB database; it is never committed.
- apps/panel/: the website (Next.js App Router, static export). It reads
  data/site.sqlite.gz, a publishable snapshot written by
  research/pipeline/export_site.py and unpacked before dev and build.
- packages/core/: Vera's core (trace format, cost per call, redaction,
  secrets). More packages come one milestone at a time. The site imports
  only `@vera/core/trace` and `@vera/core/pricing` (the root entry pulls in
  Node-only code).
- /demo: the run viewer (components/demo/DemoPlayer.tsx) replaying a
  scripted trace (lib/demo/run.ts, tested by lib/demo/run.test.ts). Keep it
  labelled as scripted, with a fictional company, until real traces replace it.

## Commands
- `npm run dev -w panel` (http://localhost:3100)
- `npm run build -w panel` (static export into apps/panel/out)
- `npm run preview -w panel` (serves out/ like Vercel, http://localhost:3200)
- `npm run ci` (typecheck + tests; CI also builds the site)
- `python3 research/pipeline/export_site.py` (rebuild the snapshot)

## Hard rules
- Keep this away from Nahuel's employer: none of its data, colleagues,
  repos, GitHub org or API account, and never name it anywhere in this
  public repo (code, copy, commits, docs). The git history was scrubbed
  once; don't undo that.
- Never use the company Anthropic API account. Model calls (M2 onward)
  need Nahuel's personal account. Never read .env; secrets go through
  `secret()` in @vera/core, which never prints a value, and traces redact
  anything that looks like a credential.
- Publish counts, not other people's words: the site shows short excerpts
  (with links) only for the 2,480 posts that were read or coded, and no
  merge request titles or URLs. Anything that widens that goes through
  export_site.py and gets Nahuel's OK.
- Ask before adding any dependency: say what it's for and its size.
- Every change goes through a pull request: work on a branch, run
  `npm run ci` and the site build, push the branch and open a PR. Vercel
  builds a preview for it; Nahuel reviews and merges, and merging to main
  deploys the site. Never push to main directly.
- The site is fully static. No server routes, no runtime database.

## Research
- Pre-registration: plans, search terms, scoring rules and hypotheses are
  committed before the data they apply to. Never edit one after the fact;
  revise it as a new version.
- Report results as they came out, including the disproved ones. Reframe
  for clarity, never inflate: Nahuel chose "reframe only".
- Quotes on the site are the coder's verbatim passages from first-hand
  posts, picked by hand (QUOTES in apps/panel/lib/case-content.ts).

## Brand (direction D: dot matrix)
Light only (`data-theme="light"` on <html>; the dark tokens stay in
globals.css for a toggle later).
bg #FFFFFF · surface #FFFFFF · line #E2E2DC · line-strong #D3D3CC ·
muted #5C5C57 · ink #0B0B0B · lime #C9F23C · on-lime #2E3A05
- Lime marks the one thing to look at, always as a fill behind ink, never
  as text.
- Fonts: Instrument Sans 400/500 and Fragment Mono 400, self-hosted; Doto
  700/900 (next/font) for big numbers and short display lines only. Mono
  small caps for labels, eyebrows and nav. (DM Mono was dropped as too
  common on AI sites; Fragment Mono chosen 2026-10-21.)
- Glyphs the subset fonts lack (arrows, minus, ±) are drawn as inline SVG
  (components/Arrow.tsx) or avoided in copy.
- The mark: two strokes that don't quite meet and the lime square where
  they would (components/Mark.tsx). Logo files: apps/panel/public/brand/.
- Ease for page motion: cubic-bezier(0.2, 0.7, 0.2, 1).

## Motion
- Everything that moves goes through lib/motion.ts: `useMotion()` (false
  under reduced motion or the footer's Pause), `useOnScreen()` (loops run
  only while seen), `useEntrance()` (an entrance plays once, only for
  things that start below the fold).
- Nahuel likes calm motion: about 1–1.5 s moves, things that advance on
  their own, and a way to pause. The page background stays plain, with
  only small cells gathering in the side margins (components/CellField.tsx).
- "Code art" means the technique of the portrait on his portfolio's About
  page: mono characters scrambling through noise and settling, cell by
  cell. The site's other motion pieces come from his references: the
  turning dithered mark (DitherMark), cross-stitch icons that break apart
  into the next (CrossMorph), numbers assembling from square and round
  dots (DotNumber), and the halftone mark with a travelling light
  (HalftoneMark).

## Charts
- Marks are cut into square cells by a CSS mask, so values keep their exact
  size. One series is olive (--series); one highlighted mark is ink with
  its value in a lime tag. Categorical slots are --s1..--s3, in order.
- Run the dataviz validator before adopting any new chart colour.
- Every chart keeps a hover/focus tooltip and a "Show as table" view.

## Copy
- First person, in Nahuel's voice. Claude drafts, he edits, a few pieces at
  a time. Never ship bracketed placeholders as if they were real copy.
- Plain words, no hype. Oxford comma in lists of three or more.

## Working agreement
- Plan first and say which files you'll touch. Ask one simple question at
  a time, with pros and cons and a recommendation when there's a choice.
- Verify UI in the browser (the static export via `npm run preview`) at
  desktop and phone widths before calling it done.
