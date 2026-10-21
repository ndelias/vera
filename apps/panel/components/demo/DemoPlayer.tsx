"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createTrace, record, totals, type AgentName, type TraceEvent } from "@vera/core/trace";
import { Arrow } from "../Arrow";
import { Mark } from "../Mark";
import {
  BEFORE_REVIEW,
  CHANGE,
  QUESTIONS,
  afterReview,
  type BrieferOutput,
  type ExaminerOutput,
  type MapperOutput,
  type Risk,
} from "@/lib/demo/run";

// Replays the scripted run as the run viewer will replay real ones: events
// arrive in order, spaced by their own timings (long waits for people are
// compressed), and everything on screen is derived from the events so far.
// The run stops at the reviewer's turn: the visitor answers, approves, and
// the rest of the run (grading, then sign-off) is generated from the answers.

type Phase = "idle" | "watch" | "review" | "signoff" | "done";

const AGENTS: { id: AgentName; name: string }[] = [
  { id: "mapper", name: "Mapper" },
  { id: "briefer", name: "Briefer" },
  { id: "examiner", name: "Examiner" },
  { id: "signoff", name: "Sign-off" },
];
const MAX_GAP_MS = 1500; // waits longer than this (people, mostly) play in this long
const RISK_LABEL: Record<Risk, string> = { high: "high risk", mid: "medium risk", low: "low risk" };

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const clock = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
};

function outputOf<T>(events: TraceEvent[], agent: AgentName, has: (o: unknown) => boolean): T | undefined {
  const e = events.findLast((x) => x.type === "agent.output" && x.agent === agent && has(x.output));
  return e && e.type === "agent.output" ? (e.output as T) : undefined;
}

