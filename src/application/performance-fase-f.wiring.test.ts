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
  const section = readSource("src/features/dashboard/components/dashboard-widgets-section.tsx")

  it("carrega snapshot e layout em paralelo, e manda a área de widgets para trás de um Suspense (Fase F.3)", () => {
    const fastBlock = page.slice(page.indexOf("await Promise.all(["), page.indexOf("])", page.indexOf("await Promise.all([")))
    assert.ok(fastBlock.includes("getDashboardData("), "getDashboardData( deveria estar no Promise.all rápido do Dashboard")
    assert.ok(fastBlock.includes("getDashboardLayoutAction("), "getDashboardLayoutAction( deveria estar no Promise.all rápido do Dashboard")
    // Os 4 loaders mais lentos NÃO entram mais no Promise.all da página — foram
    // para dashboard-widgets-section.tsx (ver próximo teste), atrás do Suspense.
    for (const loader of ["getActiveCycleAction(", "getRecentStudyHistoryAction(14)", "getMonthlyDailyTotalsAction(", "getMonthlyStatsAction("]) {
      assert.ok(!fastBlock.includes(loader), `${loader} não deveria mais estar no Promise.all rápido do Dashboard (Fase F.3: foi para o Suspense)`)
    }
    assert.match(page, /<Suspense fallback=\{<DashboardWidgetsSkeleton \/>\}>[\s\S]*<DashboardWidgetsSection/)
  })

  it("a área de widgets (atrás do Suspense) carrega os 4 loaders mais lentos num único Promise.all", () => {
    const block = section.slice(section.indexOf("await Promise.all(["), section.indexOf("])", section.indexOf("await Promise.all([")))
    for (const loader of [
      "getActiveCycleAction(",
      "getRecentStudyHistoryAction(14)",
      "getMonthlyDailyTotalsAction(",
      "getMonthlyStatsAction(",
    ]) {
      assert.ok(block.includes(loader), `${loader} deveria estar no Promise.all de DashboardWidgetsSection`)
    }
  })

  it("as chaves semeadas no servidor são as mesmas usadas pelos widgets no cliente", () => {
    const cycleWidget = readSource("src/features/study-cycle/components/intelligent-cycle-widget.tsx")
    const catalog = readSource("src/features/dashboard/components/dashboard-widget-catalog.tsx")
    assert.ok(section.includes("activeCycleOverview:"))
    assert.ok(cycleWidget.includes('"activeCycleOverview"'))
    assert.ok(section.includes('"recentStudyHistory:14"'))
    assert.ok(catalog.includes('"recentStudyHistory:14"'))
    assert.ok(section.includes("`monthlyCalendar:${calendarYear}:${calendarMonth}`"))
    assert.ok(catalog.includes("`monthlyCalendar:${"))
    assert.ok(section.includes("<InitialServerDataProvider data={initialWidgetData}>"))
  })

  it("o cabeçalho (DashboardLayout) não recebe mais initialLayout nem renderiza a grade — isso foi para DashboardWidgetsGrid, do outro lado do Suspense", () => {
    const layout = readSource("src/features/dashboard/components/dashboard-layout.tsx")
    assert.ok(!layout.includes("WIDGET_REGISTRY"), "dashboard-layout.tsx não deveria mais importar WIDGET_REGISTRY")
    assert.ok(layout.includes("children"), "dashboard-layout.tsx deveria renderizar a área de widgets via children")
    const grid = readSource("src/features/dashboard/components/dashboard-widgets-grid.tsx")
    assert.ok(grid.includes("WIDGET_REGISTRY"))
    assert.ok(grid.includes('window.dispatchEvent(new CustomEvent("open-dashboard-goals-modal"))'))
    assert.ok(layout.includes('"open-dashboard-goals-modal"'), "DashboardLayout deveria escutar o evento open-dashboard-goals-modal para abrir o WeeklyGoalsModal")
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
    // Fase I.1: review-tabs.tsx saiu com a reescrita do módulo; a mesma
    // garantia passou para a view da página de Revisões.
    const view = readSource("src/features/reviews/components/reviews-view.tsx")
    assert.equal(view.includes("window.location.reload()"), false)
    assert.ok(view.includes("router.refresh()"))
    const modal = readSource("src/features/reviews/components/review-session-modal.tsx")
    assert.equal(modal.includes("window.location.reload()"), false)
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
