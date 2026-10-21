import { DitherMark } from "./DitherMark";

// What Vera reads for one change (left) and who it asks, with what each
// gets (right), matching the demo's pull request. Lime pulses travel along
// the lines (CSS only); with reduced motion the lines are still.

const INPUTS = ["the diff · 8 files", "review bots · 2 findings", ".vera.yml · 5 rules"];
const OUTPUTS = [
  { label: "design · the preview", lime: true },
  { label: "security · the data flow", lime: false },
  { label: "engineering · 2 questions", lime: false },
];

export function NodeFlow() {
  return (
    <figure className="flow" aria-label="Vera takes the diff, the review bots' findings and the team's rules, and asks design, security and engineering to sign off, each with what they need.">
      <div className="flow-side">
        <p className="flow-heading">Reads</p>
        {INPUTS.map((label, i) => (
          <div key={label} className="flow-row">
            <span className="flow-pill">{label}</span>
            <span className="flow-line" aria-hidden="true">
              <span className="flow-pulse" style={{ animationDelay: `${i * 0.6}s` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="flow-core">
        <div className="flow-core-inner">
          <DitherMark label="Vera's mark in 3D, turning" />
        </div>
      </div>
      <div className="flow-side">
        <p className="flow-heading is-right">Asks</p>
        {OUTPUTS.map((o, i) => (
          <div key={o.label} className="flow-row">
            <span className="flow-line" aria-hidden="true">
              <span className="flow-pulse" style={{ animationDelay: `${1.2 + i * 0.6}s` }} />
            </span>
            <span className={`flow-pill${o.lime ? " is-lime" : ""}`}>{o.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
