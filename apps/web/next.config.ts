import path from "node:path";
import type { NextConfig } from "next";

// The production Docker image (Dockerfile) sets NEXT_STANDALONE=1: Next.js then builds a self-contained server in
// .next/standalone with only the files it needs. Local builds keep the normal output, so `next start` works as before.
const standalone = process.env.NEXT_STANDALONE === "1";

/**
 * Security headers on every response. Pages also get a per-request Content-Security-Policy from src/proxy.ts;
 * API responses get a deny-everything one (they are JSON, never rendered).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers only honour HSTS over https, so this is harmless on http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
    ];
  },
  ...(standalone
    ? {
        output: "standalone" as const,
        // pnpm monorepo: trace dependencies from the repository root.
        outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
      }
    : {}),
};

export default nextConfig;
