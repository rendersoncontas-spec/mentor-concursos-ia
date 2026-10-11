import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { nextTabIndex } from "@/lib/a11y/tab-keyboard"

// G2.22 — mobile, acessibilidade (abas, tema escuro, contraste) e CI.

const read = (p: string) => readFileSync(p, "utf8")
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

describe("G2.22 — teclado do padrão de abas (APG)", () => {
  it("← → circulam; Home/End vão às pontas; outras teclas não pertencem ao padrão", () => {
    assert.equal(nextTabIndex("ArrowRight", 0, 2), 1)
    assert.equal(nextTabIndex("ArrowRight", 1, 2), 0)
    assert.equal(nextTabIndex("ArrowLeft", 0, 2), 1)
    assert.equal(nextTabIndex("ArrowLeft", 2, 3), 1)
    assert.equal(nextTabIndex("Home", 2, 3), 0)
    assert.equal(nextTabIndex("End", 0, 3), 2)
    assert.equal(nextTabIndex("Enter", 0, 2), null)
    assert.equal(nextTabIndex("ArrowDown", 0, 2), null)
    assert.equal(nextTabIndex("ArrowRight", 0, 0), null)
  })

  it("Central de estudos: abas com id, aria-controls, tabindex móvel e painel rotulado", () => {
    const src = read("src/features/study-session/components/study-register-modal.tsx")
    assert.match(src, /aria-orientation="horizontal"/)
    assert.match(src, /nextTabIndex\(event\.key, isManualMode \? 1 : 0, 2\)/)
    assert.match(src, /tabIndex=\{isManualMode \? -1 : 0\}/)
    assert.match(src, /tabIndex=\{isManualMode \? 0 : -1\}/)
    assert.equal((src.match(/aria-controls=\{modePanelId\}/g) ?? []).length, 2)
    assert.match(src, /role="tabpanel"\s+id=\{modePanelId\}\s+aria-labelledby=\{isManualMode \? manualTabId : timerTabId\}/)
  })
})

describe("G2.22 — Dashboard sem flash de 3 colunas no celular", () => {
  it("a estrutura inicial (antes de medir a tela) se adapta só com CSS e preserva a ordem do layout", () => {
    const src = read("src/features/dashboard/components/dashboard-dnd-context.tsx")
    // Servidor e 1ª renderização do cliente continuam iguais (sem hydration mismatch).
    assert.match(src, /useState<"mobile" \| "tablet" \| "desktop">\("desktop"\)/)
    assert.match(src, /const adaptive = breakpoint === "desktop"/)
    assert.match(src, /"contents xl:flex xl:min-w-0 xl:flex-1 xl:flex-col xl:gap-3"/)
    assert.match(src, /md:grid md:grid-cols-2 md:items-start xl:flex xl:flex-row/)
    assert.match(src, /style=\{\{ order: order\.get\(item\.widget_id\) \}\}/)
    assert.match(src, /new Map\(items\.map\(\(item, index\) => \[item\.widget_id, index\]\)\)/)
  })
})

describe("G2.22 — tema escuro e contraste", () => {
  it("botão primário do tema escuro: texto grafite sobre o verde-petróleo (não branco)", () => {
    const css = read("src/app/globals.css")
    const dark = css.slice(css.indexOf(".dark {"))
    assert.match(dark, /--primary:\s+172 40% 48%;/)
    assert.match(dark, /--primary-foreground: 220 20% 10%;/)
    assert.match(dark, /--destructive-foreground: 220 20% 10%;/)
  })

  it("nenhum 'bg-primary' com 'text-white' fixo (usa text-primary-foreground, que segue o tema)", () => {
    const offenders: string[] = []
    for (const f of walk("src").filter((x) => x.endsWith(".tsx"))) {
      for (const lit of read(f).match(/"[^"\n]*"|`[^`]*`/g) ?? []) {
        if (/(?<![\w:-])bg-primary(?![\w/-])/.test(lit) && /(?<![\w:/-])text-white(?![\w/-])/.test(lit)) offenders.push(f)
      }
    }
    assert.deepEqual(offenders, [])
  })

  it("simulado-result: tons positivos/negativos centralizados (AA nos dois temas) e estado com texto", () => {
    const src = read("src/features/simulados/components/simulado-result.tsx")
    assert.doesNotMatch(src, /(?<![\w:/-])text-(emerald|amber|rose)-600(?![\w/-])/)
    assert.match(src, /positive: "text-emerald-700 dark:text-emerald-400"/)
    assert.match(src, /negative: "text-rose-700 dark:text-rose-400"/)
    assert.match(src, /questionStatusLabel\(correct, wrong\)/)
    assert.match(src, /aria-expanded=\{open\}/)
    assert.match(src, /<Progress aria-label="Respostas corretas"/)
  })
})

describe("G2.22 — workflow de CI", () => {
  // O workflow vive em .github/workflows/ci.yml. Uma cópia idêntica fica em
  // docs/ci/github-actions-ci.yml (a pasta .github não pôde ser gravada pela
  // ferramenta de sincronização da G2.22 e é copiada à mão). Quando as duas
  // existem, precisam ser iguais.
  const WORKFLOW = ".github/workflows/ci.yml"
  const TEMPLATE = "docs/ci/github-actions-ci.yml"
  const ci = existsSync(WORKFLOW) ? read(WORKFLOW) : read(TEMPLATE)

  it("workflow ativo e cópia em docs/ci são idênticos", () => {
    if (existsSync(WORKFLOW)) assert.equal(read(WORKFLOW), read(TEMPLATE))
    else assert.ok(read(TEMPLATE).includes("name: CI"))
  })

  it("roda instalação reprodutível, unitários, TypeScript, build e E2E; guarda artefatos só em falha", () => {
    for (const step of ["npm ci", "npm test", "npx tsc --noEmit", "npm run build", "npx playwright install --with-deps chromium", "npm run test:e2e"]) {
      assert.ok(ci.includes(`run: ${step}`), step)
    }
    assert.match(ci, /if: failure\(\)\s+uses: actions\/upload-artifact@v4/)
    assert.match(ci, /e2e\/\.results/)
    assert.match(ci, /\.next\/server\/app\/e2e-harness/, "confere que o build normal não tem harness")
  })

  it("sem segredos, sem deploy/publicação e só permissão de leitura", () => {
    // Só as linhas de configuração (os comentários explicam o que NÃO é feito).
    const code = ci.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n")
    assert.doesNotMatch(code, /secrets\./)
    // Palavras inteiras: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY é só o nome de uma variável fictícia.
    assert.doesNotMatch(code, /\b(vercel|deploy|publish|release|gh-pages)\b|cap sync/i)
    assert.match(ci, /permissions:\s+contents: read/)
    assert.doesNotMatch(ci, /NOMEIA_E2E_HARNESS/, "o harness só é ligado pelo playwright.config.ts, nunca no build")
    assert.doesNotMatch(ci, /MENTOR_AI_API_KEY|SERVICE_ROLE|supabase\.co/i)
    assert.match(ci, /NEXT_PUBLIC_SUPABASE_URL: http:\/\/127\.0\.0\.1:54399/)
  })
})
