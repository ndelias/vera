import Link from "next/link";
import { AgentsShowcase } from "@/components/AgentsShowcase";
import { Arrow } from "@/components/Arrow";
import { DotNumber } from "@/components/DotNumber";
import { HeroTitle } from "@/components/HeroTitle";
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
        <HeroTitle />
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
          <h2>Four steps, one change</h2>
          <p>
            Agents read each pull request and plain code decides who signs off. Nothing runs the code or pushes to it.
          </p>
        </div>
        <AgentsShowcase agents={AGENTS} />
      </section>

      <section className="section" id="preview">
        <div className="section-head">
          <h2>What a reviewer sees</h2>
          <p>
            One comment on the pull request and one check. The comment says where to look and who needs to sign off;
            the check shows who&apos;s left. Neither blocks the merge.
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
                <li><span className="risk is-high" />totals.ts L40–88 · Calls the pricing service <span className="muted">· a timeout leaves the total undefined</span></li>
                <li><span className="risk is-mid" />OrderSummary.tsx L12–30 · New rounding line <span className="muted">· discount codes may round differently</span></li>
                <li><span className="risk" />totals.test.ts L1–60 · Tests for the new totals <span className="muted">· none covers a timeout</span></li>
              </ul>
              <p className="pr-mock-flag">
                <span className="pr-mock-flag-label">Likely AI-written</span>
                AI co-author trailer in 3 of 3 commits.
              </p>
            </div>
            <div>
              <h3 className="pr-mock-label">Before you sign off</h3>
              <ol className="pr-mock-questions">
                <li>What happens to an order&apos;s total if the pricing service times out?</li>
                <li>Which existing discount codes would now round differently?</li>
              </ol>
            </div>
            <div>
              <h3 className="pr-mock-label">Sign-off · waiting on 1 of 2</h3>
              <ul className="pr-mock-list">
                <li><span className="signoff is-done" />Engineer · @ana <span className="muted">· signed off · understood 2 of 2</span></li>
                <li><span className="signoff" />Design (as lead) · @lena <span className="muted">· waiting · the order summary changes</span></li>
              </ul>
            </div>
          </div>
          <figcaption className="muted">
            An example in the layout Vera posts.{" "}
            <a href="https://github.com/ndelias/vera/pull/27#issuecomment-6528131441">See a real one on GitHub</a>.
          </figcaption>
        </figure>
      </section>

      <section className="section" id="rules">
        <div className="grid-2 rules">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2>Agents propose, code decides</h2>
            <p>
              Who has to sign off comes from the repo&apos;s <code>.vera.yml</code>, or its CODEOWNERS, not from a model. The
              agents suggest areas and where to look; code decides who is asked and records who signed off. An agent
              can&apos;t talk its way past the rules.
            </p>
          </div>
          <pre className="code-card" aria-label="Example .vera.yml">
{`# .vera.yml
lead: "@lena"   # when Vera isn't sure

areas:
  - name: Checkout
    description: Cart and payment
    paths: ["src/checkout/"]
  - name: Search
    paths: ["src/search/"]
    lead: "@sam"

people:
  - handle: "@ana"
    role: engineer
    areas: [Checkout]
  - handle: "@dev"
    role: design
    areas: [Checkout, Search]`}
          </pre>
        </div>
      </section>

      <section className="section" id="surfaces">
        <div className="section-head">
          <h2>Where it runs</h2>
          <p>
            Free and open source (Apache 2.0), on your own Anthropic key. No server, so nobody&apos;s code sits on my
            machines.
          </p>
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

      <section className="section" id="install">
        <div className="section-head">
          <h2>Try it on your repo</h2>
          <p>Three steps, about five minutes.</p>
        </div>
        <ol className="install-steps">
          <li>Add your Anthropic API key as a repository secret named <code>ANTHROPIC_API_KEY</code>.</li>
          <li>
            Add the workflow from the{" "}
            <a href="https://github.com/ndelias/vera#use-it-on-your-repo-the-github-action">README</a>, which runs{" "}
            <code>ndelias/vera@v0.6.0</code> on each pull request.
          </li>
          <li>Optionally, add a <code>.vera.yml</code> naming your areas and people. Without one, Vera uses CODEOWNERS.</li>
        </ol>
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
            Vera is installable (v0.6.0) and reviews its own pull requests and my portfolio&apos;s. Each step ends with
            something that runs and the numbers behind it.
          </p>
        </div>
        <ol className="roadmap">
          {MILESTONES.map((m) => (
            <li key={m.title} className={`roadmap-step is-${m.status}`}>
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
