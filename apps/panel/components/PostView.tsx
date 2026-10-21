"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Arrow } from "./Arrow";
import type { Post, PostCoding, PostJudgment, PostMatch } from "@/lib/data";
import { day, num } from "@/lib/format";

type Data = { doc: Post; matches: PostMatch[]; judgments: PostJudgment[]; codings: PostCoding[]; sourceLabel: string };

// Shows one published post, named by ?id= (e.g. ?id=hn-41885465).
export function PostView() {
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    if (!/^[a-z-]+-\d+$/.test(id)) {
      setMissing(true);
      return;
    }
    fetch(`/posts/data/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Data) => {
        setData(d);
        document.title = `${d.doc.title ?? `${d.sourceLabel} ${d.doc.kind}`} · Vera`;
      })
      .catch(() => setMissing(true));
  }, []);

  const back = (
    <p style={{ marginBottom: 24 }}>
      <Link href="/posts"><Arrow dir="left" />All posts</Link>
    </p>
  );

  if (missing) {
    return (
      <>
        {back}
        <p className="muted">This post isn&apos;t published here. Only posts that were read or coded are.</p>
      </>
    );
  }
  if (!data) {
    return (
      <>
        {back}
        <p className="muted" aria-live="polite">Loading the post…</p>
      </>
    );
  }

  const { doc, matches, judgments, codings, sourceLabel } = data;
  return (
    <>
      {back}
      <div className="page-head">
        <p className="eyebrow">{sourceLabel} · {doc.kind} · {day(doc.created_at)}</p>
        {doc.title ? <h1 style={{ fontSize: 28 }}>{doc.title}</h1> : null}
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <article className="post-text">
          {doc.text}
          <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
            {doc.text.endsWith("…") ? "An excerpt. " : ""}
            <a href={doc.url} rel="noreferrer">Read it on {sourceLabel}<Arrow dir="out" /></a>
          </p>
        </article>

        <aside className="list">
          <div className="card list" style={{ gap: 10 }}>
            <h3>Source</h3>
            <dl className="kv">
              <dt>Words</dt><dd>{num(doc.words)}</dd>
              {doc.points !== null ? (<><dt>Points</dt><dd>{doc.points}</dd></>) : null}
              <dt>Original</dt>
              <dd><a href={doc.url} rel="noreferrer">{sourceLabel}<Arrow dir="out" /></a></dd>
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
                      {m.stage ? <div className="muted" style={{ fontSize: 12 }}>{m.stage}</div> : null}
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
            {judgments.length === 0 && codings.length === 0 ? <p className="muted">Not read or coded yet.</p> : null}
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
