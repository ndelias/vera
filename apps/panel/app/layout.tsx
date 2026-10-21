import type { Metadata } from "next";
import { Doto } from "next/font/google";
import Link from "next/link";
import { CodeField, MotionToggle } from "@/components/CodeField";
import { Mark } from "@/components/Mark";
import { Nav, SubNav } from "@/components/Nav";
import "./globals.css";

// Dot-matrix display face for big numbers and short headlines only.
// next/font downloads it at build time and serves it from this app.
const doto = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-doto", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Vera · Review for the AI era", template: "%s · Vera" },
  description:
    "Vera maps what a pull request touches, checks the reviewer understood it, and gets every role's sign-off in parallel. Built from public data on where product teams lose time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Light only, whatever the visitor's system setting. The dark tokens stay
    // in globals.css under [data-theme="dark"] for a toggle later.
    <html lang="en" className={doto.variable} data-theme="light">
      <head>
        <link rel="preload" href="/fonts/instrument-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <CodeField />
        <header className="top">
          <Link href="/" className="brand">
            <Mark size={22} />
            vera
          </Link>
          <nav aria-label="Site">
            <Nav />
          </nav>
        </header>
        <div className="shell">
          <SubNav />
          <main>{children}</main>
        </div>
        <footer className="foot">
          <span>
            Vera, by Nahuel Delias. <a href="https://github.com/ndelias/vera">The code</a>
          </span>
          <MotionToggle />
        </footer>
      </body>
    </html>
  );
}
