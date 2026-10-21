import type { Metadata } from "next";
import { StatusBadge } from "@/components/StatusBadge";
import { hypotheses } from "@/lib/data";
import { day } from "@/lib/format";

export const metadata: Metadata = { title: "Hypotheses" };

export default function Hypotheses() {
  const items = hypotheses();

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Hypotheses</p>
        <h1>What we think, and what would prove it wrong</h1>
        <p className="lede">
          Each hypothesis is written with the result that would disprove it before it is tested. Tests run
          on the coded corpus, not the sample. A hypothesis that fails gets revised as a new version, and the
          old one stays here.
        </p>
      </div>

      <div className="list">
        {items.map(({ hypothesis: h, history, tests }) => (
          <article key={h.id} className="card" style={{ display: "grid", gap: 12 }}>
            <div className="section-head" style={{ margin: 0 }}>
              <span className="mono muted">{h.id} · v{h.version} · round {h.round_id}</span>
              <StatusBadge status={h.status} />
            </div>
            <h2 style={{ fontSize: 18, maxWidth: 760 }}>{h.statement}</h2>
            <dl className="kv">
              <dt>Disproved if</dt>
              <dd>{h.disproved_if}</dd>
              <dt>Tests</dt>
              <dd>
                {tests.length === 0 ? (
                  <span className="muted">None run yet. Waits on coding the corpus.</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {tests.map((t) => (
                      <li key={t.id}>
                        <StatusBadge status={t.verdict} /> {t.method}{" "}
                        <span className="muted">· round {t.round_id} · {day(t.ran_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              {history.length ? (
                <>
                  <dt>Earlier</dt>
                  <dd>
                    {history.map((old) => (
                      <p key={old.version} className="muted">v{old.version} ({old.status}): {old.statement}</p>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
