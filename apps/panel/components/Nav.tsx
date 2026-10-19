"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/posts", label: "Posts" },
  { href: "/codebook", label: "Codebook" },
  { href: "/hypotheses", label: "Hypotheses" },
  { href: "/rounds", label: "Rounds" },
];

export function Nav() {
  const path = usePathname();
  return (
    <ul className="nav">
      {LINKS.map(({ href, label }) => {
        const current = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <li key={href}>
            <Link href={href} aria-current={current ? "page" : undefined}>
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
