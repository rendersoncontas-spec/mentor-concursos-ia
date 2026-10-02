import { getRecentStudyHistoryAction } from "@/application/study-analytics/study-analytics.actions"
import { getActiveCycleAction } from "@/application/study-cycle/study-cycle.actions"
import {
  getMonthlyDailyTotalsAction,
  getMonthlyStatsAction,
} from "@/application/study-history/study-history.actions"
import { type DashboardSnapshot, type WidgetConfigItem } from "@/domain/dashboard/dashboard.types"
import { InitialServerDataProvider } from "@/hooks/use-cached-server-action"
import { logPagePerf, timed } from "@/lib/perf/server-perf"

import { DashboardWidgetsGrid } from "./dashboard-widgets-grid"

export interface DashboardWidgetsSectionProps {
  snapshot: DashboardSnapshot
  initialLayout: WidgetConfigItem[]
  calendarYear: number
  calendarMonth: number
}

/**
 * Fase F.3 (performance) — Server Component assíncrono renderizado dentro de
 * um <Suspense> em `page.tsx`. Carrega os 4 loaders que antes entravam no
 * mesmo `Promise.all` do snapshot/layout e por isso atrasavam o cabeçalho
 * inteiro da página (hoje a página esperava o mais lento dos 6). Agora o
 * cabeçalho (snapshot + layout, mais rápidos) aparece primeiro, e esta seção
 * — "Foco de hoje" + grade de widgets — aparece quando estes 4 terminarem,
 * via streaming do React. Mesmas queries, mesmos dados, mesmas chaves
 * semeadas para os widgets (`activeCycleOverview`, `recentStudyHistory:14`,
 * `monthlyCalendar:ano:mês`) — nenhum número muda.
 *
 * `logPagePerf` é chamado aqui (e não mais em `page.tsx`) porque o coletor de
 * `[perf]` é por requisição (React `cache()`), sobrevive ao Suspense, e assim
 * a linha `[perf]` continua saindo uma única vez por página, agora incluindo
 * os passos do cabeçalho (auth.usuario, dashboard.snapshot, dashboard.layout)
 * e os desta seção juntos.
 */
export async function DashboardWidgetsSection({
  snapshot,
  initialLayout,
  calendarYear,
  calendarMonth,
}: DashboardWidgetsSectionProps) {
  const [activeCycle, recentHistory, monthlyTotals, monthlyStats] = await Promise.all([
    timed("dashboard.ciclo_ativo", () => getActiveCycleAction()),
    timed("dashboard.estudos_14d", () => getRecentStudyHistoryAction(14), (r) => r.data?.length),
    timed(
      "dashboard.totais_mes",
      () => getMonthlyDailyTotalsAction(calendarYear, calendarMonth),
      (r) => r.data?.length,
    ),
    timed("dashboard.estatisticas_mes", () => getMonthlyStatsAction(calendarYear, calendarMonth)),
  ])
  logPagePerf("/dashboard")

  // Mesmas chaves e mesmo formato que os widgets usam em useCachedServerAction
  // (intelligent-cycle-widget.tsx e dashboard-widget-catalog.tsx). Só entra o
  // que veio sem erro: com erro, o widget busca sozinho como antes.
  const initialWidgetData: Record<string, unknown> = {
    activeCycleOverview: activeCycle,
  }
  if (!recentHistory.error) {
    initialWidgetData["recentStudyHistory:14"] = recentHistory.data ?? []
  }
  if (!monthlyTotals.error && !monthlyStats.error) {
    initialWidgetData[`monthlyCalendar:${calendarYear}:${calendarMonth}`] = {
      dailyTotals: monthlyTotals.data ?? [],
      monthlyStats: monthlyStats.data ?? null,
    }
  }

  return (
    <InitialServerDataProvider data={initialWidgetData}>
      <DashboardWidgetsGrid snapshot={snapshot} initialLayout={initialLayout} />
    </InitialServerDataProvider>
  )
}
