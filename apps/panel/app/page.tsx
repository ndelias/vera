import Link from "next/link";
import { AgentsShowcase } from "@/components/AgentsShowcase";
import { Arrow } from "@/components/Arrow";
import { DotNumber } from "@/components/DotNumber";
import { Mark } from "@/components/Mark";
import { NodeFlow } from "@/components/NodeFlow";
import { AGENTS, MILESTONES, SURFACES, type Status } from "@/lib/product-content";
import { headline } from "@/lib/case";

const pct = (x: number) => `${Math.round(x * 100)}%`;

const STATUS_LABEL: Record<Status, string> = { done: "Done", next: "Next", planned: "Planned" };

function Progress({ status }: { status: Status }) {
  return <span className={`progress is-${status}`}>{STATUS_LABEL[status]}</span>;
}

export default function Product() {
  const h = headline();

  return (
    <>
      <section className="hero reveal" aria-labelledby="hero-title">
        <p className="eyebrow">Vera · review for the AI era</p>
        <h1 className="hero-title" id="hero-title">
          <span>Understood.</span>
          <span>Signed off.</span>
          <span>Shipped.</span>
        </h1>
        <p className="lede hero-lede">
          AI doubled the code in every change, and review didn&apos;t get any faster. Vera speeds it up to match: it shows
          reviewers what to look at first, briefs each role, and gets everyone to sign off at once, with proof someone
          understood the change.
        </p>
        <div className="hero-actions">
          <Link href="/demo" className="pill">Try the demo<Arrow /></Link>
          <Link href="/why" className="pill is-quiet">Why I&apos;m building it</Link>
        </div>
      </section>

      <section className="section" aria-label="How Vera works on one change">
        <NodeFlow />
      </section>

      <section className="section" id="how">
        <div className="section-head">
          <h2>Four agents, one change</h2>
          <p>
            A coordinator hands each pull request to four agents. They read; they never run the code or push to it.
          </p>
        </div>
        <AgentsShowcase agents={AGENTS} />
      </section>

      <section className="section" id="preview">
        <div className="section-head">
          <h2>What a reviewer sees</h2>
          <p>
            One comment on the pull request and one check. The comment says what changed and who needs to look; the check
            stays pending until the people the rules name have signed off.
          </p>
        </div>
        <figure className="pr-mock">
          <div className="pr-mock-head">
            <span className="pr-mock-avatar" aria-hidden="true"><Mark size={18} /></span>
            <strong>vera</strong>
            <span className="muted">commented on #482 · Move checkout totals to the new pricing service</span>
          </div>
          <div className="pr-mock-body">
            <div>
              <h3 className="pr-mock-label">What this touches</h3>
              <ul className="pr-mock-list">
                <li><span className="risk is-high" />Checkout totals <span className="muted">· pricing logic, 6 files</span></li>
                <li><span className="risk is-mid" />Order summary UI <span className="muted">· 2 components, preview linked</span></li>
                <li><span className="risk" />Tests <span className="muted">· 4 files, written with AI</span></li>
              </ul>
              <p className="pr-mock-flag">
                <span className="pr-mock-flag-label">Likely AI-written</span>
                AI help disclosed, 412 lines, no tests for the new rounding, 2 bot findings still open. Added the
                checkout owner as a second reviewer.
              </p>
            </div>
            <div>
              <h3 className="pr-mock-label">Before you approve</h3>
              <ol className="pr-mock-questions">
                <li>What happens to an order&apos;s total if the pricing service times out?</li>
                <li>Which existing discount codes would now round differently?</li>
              </ol>
            </div>
            <div>
              <h3 className="pr-mock-label">Sign-off</h3>
              <ul className="pr-mock-list">
                <li><span className="signoff is-done" />Engineering <span className="muted">· approved, answers recorded</span></li>
                <li><span className="signoff" />Checkout owner <span className="muted">· asked because it&apos;s likely AI-written</span></li>
                <li><span className="signoff is-done" />Design <span className="muted">· approved the preview</span></li>
                <li><span className="signoff" />Product <span className="muted">· asked in Slack, 2 h ago</span></li>
              </ul>
            </div>
          </div>
          <figcaption className="muted">
            A mock-up of the planned comment. Vera hasn&apos;t run on a real pull request yet.
          </figcaption>
        </figure>
      </section>

      <section className="section" id="rules">
        <div className="grid-2 rules">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2>Agents propose, code decides</h2>
            <p>
              Who has to sign off comes from rules in the repo, not from a model, including what happens when a change looks
              AI-written. The gate is a check run and the record only grows. An agent can suggest who should look; it
              can&apos;t talk its way past the rules.
            </p>
          </div>
          <pre className="code-card" aria-label="Example .vera.yml">
{`# .vera.yml
signoff:
  - when: "src/ui/**"
    roles: [design]
  - when: "src/auth/**"
    roles: [security]
  - when: { label: "behaviour-change" }
    roles: [product]
ai_changes:          # likely AI-written
  add: [code_owner]
  second_reviewer_over: 200   # lines
  understanding: required
understanding:
  record: true
  gate: false   # teams can turn it on`}
          </pre>
        </div>
      </section>

      <section className="section" id="surfaces">
        <div className="section-head">
          <h2>Where it runs</h2>
          <p>Without a server first, so it&apos;s cheap to keep alive and nobody&apos;s code sits on my machines.</p>
        </div>
        <div className="grid-2">
          {SURFACES.map((s) => (
            <div key={s.name} className="card list" style={{ gap: 8 }}>
              <div className="row-between">
                <h3>{s.name}</h3>
                <Progress status={s.status} />
              </div>
              <p className="muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-label="The problem in numbers">
        <div className="section-head">
          <h2>Why it&apos;s needed</h2>
          <p>Measured on GitLab&apos;s product repo, which is developed in public.</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-value"><DotNumber value={`2×`} /></span>
            <span className="stat-label">code per change</span>
            <span className="stat-note">Median lines per merge request, {h.linesFirst} to {h.linesLast} in two years.</span>
          </div>
          <div className="stat">
            <span className="stat-value"><DotNumber value={`-${pct(h.attentionDrop)}`} /></span>
            <span className="stat-label">review attention per line</span>
            <span className="stat-note">Review comments per line of code, same period.</span>
          </div>
          <div className="stat is-lime">
            <span className="stat-value"><DotNumber value={`${pct(h.aiShareLast)}`} /></span>
            <span className="stat-label">of changes written with AI</span>
            <span className="stat-note">Up from {pct(h.aiShareFirst)} a year earlier, counting only those that say so.</span>
          </div>
          <div className="stat">
            <span className="stat-value"><DotNumber value={`${h.crossRoleRatio}×`} /></span>
            <span className="stat-label">wait when several roles sign off</span>
            <span className="stat-note">Small changes reviewed by people from two or more roles.</span>
          </div>
        </div>
        <p className="chart-note">
          <Link href="/why">The full case: quotes, the market, trade-offs and what the data ruled out<Arrow /></Link>
        </p>
      </section>

      <section className="section" id="status">
        <div className="section-head">
          <h2>Where it&apos;s at</h2>
          <p>
            The research is done and the foundations are in. Each step ends with something that runs and the numbers
            behind it.
          </p>
        </div>
        <ol className="roadmap">
          {MILESTONES.map((m) => (
            <li key={m.id} className={`roadmap-step is-${m.status}`}>
              <span className="roadmap-id">{m.id}</span>
              <div>
                <h3>{m.title}</h3>
                <p className="muted">{m.body}</p>
              </div>
              <Progress status={m.status} />
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
