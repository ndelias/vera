"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const EVIDENCE = [
  { href: "/evidence", label: "Overview" },
  { href: "/hypotheses", label: "Hypotheses" },
  { href: "/work", label: "Work data" },
  { href: "/posts", label: "Posts" },
  { href: "/codebook", label: "Codebook" },
  { href: "/rounds", label: "Rounds" },
];

const isEvidence = (path: string) => EVIDENCE.some((e) => path === e.href || path.startsWith(`${e.href}/`));

export function Nav() {
  const path = usePathname();
  const inEvidence = isEvidence(path);
  return (
    <ul className="nav">
      <li>
        <Link href="/" aria-current={path === "/" ? "page" : undefined}>
          Product
        </Link>
      </li>
      <li>
        <Link href="/why" aria-current={path === "/why" ? "page" : undefined}>
          Why Vera
        </Link>
      </li>
      <li>
        <Link href="/evidence" aria-current={inEvidence ? "page" : undefined}>
          Evidence
        </Link>
      </li>
    </ul>
  );
}

/** The evidence pages' own tabs, under the header. */
export function SubNav() {
  const path = usePathname();
  if (!isEvidence(path)) return null;
  return (
    <nav aria-label="Evidence">
      <ul className="nav subnav">
        {EVIDENCE.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} aria-current={path === href || path.startsWith(`${href}/`) ? "page" : undefined}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
