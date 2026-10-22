import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

// G2.24 — o endurecimento dos testes E2E e da acessibilidade não vaza para
// produção: harnesses só com a flag, sem banco/segredo/rede/LLM; fronteiras de
// ações mantêm as Server Actions reais como padrão; sem exceções de axe.

const read = (p: string) => readFileSync(p, "utf8")
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const HARNESS_DIRS = readdirSync("src/app/e2e-harness").filter((d) => statSync(join("src/app/e2e-harness", d)).isDirectory())
const NEW_HARNESS = ["statistics", "reviews", "edital"] as const

describe("G2.24 — harnesses: isolamento e segurança", () => {
  it("todo harness (antigo e novo) só vira rota como page.e2e.tsx; nunca page.tsx/route/layout", () => {
    for (const dir of HARNESS_DIRS) {
      const files = readdirSync(join("src/app/e2e-harness", dir))
      assert.ok(files.includes("page.e2e.tsx"), `${dir}: sem page.e2e.tsx`)
      for (const f of files) {
        assert.doesNotMatch(f, /^(page|route|layout|loading|error|not-found)\.(tsx|ts|jsx|js)$/, `${dir}/${f} viraria rota sem a flag`)
      }
    }
    for (const dir of NEW_HARNESS) assert.ok(HARNESS_DIRS.includes(dir), dir)
  })

  it("nenhum arquivo de harness toca banco, sessão, cookies, variável de ambiente, HTML cru ou rede", () => {
    const files = walk("src/app/e2e-harness").filter((f) => /\.(tsx|ts)$/.test(f))
    assert.ok(files.length >= 14)
    for (const f of files) {
      const src = code(f)
      assert.doesNotMatch(src, /createClient|supabase|\.from\(|service_role|SERVICE_ROLE|process\.env|cookies\(|headers\(/i, f)
      assert.doesNotMatch(src, /dangerouslySetInnerHTML|\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, f)
      assert.doesNotMatch(src, /https?:\/\//, `${f}: URL externa`)
      assert.doesNotMatch(src, /requestMentorAnalysisAction|OpenAICompatibleMentorProvider|MENTOR_AI_API_KEY|NEXT_PUBLIC_/, f)
    }
  })

  it("fixtures de teste: sem segredo, token, e-mail real, chave de API nem chamada de rede", () => {
    const files = walk("src/lib/testing").filter((f) => /\.(tsx|ts)$/.test(f))
    for (const f of files) {
      const src = code(f)
      assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, `${f}: JWT`)
      assert.doesNotMatch(src, /\bsk-[A-Za-z0-9]{16,}|service_role|SERVICE_ROLE|process\.env|NEXT_PUBLIC_/, f)
      assert.doesNotMatch(src, /[\w.+-]+@(?!example\.)[\w-]+\.[\w.-]+/, `${f}: e-mail`)
      assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, f)
      // URLs só em domínios reservados/fictícios (dado exibido ou texto de ataque; nunca é buscado)
      for (const url of src.match(/https?:\/\/[^\s"'`)]+/g) ?? []) {
        assert.match(url, /^https?:\/\/(www\.)?(example\.com|exemplo\.io)/, `${f}: ${url}`)
      }
    }
  })

  it("a flag continua sendo o único portão: pageExtensions condicionado e recusa em produção da Vercel", () => {
    const cfg = read("next.config.ts")
    assert.match(cfg, /pageExtensions: E2E_HARNESS \? \["e2e\.tsx", "tsx", "ts", "jsx", "js"\] : \["tsx", "ts", "jsx", "js"\]/)
    assert.match(cfg, /E2E_HARNESS && process\.env\["VERCEL_ENV"\] === "production"/)
    assert.doesNotMatch(read("src/domain/auth/protected-routes.ts"), /e2e/i)
    assert.doesNotMatch(read("src/infrastructure/supabase/proxy.ts"), /e2e|NOMEIA_E2E/i)
  })

  it("código de produção não importa fixtures de teste nem o harness", () => {
    const prod = walk("src").filter(
      (f) => /\.(tsx|ts)$/.test(f) && !/[\\/]e2e-harness[\\/]/.test(f) && !/[\\/]lib[\\/]testing[\\/]/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    )
    for (const f of prod) assert.doesNotMatch(code(f), /@\/lib\/testing|e2e-harness/, f)
  })
})

describe("G2.24 — fronteiras de ações: produção = Server Actions reais", () => {
  const BOUNDARIES = [
    { file: "src/features/planejamento/planning-actions.tsx", real: "@/application/study-plan/replan/adaptive-replan.actions", def: "SERVER_PLANNING_ACTIONS" },
    { file: "src/features/statistics/statistics-actions.tsx", real: "@/application/study-analytics/statistics-center.action", def: "SERVER_STATISTICS_ACTIONS" },
    { file: "src/features/reviews/review-actions.tsx", real: "@/application/review-engine/review.actions", def: "SERVER_REVIEW_ACTIONS" },
    { file: "src/features/edital/edital-actions.tsx", real: "@/application/edital/edital.action", def: "SERVER_EDITAL_ACTIONS" },
  ] as const

  it("o valor padrão do contexto são as próprias Server Actions", () => {
    for (const b of BOUNDARIES) {
      const src = code(b.file)
      assert.ok(src.includes(`from "${b.real}"`), b.file)
      assert.match(src, new RegExp(`createContext<\\w+>\\(${b.def}\\)`), b.file)
      assert.doesNotMatch(src, /@\/lib\/testing|e2e-harness/, b.file)
    }
  })

  it("as telas chamam a fronteira (ref estável), não as Server Actions direto", () => {
    const direct: Record<string, RegExp> = {
      "src/features/planejamento/components/daily-planning-view.tsx": /import\s*\{[^}]*\b(getReplanInfoAction|getPeriodGoalAction)\b[^}]*\}\s*from/,
      "src/features/planejamento/components/weekly-planning-view.tsx": /import\s*\{[^}]*\bgetReplanInfoAction\b[^}]*\}\s*from/,
      "src/features/planejamento/components/study-calendar-view.tsx": /import\s*\{[^}]*\bgetReplanInfoAction\b[^}]*\}\s*from/,
      "src/features/planejamento/components/planning-goals-progress-card.tsx": /import\s*\{[^}]*\bgetPeriodGoalAction\b[^}]*\}\s*from/,
      "src/features/statistics/components/statistics-center-view.tsx": /import\s*\{[^}]*\bgetStatisticsCenterAction\b[^}]*\}\s*from/,
      "src/features/reviews/components/reviews-view.tsx": /import\s*\{[^}]*\b(getReviewsOverviewAction|setReviewItemFlagAction)\b[^}]*\}\s*from/,
      "src/features/reviews/components/review-session-modal.tsx": /import\s*\{[^}]*\b(answerReviewCardAction|startReviewSessionAction)\b[^}]*\}\s*from/,
      "src/features/reviews/components/add-to-review-modal.tsx": /import\s*\{[^}]*\b(addTopicToReviewAction|getReviewCatalogAction)\b[^}]*\}\s*from/,
      "src/features/edital/components/edital-accordion.tsx": /import\s*\{[^}]*\b(setEditalTopicProgressAction|saveCustomTopicsAction)\b[^}]*\}\s*from/,
    }
    for (const [file, re] of Object.entries(direct)) {
      const src = code(file)
      assert.doesNotMatch(src, re, `${file}: importa a Server Action direto (o harness não conseguiria trocá-la)`)
      assert.match(src, /use(Planning|Statistics|Review|Edital)ActionsRef\(\)/, file)
    }
  })

  it("nenhum provider de harness é montado em código de produção", () => {
    const prod = walk("src").filter((f) => /\.tsx$/.test(f) && !/[\\/]e2e-harness[\\/]/.test(f) && !/[\\/]lib[\\/]testing[\\/]/.test(f))
    for (const f of prod) {
      if (/(planning|statistics|review|edital)-actions\.tsx$/.test(f)) continue
      assert.doesNotMatch(code(f), /<(Planning|Statistics|Review|Edital)ActionsProvider/, f)
    }
  })
})

