import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase F (performance) — testes de "wiring" (leitura do código-fonte, no
 * mesmo estilo dos demais *.wiring.test.ts) que protegem as otimizações de
 * carregamento contra regressões silenciosas:
 * - leituras independentes continuam em paralelo;
 * - dados carregados no servidor usam as MESMAS chaves que os widgets usam
 *   no cliente (senão o widget buscaria de novo, duplicando a leitura);
 * - nada de recarregar o app inteiro para atualizar uma lista.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("Fase F — Dashboard", () => {
  const page = readSource("src/app/(protected)/dashboard/page.tsx")

  it("carrega snapshot, layout e dados dos widgets num único Promise.all", () => {
    const block = page.slice(page.indexOf("await Promise.all(["), page.indexOf("])", page.indexOf("await Promise.all([")))
    for (const loader of [
      "getDashboardData(",
      "getDashboardLayoutAction(",
      "getActiveCycleAction(",
      "getRecentStudyHistoryAction(14)",
      "getMonthlyDailyTotalsAction(",
      "getMonthlyStatsAction(",
    ]) {
      assert.ok(block.includes(loader), `${loader} deveria estar no Promise.all do Dashboard`)
    }
  })

  it("as chaves semeadas no servidor são as mesmas usadas pelos widgets no cliente", () => {
    const cycleWidget = readSource("src/features/study-cycle/components/intelligent-cycle-widget.tsx")
    const catalog = readSource("src/features/dashboard/components/dashboard-widget-catalog.tsx")
    assert.ok(page.includes("activeCycleOverview:"))
    assert.ok(cycleWidget.includes('"activeCycleOverview"'))
    assert.ok(page.includes('"recentStudyHistory:14"'))
    assert.ok(catalog.includes('"recentStudyHistory:14"'))
    assert.ok(page.includes("`monthlyCalendar:${calendarYear}:${calendarMonth}`"))
    assert.ok(catalog.includes("`monthlyCalendar:${"))
    assert.ok(page.includes("<InitialServerDataProvider data={initialWidgetData}>"))
  })
})

describe("Fase F — Ciclos", () => {
  it("a página carrega ciclos e disciplinas em paralelo no servidor e entrega à tela (ciclo ativo derivado da lista — Fase F.1)", () => {
    const page = readSource("src/app/(protected)/ciclos/page.tsx")
    assert.match(page, /Promise\.all\(\[[\s\S]*?getCyclesAction\(\)[\s\S]*?getDisciplinesForAutocomplete\(\)[\s\S]*?\]\)/)
    assert.ok(page.includes("pickActiveCycleOverview(cyclesResult.data)"))
    assert.ok(page.includes("<StudyCyclesView"))
    assert.ok(page.includes("initialData="))
  })

  it("com dados iniciais a tela não repete a carga no mount", () => {
    const view = readSource("src/features/study-cycle/components/study-cycles-view.tsx")
    assert.ok(view.includes("initialDataRef"))
    assert.ok(view.includes("const [isLoading, setIsLoading] = useState(!initialData)"))
  })
})

describe("Fase F — Estatísticas", () => {
  const action = readSource("src/application/study-analytics/statistics-center.action.ts")

  it("as leituras independentes do payload rodam em paralelo", () => {
    assert.match(
      action,
      /await Promise\.all\(\[\s*loadSessions\(supabase, effectiveUserId\),\s*loadAttempts\(supabase, effectiveUserId\),\s*loadDisciplines\(supabase, effectiveUserId\),\s*loadReviewItems\(supabase, effectiveUserId\),\s*loadReviewsCompletedLast30\(supabase, effectiveUserId\),\s*loadActivePlan\(supabase, effectiveUserId\),\s*loadWeekStartDay\(supabase, effectiveUserId\),/,
    )
  })

  it("sessões paginadas em paralelo, com desempate estável por id", () => {
    assert.ok(action.includes("fetchAllPagesInParallel"))
    assert.ok(action.includes('.order("id", { ascending: true })'))
  })

  it("a página entrega os dados iniciais e a tela não repete a carga no mount", () => {
    const page = readSource("src/app/(protected)/estatisticas/page.tsx")
    const view = readSource("src/features/statistics/components/statistics-center-view.tsx")
    assert.ok(page.includes("getStatisticsCenterAction()"))
    assert.ok(page.includes("<StatisticsCenterView initialData={initialData} />"))
    assert.ok(view.includes("if (hasInitialData) return"))
  })
})

describe("Fase F — Histórico", () => {
  it("leitura completa com páginas em paralelo, desempate por id e erro ainda lançado", () => {
    const service = readSource("src/application/study-history/study-history.service.ts")
    const fn = service.slice(service.indexOf("export async function getAllUserHistory"))
    assert.ok(fn.includes("fetchAllPagesInParallel"))
    assert.ok(fn.includes('.order("started_at", { ascending: false })'))
    assert.ok(fn.includes('.order("id", { ascending: false })'))
    assert.ok(fn.includes('throw new Error("Erro ao buscar histórico completo: "'))
  })

  it("a lista renderiza dias aos poucos; totais continuam sobre todas as sessões filtradas", () => {
    const view = readSource("src/features/history/components/history-view.tsx")
    assert.ok(view.includes("selectVisibleDayGroups(dayGroups, sessionBudget)"))
    assert.ok(view.includes("{visibleDays.visible.map((day) => ("))
    assert.equal(view.includes("{dayGroups.map((day) => ("), false)
    assert.ok(view.includes("const totalMinutes = currentSessions.reduce("))
  })
})

describe("Fase F — Revisões", () => {
  it("fim da sessão de revisão atualiza via router.refresh, sem recarregar o app inteiro", () => {
    const tabs = readSource("src/features/reviews/components/review-tabs.tsx")
    assert.equal(tabs.includes("window.location.reload()"), false)
    assert.ok(tabs.includes("router.refresh()"))
  })
})

describe("Fase F — sessão por requisição", () => {
  it("createClient e getEffectiveSessionUser são memoizados por requisição (React cache)", () => {
    const server = readSource("src/infrastructure/supabase/server.ts")
    const guard = readSource("src/application/admin/auth-guard.ts")
    assert.ok(server.includes("export const createClient = cache("))
    assert.ok(guard.includes("export const getEffectiveSessionUser = cache("))
  })
})
