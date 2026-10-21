import path from "node:path";
import type { NextConfig } from "next";

// The production Docker image (Dockerfile) sets NEXT_STANDALONE=1: Next.js then builds a self-contained server in
// .next/standalone with only the files it needs. Local builds keep the normal output, so `next start` works as before.
const standalone = process.env.NEXT_STANDALONE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(standalone
    ? {
        output: "standalone" as const,
        // pnpm monorepo: trace dependencies from the repository root.
        outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
      }
    : {}),
};

export default nextConfig;
