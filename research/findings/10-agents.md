# Study 06 (M2): the first agents, against the baseline

Design and every change to it: `studies/06-agents/DESIGN.md`. All agents
run on Claude Sonnet 5.5 through the Batch API, scored by the same scorer
as the rules (`research/pipeline/evals.py`). M2 spend so far: about $11.

## Results

| | Rules | Agent | Bar |
|---|---|---|---|
| **Mapper:** owning team in the top 3, 500 test changes | Path lookup 44% | v1 62%, **v2 63%** (with ownership history) | 80% |
| Mapper, when the team was in that month's directory (399) | 42% | v1 77%, **v2 79%** (75–83%) | 80% |
| Mapper, first guess right when it says "high" | — | v1 60%, **v2 68%** | 80% for direct pings |
| **Design routing**, Nahuel's labels, weighted to the 500 | Hand rules: 100% caught, 44% of pings needed | Routing v1 (Mapper): 67%, 50%. With the visibility check v1: 92%, 39% | 80% / 80% |
| **Visibility check v2**, 50 held-out changes | — | Agrees with Nahuel on **48 of 50** (87–99%); catches all 22 of his yeses; 2 extra flags | — |
| **Fix-up judge**, 50 linked pairs Nahuel judged | — | Sonnet finds 11 of 19 of his fix-ups (58%) and rejects 23 of 31 others (74%); Haiku 10 of 19, 21 of 31 | 80% / 90%: **fails** |
| Cost per change (batch) | free | Mapper $0.008, visibility check $0.007, judge $0.009 | — |

Model pilot (50 train changes, Mapper): Haiku 5.5 82%, Sonnet 5.5 85%,
Opus 5.5 87% when the team was listed, at $0.0005, $0.008 and $0.019 a
change. Within noise of each other; Sonnet put the right team first far
more often than Haiku and runs every agent here.

## What it means

- **The map beats the rules by about 20 points, and sits at the bar.**
  With ownership history, the Mapper names the right team in its top 3
  for 79% of changes whose team is listed. The 1 in 5 changes whose team
  wasn't in that month's directory can't be answered by anyone: when
  areas aren't declared, Vera should ask the lead, not guess.
- **Who owns a change doesn't say whether a designer should see it.**
  Routing on the Mapper alone did worse than "any UI file goes to design".
  What decides it is whether the change makes a design decision, which
  takes reading the change.
- **"Does a user notice?" is the wrong question.** The first visibility
  check flagged every design-relevant change, plus bug fixes, permission
  changes and timing changes users notice but designers don't need. Asking
  "does this make a design decision?" cut false alarms from 14 to 2 on
  changes it hadn't seen, without missing any.
- **How the design labels were made.** Nahuel labelled 100 changes, then
  read Claude's reasoning on each and revised 43 where it changed his
  mind. The revised labels are used. They match Claude's own lean on 99
  of 100, so the visibility check's agreement is with his reviewed calls;
  against his first answers it is lower (28 of 50 for v2).
- **The line moves with explanation.** Before reading the reasoning,
  Nahuel would show designers about 4 in 10 changes; after, about 1 in 7.
  Teams will draw it differently, which argues for a setting in
  `.vera.yml`.

- **Even a model can't label fix-ups reliably from two changes.** After
  file overlap (16% real) and links (12%), a model reading both changes
  and the second's diff agreed with Nahuel on 34 of 50 pairs, short of
  both bars. Whether a change "fixes" another is often a judgment call
  even for a person; review comments per 100 lines stay the measure.

## Next

The `vera review` command, then the Briefer and Examiner, which need people to rate their output, and the
`vera review` command. Study 07 checks whether coding agents' pull
requests pile up unreviewed on public GitHub.
