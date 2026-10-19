import Link from "next/link";
import { notFound } from "next/navigation";
import { Arrow } from "@/components/Arrow";
import { post } from "@/lib/data";
import { day, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = post(decodeURIComponent(id));
  if (!data) notFound();
  const { doc, matches, judgments, codings } = data;

  return (
    <>
      <p style={{ marginBottom: 24 }}>
        <Link href="/posts"><Arrow dir="left" />All posts</Link>
      </p>
      <div className="page-head">
        <p className="eyebrow">{doc.source.toUpperCase()} {doc.kind} · {day(doc.created_at)}</p>
        {doc.title ? <h1 style={{ fontSize: 28 }}>{doc.title}</h1> : null}
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <article className="post-text">{doc.text}</article>

        <aside className="list">
          <div className="card list" style={{ gap: 10 }}>
            <h3>Source</h3>
            <dl className="kv">
              <dt>Words</dt><dd>{num(doc.words)}</dd>
              {doc.points !== null ? (<><dt>Points</dt><dd>{doc.points}</dd></>) : null}
              <dt>Original</dt>
              <dd><a href={doc.url} rel="noreferrer">Hacker News<Arrow dir="out" /></a></dd>
            </dl>
          </div>

          <div className="card list" style={{ gap: 10 }}>
            <h3>Found by</h3>
            <table>
              <thead>
                <tr><th>Term</th><th>Round</th><th>Contains it</th></tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={`${m.round_id}-${m.query_id}`}>
                    <td>
                      <Link href={`/posts?query=${encodeURIComponent(m.query_id)}`}><code>{m.q}</code></Link>
                      <div className="muted" style={{ fontSize: 12 }}>{m.stage}</div>
                    </td>
                    <td>{m.round_id}</td>
                    <td>{m.exact ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card list" style={{ gap: 10 }}>
            <h3>Judgments</h3>
            {judgments.length === 0 && codings.length === 0 ? (
              <p className="muted">Not read or coded yet.</p>
            ) : null}
            {judgments.map((j) => (
              <p key={j.coder}>
                {j.relevant ? "About a pain" : "Not about a pain"}{" "}
                <span className="muted">· {j.coder}{j.reason ? `, ${j.reason}` : ""}</span>
              </p>
            ))}
            {codings.map((c) => (
              <div key={`${c.code_id}-${c.coder}`}>
                <Link href={`/codebook#${c.code_id}`}>{c.label}</Link>{" "}
                <span className="muted">· v{c.code_version} · {c.coder}</span>
                {c.evidence ? <p className="muted" style={{ fontSize: 13 }}>&ldquo;{c.evidence}&rdquo;</p> : null}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
