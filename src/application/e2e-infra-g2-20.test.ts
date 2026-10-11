import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

// G2.20 — a infraestrutura E2E não vaza para produção nem para o `npm test`.

const read = (p: string) => readFileSync(p, "utf8")
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe("G2.20 — isolamento do harness E2E", () => {
  it("páginas de harness só existem com NOMEIA_E2E_HARNESS=1 (extensão e2e.tsx) e nunca em produção da Vercel", () => {
    const cfg = read("next.config.ts")
    assert.match(cfg, /const E2E_HARNESS = process\.env\["NOMEIA_E2E_HARNESS"\] === "1"/)
    assert.match(cfg, /pageExtensions: E2E_HARNESS \? \["e2e\.tsx", "tsx", "ts", "jsx", "js"\] : \["tsx", "ts", "jsx", "js"\]/)
    assert.match(cfg, /E2E_HARNESS && process\.env\["VERCEL_ENV"\] === "production"/)
    const files = walk("src/app/e2e-harness")
    const pages = files.filter((f) => /[\\/]page\.[^\\/]+$/.test(f))
    assert.ok(pages.length >= 2)
    for (const p of pages) assert.match(p, /page\.e2e\.tsx$/, `${p} viraria rota no build normal`)
    for (const f of files.filter((x) => x.endsWith(".tsx") || x.endsWith(".ts"))) {
      const src = read(f)
      assert.doesNotMatch(src, /createClient|supabase|\.from\(|service_role|SERVICE_ROLE/i, f)
      assert.doesNotMatch(src, /requestMentorAnalysisAction|OpenAICompatibleMentorProvider|MENTOR_AI_API_KEY/, f)
    }
  })

  it("rotas reais continuam protegidas: o harness não entra na lista de rotas públicas nem altera a proteção", () => {
    assert.doesNotMatch(read("src/domain/auth/protected-routes.ts"), /e2e/)
    assert.doesNotMatch(read("src/infrastructure/supabase/proxy.ts"), /e2e|NOMEIA_E2E/i)
    assert.doesNotMatch(read("src/proxy.ts"), /e2e|NOMEIA_E2E/i)
  })

  it("painel do Mentor: produção usa sempre a Server Action; só o harness injeta respostas", () => {
    const panel = read("src/features/mentor/components/mentor-analysis-panel.tsx")
    assert.match(panel, /requestAnalysis = requestMentorAnalysisAction/)
    assert.doesNotMatch(read("src/app/(protected)/mentor/page.tsx"), /requestAnalysis=/)
  })
})

describe("G2.20 — E2E separado do npm test e sem dependência externa", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string>; devDependencies: Record<string, string>; dependencies: Record<string, string> }

  it("npm test não roda E2E; existe npm run test:e2e; Playwright só como devDependency", () => {
    assert.doesNotMatch(pkg.scripts["test"] ?? "", /playwright|e2e\//)
    assert.equal(pkg.scripts["test:e2e"], "playwright test")
    assert.match(pkg.devDependencies["@playwright/test"] ?? "", /^\d+\.\d+\.\d+$/, "versão exata")
    assert.equal(pkg.dependencies["@playwright/test"], undefined)
    assert.doesNotMatch(pkg.scripts["build"] ?? "", /playwright/)
  })

  it("servidor de teste isolado: Supabase local inexistente, Sentry descartável, Mentor IA desligado; auth só com Supabase LOCAL", () => {
    const cfg = read("playwright.config.ts")
    assert.match(cfg, /NOMEIA_E2E_HARNESS: "1"/)
    assert.match(cfg, /return "http:\/\/127\.0\.0\.1:54399"/)
    assert.match(cfg, /NEXT_PUBLIC_SENTRY_DSN: "http:\/\/e2e@127\.0\.0\.1:9\/0"/)
    assert.match(cfg, /MENTOR_AI_ENABLED: "false"/)
    assert.match(cfg, /\(127\\\.0\\\.0\\\.1\|localhost\)/, "fluxo autenticado só contra localhost")
    assert.match(cfg, /screenshot: "only-on-failure"/)
    assert.match(cfg, /trace: "retain-on-failure"/)
  })

  it("testes bloqueiam rede externa e saneiam o que vai para o relatório", () => {
    const support = read("e2e/support/test.ts")
    assert.match(support, /if \(!local \|\| url\.pathname\.startsWith\("\/monitoring"\)\) return route\.abort\(\)/)
    assert.match(support, /JWT/)
    assert.match(support, /auth-token/)
  })

  it("saídas do E2E ficam fora do git", () => {
    const gi = read(".gitignore")
    for (const p of ["/e2e/.results/", "/e2e/.report/", "/e2e/.auth/"]) assert.ok(gi.includes(p), p)
  })
})
