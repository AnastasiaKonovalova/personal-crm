import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone: the Docker image ships only what the app needs to run
  output: "standalone",
};

export default nextConfig;
