import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set the Turbopack root to avoid issues with non‑ASCII characters in the workspace path
  turbopack: {
    root: "./",
  },
  // other Next.js config options can be added here
};

export default nextConfig;