export function DemoPlayer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [queue, setQueue] = useState<TraceEvent[]>(BEFORE_REVIEW);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewStart, setReviewStart] = useState(0);
  const logRef = useRef<HTMLOListElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  // Play the next event after its own gap (compressed), while playing.
  useEffect(() => {
    if (!playing) return;
    if (cursor >= queue.length) {
      setPlaying(false);
      if (phase === "watch") setPhase("review");
      if (phase === "signoff") setPhase("done");
      return;
    }
    const prev = cursor === 0 ? (queue === BEFORE_REVIEW ? 0 : reviewStart) : queue[cursor - 1]!.at;
    const gap = Math.min(MAX_GAP_MS, Math.max(120, queue[cursor]!.at - prev));
    const id = window.setTimeout(() => {
      setEvents((es) => [...es, queue[cursor]!]);
      setCursor((c) => c + 1);
    }, gap / speed);
    return () => window.clearTimeout(id);
  }, [cursor, phase, playing, queue, reviewStart, speed]);

  // Keep the newest step in view inside the run log (not the page).
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [events.length]);

  // When it's the reviewer's turn, bring the questions into view.
  useEffect(() => {
    if (phase !== "review") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reviewRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [phase]);

  const trace = useMemo(() => {
    const t = createTrace();
    for (const e of events) record(t, e);
    return t;
  }, [events]);
  const sums = totals(trace);

  const map = outputOf<MapperOutput>(events, "mapper", (o) => typeof o === "object" && o !== null && "areas" in o);
  const briefs = outputOf<BrieferOutput>(events, "briefer", (o) => typeof o === "object" && o !== null && "briefs" in o);
  const questions = outputOf<ExaminerOutput>(events, "examiner", (o) => typeof o === "object" && o !== null && "questions" in o);
  const grade = outputOf<{ right: number; of: number }>(events, "examiner", (o) => typeof o === "object" && o !== null && "right" in o);
  const rules = events.filter((e) => e.type === "rule.eval" && e.rule !== "Vera: sign-off");
  const passed = events.some((e) => e.type === "rule.eval" && e.rule === "Vera: sign-off" && e.matched);
  const signoffs = new Map<string, Extract<TraceEvent, { type: "signoff" }>>();
  for (const e of events) if (e.type === "signoff") signoffs.set(e.role, e);
  const last = events.at(-1);
  const elapsed = last ? last.at : 0;
  const thinking = (agent: AgentName) =>
    events.some((e) => e.type === "agent.start" && e.agent === agent) && !events.some((e) => e.type === "agent.end" && e.agent === agent);
  const status = (agent: AgentName) =>
    events.some((e) => e.type === "agent.end" && e.agent === agent) ? "done" : thinking(agent) ? "running" : "waiting";
  const current = AGENTS.find((a) => status(a.id) === "running");

  const start = () => {
    setPhase("watch");
    setPlaying(true);
  };
  const restart = () => {
    setEvents([]);
    setQueue(BEFORE_REVIEW);
    setCursor(0);
    setAnswers({});
    setReviewStart(0);
    setPhase("watch");
    setPlaying(true);
  };
  const approve = () => {
    const at = (events.at(-1)?.at ?? 0) + 2_000;
    setReviewStart(at);
    setQueue(afterReview(at, answers));
    setCursor(0);
    setPhase("signoff");
    setPlaying(true);
  };
  const answeredAll = QUESTIONS.questions.every((q) => answers[q.id]);

  return (
    <div className="demo" data-phase={phase}>
      <div className="demo-bar">
        <span className="demo-tag">Scripted demo · fictional company</span>
        <div className="demo-controls">
          {phase === "idle" ? (
            <button type="button" className="pill" onClick={start}>
              Start the demo<Arrow />
            </button>
          ) : (
            <>
              {phase === "watch" || phase === "signoff" ? (
                <button type="button" className="pill is-quiet" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
                  {playing ? "Pause" : "Play"}
                </button>
              ) : null}
              <button type="button" className="pill is-quiet" onClick={restart}>
                Restart
              </button>
              <div className="segmented" role="group" aria-label="Speed">
                {([1, 2] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="demo-status" aria-live="polite">
        {phase === "idle"
          ? "Larkspur is a made-up online shop. One of its engineers opened a pull request written with a coding agent. Start the demo to watch Vera work on it, then review it yourself."
          : phase === "review"
            ? "Your turn: you're the reviewer. Answer two questions about the change, then approve."
            : phase === "done"
              ? `Signed off: every role approved ${clock(elapsed - reviewStart)} after your review (the waits played compressed).`
              : phase === "signoff" && signoffs.size >= 5
                ? "Waiting for people to sign off. Each long wait plays in a second."
                : current
                  ? `${current.name} is working.`
                  : last?.type === "rule.eval"
                    ? "Checking the team's rules in .vera.yml."
                    : "Starting…"}
      </p>

      <div className="demo-grid">
        <section className="demo-pr" aria-label="The pull request">
          <header className="demo-pr-head">
            <p className="demo-repo">
              {CHANGE.repo} <span className="muted">#{CHANGE.number}</span>
            </p>
            <h2>{CHANGE.title}</h2>
            <p className="muted demo-meta">
              {CHANGE.author}, with a coding agent · <span className="mono">+412 −88</span> · {CHANGE.files.length} files ·{" "}
              <span className="demo-label">{CHANGE.labels[0]}</span>
            </p>
            <p className={`demo-check${passed ? " is-passed" : ""}`}>
              <span className="demo-check-dot" aria-hidden="true" />
              Vera: sign-off · {passed ? "all approved" : events.length ? "pending" : "not started"}
            </p>
          </header>

          <ul className="demo-files" aria-label="Changed files">
            {CHANGE.files.map((f) => {
              const area = map?.areas.find((a) => a.files.includes(f.path));
              return (
                <li key={f.path}>
                  <span className={`risk${area ? ` is-${area.risk}` : ""}`} aria-hidden="true" />
                  <span className="mono demo-path">{f.path}</span>
                  <span className="mono muted demo-lines">
                    +{f.added} −{f.removed}
                  </span>
                  {area ? <span className="sr-only">{RISK_LABEL[area.risk]}</span> : null}
                </li>
              );
            })}
          </ul>

          <div className="demo-comment">
            <div className="pr-mock-head">
              <span className="pr-mock-avatar" aria-hidden="true">
                <Mark size={18} />
              </span>
              <strong>vera</strong>
              <span className="muted">{events.length ? "is reviewing this pull request" : "will comment here"}</span>
            </div>
            <div className="demo-comment-body">
              {map ? (
                <div className="demo-block">
                  <h3 className="pr-mock-label">What this touches</h3>
                  <ul className="demo-areas">
                    {map.areas.map((a) => (
                      <li key={a.name}>
                        <span className={`risk is-${a.risk}`} aria-hidden="true" />
                        <span>
                          <strong>{a.name}</strong> <span className="muted">· {a.why}</span>
                          <span className="sr-only"> ({RISK_LABEL[a.risk]})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="pr-mock-flag">
                    <span className="pr-mock-flag-label">Likely AI-written</span>
                    {map.likelyAi.reasons.join(", ")}.
                  </p>
                </div>
              ) : (
                <p className="muted demo-empty">The map appears here when the Mapper is done.</p>
              )}

              {rules.length ? (
                <div className="demo-block">
                  <h3 className="pr-mock-label">Rules (.vera.yml)</h3>
                  <ul className="demo-rules">
                    {rules.map((r) =>
                      r.type === "rule.eval" ? (
                        <li key={r.rule} className={r.matched ? "is-matched" : undefined}>
                          <span className="mono">{r.rule}</span>
                          <span className="muted">{r.matched ? r.detail : `no: ${r.detail}`}</span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              ) : null}

              {briefs ? (
                <div className="demo-block">
                  <h3 className="pr-mock-label">One brief per role</h3>
                  <div className="demo-briefs">
                    {briefs.briefs.map((b) => (
                      <div key={b.role} className="demo-brief">
                        <p className="demo-brief-head">
                          <strong>{b.role}</strong>
                          <span className="muted mono">
                            {b.to} · {b.via === "slack" ? "Slack" : "GitHub"}
                          </span>
                        </p>
                        <p>{b.summary}</p>
                        <ul className="muted">
                          {b.points.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {questions ? (
                <div className="demo-block demo-review" ref={reviewRef}>
                  <h3 className="pr-mock-label">Before you approve</h3>
                  {questions.questions.map((q, i) => {
                    const chosen = answers[q.id];
                    const graded = Boolean(grade);
                    return (
                      <fieldset key={q.id} className="demo-question" disabled={phase !== "review"}>
                        <legend>
                          {i + 1}. {q.prompt}
                        </legend>
                        <pre className="demo-diff" aria-label={`From ${q.file}`}>
                          <span className="demo-diff-file">{q.file}</span>
                          {q.diff.map((line) => (
                            <span key={line} className={line.startsWith("+") ? "is-add" : line.startsWith("-") ? "is-del" : undefined}>
                              {line}
                            </span>
                          ))}
                        </pre>
                        <div className="demo-options">
                          {q.options.map((o) => (
                            <label
                              key={o.id}
                              className={`demo-option${graded && o.id === q.answer ? " is-answer" : ""}${graded && chosen === o.id && o.id !== q.answer ? " is-wrong" : ""}`}
                            >
                              <input
                                type="radio"
                                name={q.id}
                                value={o.id}
                                checked={chosen === o.id}
                                onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                              />
                              {o.text}
                            </label>
                          ))}
                        </div>
                        {graded ? (
                          <p className={`demo-explain${chosen === q.answer ? " is-right" : ""}`}>
                            <strong>{chosen === q.answer ? "Right." : "Not quite."}</strong> {q.explain}
                          </p>
                        ) : null}
                      </fieldset>
                    );
                  })}
                  {phase === "review" ? (
                    <button type="button" className="pill" disabled={!answeredAll} onClick={approve}>
                      Approve with these answers
                    </button>
                  ) : null}
                  {phase === "signoff" && !grade ? <p className="muted">Grading your answers…</p> : null}
                  {grade ? (
                    <p className="pr-mock-flag">
                      <span className="pr-mock-flag-label">Understanding</span>
                      {grade.right} of {grade.of} recorded on your approval.{" "}
                      {grade.right < grade.of
                        ? "Your approval still counts: the gate is off by default, and the record shows what was missed."
                        : "It shows next to your name on the approval."}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {signoffs.size ? (
                <div className="demo-block">
                  <h3 className="pr-mock-label">Sign-off</h3>
                  <ul className="pr-mock-list demo-signoffs">
                    {[...signoffs.values()].map((s) => (
                      <li key={s.role}>
                        <span className={`signoff${s.status === "approved" ? " is-done" : ""}`} aria-hidden="true" />
                        <strong>{s.role}</strong> <span className="muted">{s.who}</span>{" "}
                        <span className="muted">
                          · {s.status === "approved" ? "approved" : s.status === "reminded" ? "reminded" : "asked"} in{" "}
                          {s.via === "slack" ? "Slack" : "GitHub"}
                          {s.status !== "asked" && s.at > reviewStart + 10_000 ? `, after ${clock(s.at - reviewStart)}` : ""}
                          {s.note ? ` · "${s.note}"` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="demo-run" aria-label="The run">
          <div className="demo-run-head">
            <p className="pr-mock-label">Run · demo-482</p>
            <p className="mono muted">Claude Opus 5.5 · read-only tools</p>
          </div>
          <ul className="demo-agents">
            {AGENTS.map((a) => (
              <li key={a.id} className={`demo-agent is-${status(a.id)}`}>
                <span className="demo-agent-dot" aria-hidden="true" />
                {a.name}
                <span className="sr-only"> ({status(a.id)})</span>
              </li>
            ))}
          </ul>
          <ol className="demo-log" ref={logRef} aria-label="Steps">
            {events.length === 0 ? <li className="muted">Steps appear here as each agent works.</li> : null}
            {events.map((e, i) => {
              if (e.type === "agent.start")
                return (
                  <li key={i} className="demo-log-agent">
                    {AGENTS.find((a) => a.id === e.agent)?.name}: {e.task}
                  </li>
                );
              if (e.type === "tool.call")
                return (
                  <li key={i} className="demo-step">
                    <span>
                      <span className="mono">{e.tool}</span>
                      <span className="muted"> {e.summary}</span>
                    </span>
                    <span className="mono muted demo-log-time">{e.latencyMs} ms</span>
                  </li>
                );
              if (e.type === "model.call")
                return (
                  <li key={i} className="demo-step">
                    <span>
                      <span className="mono">model</span>
                      <span className="muted">
                        {" "}
                        {k(e.inputTokens + e.cacheReadTokens)} in · {k(e.outputTokens)} out · {usd(e.costUsd)}
                      </span>
                    </span>
                    <span className="mono muted demo-log-time">{secs(e.latencyMs)}</span>
                  </li>
                );
              if (e.type === "rule.eval")
                return (
                  <li key={i}>
                    <span className="mono">rule</span>
                    <span className="muted">
                      {" "}
                      {e.rule}: {e.matched ? "yes" : "no"}
                    </span>
                  </li>
                );
              if (e.type === "signoff" && e.status !== "asked")
                return (
                  <li key={i}>
                    <span className="mono">{e.via}</span>
                    <span className="muted">
                      {" "}
                      {e.who} {e.status}
                    </span>
                  </li>
                );
              return null;
            })}
          </ol>
          <dl className="demo-totals">
            <div>
              <dt>Tool calls</dt>
              <dd>{sums.toolCalls}</dd>
            </div>
            <div>
              <dt>Model calls</dt>
              <dd>{sums.modelCalls}</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>{k(sums.inputTokens + sums.outputTokens)}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{usd(sums.costUsd)}</dd>
            </div>
          </dl>
        </aside>
      </div>

      {phase === "done" ? (
        <div className="demo-done">
          <p>
            <strong>Signed off.</strong> 5 of 5 approvals, understanding {grade?.right ?? 0} of {grade?.of ?? 2} recorded, and
            Vera&apos;s part cost {usd(sums.costUsd)} across {sums.modelCalls} model calls and {sums.toolCalls} tool calls.
          </p>
          <button type="button" className="pill is-quiet" onClick={restart}>
            Watch it again
          </button>
        </div>
      ) : null}
    </div>
  );
}
