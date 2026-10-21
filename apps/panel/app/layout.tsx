import type { Metadata } from "next";
import { Doto } from "next/font/google";
import Link from "next/link";
import { CellField } from "@/components/CellField";
import { MotionToggle } from "@/components/MotionToggle";
import { Mark } from "@/components/Mark";
import { Nav, SubNav } from "@/components/Nav";
import "./globals.css";

// Dot-matrix display face for big numbers and short headlines only.
// next/font downloads it at build time and serves it from this app.
const doto = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-doto", display: "swap" });

const SITE = "https://vera-agent.vercel.app";
const DESCRIPTION =
  "AI doubled the code in every change, and review didn't get faster. Vera speeds it up: what to look at first, a brief for each role, everyone signing off at once, and proof someone understood it.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Vera · Review for the AI era", template: "%s · Vera" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Vera",
    title: "Vera · Review for the AI era",
    description: DESCRIPTION,
    url: SITE,
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Vera: Understood. Signed off. Shipped." }],
  },
  twitter: { card: "summary_large_image", title: "Vera · Review for the AI era", description: DESCRIPTION, images: ["/brand/og.png"] },
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
        <CellField />
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
