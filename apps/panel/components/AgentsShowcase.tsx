"use client";

import { useEffect, useRef, useState } from "react";
import { CrossMorph } from "./CrossMorph";
import { useMotion, useOnScreen } from "@/lib/motion";

// The four agents, one at a time: the icon on the left breaks apart into
// the next agent's every few seconds while the section is on screen.
// Choosing an agent stops the advance.

type Agent = { name: string; job: string; body: string; icon: string };

const ADVANCE_MS = 3500;

export function AgentsShowcase({ agents }: { agents: Agent[] }) {
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const motion = useMotion();
  const onScreen = useOnScreen(root);

  useEffect(() => {
    if (!motion || !onScreen || chosen) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % agents.length), ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [active, agents.length, chosen, motion, onScreen]);

  const agent = agents[active]!;
  return (
    <div ref={root} className="agents-showcase">
      <div className="agents-stage">
        <CrossMorph icon={agent.icon} still={!motion} label={`${agent.name}: ${agent.job}`} />
        <span className="agents-stage-label">
          {String(active + 1).padStart(2, "0")} / {String(agents.length).padStart(2, "0")} · {agent.name}
        </span>
      </div>
      <ol className="agents-list">
        {agents.map((a, i) => (
          <li key={a.name}>
            <button
              type="button"
              className="agent-row"
              aria-current={i === active || undefined}
              onClick={() => {
                setActive(i);
                setChosen(true);
              }}
            >
              <span className="agent-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="agent-text">
                <span className="agent-name">{a.name}</span>
                <span className="agent-job">{a.job}</span>
                <span className="agent-body"><span>{a.body}</span></span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
