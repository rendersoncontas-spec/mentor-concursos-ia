import type { NextConfig } from "next"

import { withSentryConfig } from "@sentry/nextjs"

import { LEGACY_ROUTE_REDIRECTS } from "./src/config/legacy-routes"

/**
 * G2.20 — páginas de harness E2E (`page.e2e.tsx`, em src/app/e2e-harness) só
 * viram rotas quando o Playwright sobe o servidor com NOMEIA_E2E_HARNESS=1.
 * Em `npm run dev`/`npm run build` normais (e na Vercel) elas NÃO existem:
 * `page.e2e.tsx` não casa com as extensões padrão. Ligar a flag num build de
 * produção da Vercel é recusado.
 */
const E2E_HARNESS = process.env["NOMEIA_E2E_HARNESS"] === "1"
if (E2E_HARNESS && process.env["VERCEL_ENV"] === "production") {
  throw new Error("NOMEIA_E2E_HARNESS não pode ser usado em produção.")
}

const nextConfig: NextConfig = {
  pageExtensions: E2E_HARNESS ? ["e2e.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  // Explicitly set the Turbopack root to avoid issues with non‑ASCII characters in the workspace path
  turbopack: {
    root: "./",
  },
  // Fase G.1: rotas antigas do Dashboard substituídas por /estatisticas
  // (ver src/config/legacy-routes.ts).
  async redirects() {
    return LEGACY_ROUTE_REDIRECTS.map((r) => ({ ...r }))
  },
  // other Next.js config options can be added here
}

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "nomeia",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env["CI"],

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
})