describe("G2.24 — acessibilidade: sem exceções de axe e contraste de chips", () => {
  it("lista global de exceções do axe vazia e nenhuma spec passa `exceptions`", () => {
    assert.match(read("e2e/support/axe.ts"), /export const AXE_EXCEPTIONS: AxeException\[\] = \[\]/)
    for (const f of readdirSync("e2e/specs").filter((x) => x.endsWith(".spec.ts"))) {
      const src = read(join("e2e/specs", f))
      assert.doesNotMatch(src, /exceptions\s*:/, `${f}: exceção de axe`)
      assert.doesNotMatch(src, /USER_COLOR_CHIP/, f)
    }
  })

  it("chip de disciplina usa a função de contraste (não fixa text-white sobre a cor do usuário)", () => {
    const src = read("src/features/planejamento/components/study-calendar-view.tsx")
    assert.match(src, /import \{ chipColors \} from "@\/lib\/a11y\/contrast"/)
    assert.match(src, /chipColors\(disc\.color/)
    assert.doesNotMatch(src, /rounded-md text-white flex items-center gap-1 shadow-2xs/)
  })

  it("contraste: função pura, sem DOM e sem dependências", () => {
    const src = code("src/lib/a11y/contrast.ts")
    assert.doesNotMatch(src, /document\.|window\.|\bimport\b/)
  })

  it("calendário do Histórico distingue erro de vazio (alerta + 'Tentar novamente')", () => {
    const cal = read("src/features/history/components/study-calendar.tsx")
    assert.match(cal, /role="alert"/)
    assert.match(cal, /Tentar novamente/)
    const view = read("src/features/history/components/history-view.tsx")
    assert.match(view, /monthlyLoadReducer/)
    assert.match(view, /id: "history-calendar-error"/)
  })
})

describe("G2.24 — cobertura registrada", () => {
  it("cada harness novo tem spec E2E e as specs cobrem axe claro/escuro e os 4 tamanhos", () => {
    const specs: Record<string, string> = {
      planning: "e2e/specs/planning-views.spec.ts",
      statistics: "e2e/specs/statistics.spec.ts",
      reviews: "e2e/specs/reviews.spec.ts",
      edital: "e2e/specs/edital.spec.ts",
      history: "e2e/specs/history-calendar.spec.ts",
    }
    for (const [dir, spec] of Object.entries(specs)) {
      assert.ok(existsSync(spec), spec)
      const src = read(spec)
      assert.ok(src.includes(`/e2e-harness/${dir}`), `${spec}: não usa o harness ${dir}`)
      assert.match(src, /expectNoAxeViolations/, spec)
      assert.match(src, /colorScheme/, `${spec}: sem tema claro/escuro`)
      for (const size of ["320", "375", "768", "1280"]) assert.ok(src.includes(`width: ${size}`), `${spec}: tamanho ${size}`)
    }
  })

  it("os testes novos de unidade estão no script `npm test`", () => {
    const script = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts["test"] ?? ""
    for (const t of [
      "src/lib/a11y/contrast.test.ts",
      "src/features/history/lib/monthly-load.test.ts",
      "src/application/e2e-hardening-g2-24.test.ts",
    ]) {
      assert.ok(script.includes(t), `${t} fora do npm test`)
    }
  })
})
