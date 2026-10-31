import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone: the Docker image ships only what the app needs to run
  output: "standalone",
  // `next dev` would append its own instruction block to AGENTS.md and re-add it after removal;
  // AGENTS.md is written by the owner, so the Next.js docs hint is a line there instead
  agentRules: false,
};

export default nextConfig;
