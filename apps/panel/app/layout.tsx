import type { Metadata } from "next";
import { Doto } from "next/font/google";
import Link from "next/link";
import { Mark } from "@/components/Mark";
import { Nav } from "@/components/Nav";
import "./globals.css";

// Dot-matrix display face for big numbers and short headlines only.
// next/font downloads it at build time and serves it from this app.
const doto = Doto({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-doto", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Vera research", template: "%s · Vera research" },
  description: "The research behind Vera: where product teams lose time, measured from public data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={doto.variable}>
      <head>
        <link rel="preload" href="/fonts/instrument-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <div className="shell">
          <header className="top">
            <Link href="/" className="brand">
              <Mark size={22} />
              vera <span className="muted">· research</span>
            </Link>
            <nav aria-label="Panel">
              <Nav />
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
