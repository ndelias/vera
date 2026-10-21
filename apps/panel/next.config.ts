import type { NextConfig } from "next";

// A fully static site: every page is rendered at build from the research
// snapshot (data/site.sqlite), so nothing runs on a server.
const config: NextConfig = {
  output: "export",
  poweredByHeader: false,
};

export default config;
