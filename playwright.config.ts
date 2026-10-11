import { defineConfig, devices } from "@playwright/test"

/**
 * G2.20 — testes de interface em navegador real (Playwright + Chromium).
 *
 * - Separado do `npm test` (unitário, node:test): `npm run test:e2e`.
 * - O servidor de teste é um `next dev` próprio (porta 3100) com variáveis
 *   ISOLADAS: Supabase apontando para um endereço local inexistente (nenhum
 *   dado real, nenhuma sessão), Sentry para um endereço local descartável,
 *   Mentor IA desligado. Valores definidos aqui têm prioridade sobre o
 *   `.env.local` (o Next não sobrescreve variáveis já definidas no processo).
 * - Páginas de harness (src/app/e2e-harness) só existem com NOMEIA_E2E_HARNESS=1.
 * - Toda requisição para fora de 127.0.0.1 é bloqueada nos testes (e2e/support/test.ts).
 *
 * Fluxo autenticado (opcional): ver docs/e2e-browser-testing.md (E2E_AUTH=1 + Supabase LOCAL).
 */

const PORT = Number(process.env["E2E_PORT"] ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`
const AUTH = process.env["E2E_AUTH"] === "1"
const CI = Boolean(process.env["CI"])

function supabaseUrl(): string {
  if (!AUTH) return "http://127.0.0.1:54399" // inexistente: nenhuma chamada sai da máquina
  const url = process.env["E2E_SUPABASE_URL"] ?? ""
  // Fluxo autenticado só contra Supabase LOCAL (supabase start). Nunca produção.
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error("E2E_AUTH=1 exige E2E_SUPABASE_URL apontando para um Supabase LOCAL (http://127.0.0.1:54321).")
  }
  return url
}

const E2E_ENV: Record<string, string> = {
  NOMEIA_E2E_HARNESS: "1",
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: AUTH ? (process.env["E2E_SUPABASE_ANON_KEY"] ?? "") : "e2e-anon-key-sem-valor",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: AUTH ? (process.env["E2E_SUPABASE_ANON_KEY"] ?? "") : "e2e-anon-key-sem-valor",
  NEXT_PUBLIC_SENTRY_DSN: "http://e2e@127.0.0.1:9/0",
  NEXT_PUBLIC_APP_MODE: "normal",
  NEXT_PUBLIC_APP_URL: BASE_URL,
  DATABASE_URL: "postgresql://e2e:e2e@127.0.0.1:9/e2e",
  RESEND_API_KEY: "re_e2e_desativado",
  MENTOR_AI_ENABLED: "false",
  MENTOR_AI_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
}

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e/.results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : 2,
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    serviceWorkers: "block",
    actionTimeout: 10_000,
    navigationTimeout: 45_000,
    // Cloud/CI com Chromium pré-instalado em outro caminho (opcional).
    ...(process.env["E2E_CHROMIUM_PATH"] ? { launchOptions: { executablePath: process.env["E2E_CHROMIUM_PATH"] } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }, testIgnore: AUTH ? [] : /authenticated\// },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testIgnore: AUTH ? [] : /authenticated\// },
  ],
  webServer: {
    command: `npx next dev --port ${PORT} --hostname 127.0.0.1`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !CI && process.env["E2E_REUSE_SERVER"] === "1",
    timeout: 240_000,
    env: E2E_ENV,
    stdout: "ignore",
    stderr: "pipe",
  },
})
