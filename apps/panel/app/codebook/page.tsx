import type { Metadata } from "next";
import Link from "next/link";
import { codebook } from "@/lib/data";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Codebook" };
export const dynamic = "force-dynamic";

export default function Codebook() {
  const codes = codebook();
  const version = codes[0]?.version ?? 1;
  const coded = codes.reduce((n, c) => n + c.posts, 0);

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Codebook v{version}</p>
        <h1>The pains we code for</h1>
        <p className="lede">
          Written bottom-up from reading 300 posts, before any counting. Each code has a definition a model
          can apply and an example a person can check. Changing a definition makes a new version; old codings
          keep the version they were made with.
        </p>
        {coded === 0 ? (
          <p className="muted">Draft. Not applied to the corpus yet, so there are no counts.</p>
        ) : null}
      </div>

      <div className="list">
        {codes.map((c) => (
          <article key={c.id} id={c.id} className="card" style={{ display: "grid", gap: 8 }}>
            <div className="section-head" style={{ margin: 0 }}>
              <h2 style={{ fontSize: 17 }}>{c.label}</h2>
              <span className="muted mono">
                {c.id}{c.posts ? ` · ${num(c.posts)} posts` : ""}
              </span>
            </div>
            <p>{c.definition}</p>
            {c.example ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Example:{" "}
                <Link href={`/posts/${encodeURIComponent(c.example)}`}>
                  &ldquo;{c.example_excerpt?.slice(0, 160).trim()}…&rdquo;
                </Link>
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
