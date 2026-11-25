import type { NextConfig } from "next";

// No nonce: inline scripts (the data-js script in layout.tsx, Next's own) are allowed by 'unsafe-inline'.
// React needs eval only in development, for its debugging stacks
const isDev = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  // No preload: it would bind the whole domain, the landing included
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // For browsers without frame-ancestors
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone: the Docker image ships only what the app needs to run
  output: "standalone",
  // `next dev` would append its own instruction block to AGENTS.md and re-add it after removal;
  // AGENTS.md is written by the owner, so the Next.js docs hint is a line there instead
  agentRules: false,
  // Do not name the framework in responses
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
