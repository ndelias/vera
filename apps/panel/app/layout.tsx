import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Discovery panel", template: "%s · Discovery panel" },
  description: "The research behind Blast Radius: where product teams lose time, measured from public data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/instrument-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <div className="shell">
          <header className="top">
            <Link href="/" className="brand">
              Blast Radius <span>· discovery</span>
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
