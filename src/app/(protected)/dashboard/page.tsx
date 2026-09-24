import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getDashboardLayoutAction } from "@/application/dashboard/dashboard-layout.action"
import { getDashboardData } from "@/application/dashboard/dashboard.service"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { getRecentStudyHistoryAction } from "@/application/study-analytics/study-analytics.actions"
import { getActiveCycleAction } from "@/application/study-cycle/study-cycle.actions"
import {
  getMonthlyDailyTotalsAction,
  getMonthlyStatsAction,
} from "@/application/study-history/study-history.actions"
import { DashboardLayout } from "@/features/dashboard/components/dashboard-layout"
import { InitialServerDataProvider } from "@/hooks/use-cached-server-action"
import { createClient } from "@/infrastructure/supabase/server"
import { logPagePerf, startPagePerf, timed } from "@/lib/perf/server-perf"
import { getDayInSaoPaulo } from "@/lib/sao-paulo"

export const metadata: Metadata = {
  title: {
    absolute: "NomeIA",
  },
  description: "Acompanhe seu progresso e planejamento de estudos no NomeIA.",
}

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  startPagePerf()
  const supabase = await createClient()

  const effectiveUser = await timed("auth.usuario", () => getEffectiveSessionUser(supabase))

  if (!effectiveUser) {
    redirect("/login")
  }

  // Fase F (performance): tudo o que o Dashboard precisa é independente entre
  // si e vai em paralelo. Antes: snapshot → layout em sequência, e os widgets
  // "Foco de hoje", "Estudos de hoje" e "Calendário" só começavam a buscar os
  // próprios dados no navegador, depois da hidratação — e em fila, porque o
  // Next.js executa Server Actions de um cliente uma de cada vez.
  const todayKey = getDayInSaoPaulo(new Date())
  const calendarYear = Number(todayKey.slice(0, 4))
  const calendarMonth = Number(todayKey.slice(5, 7))

  const [snapshot, layoutResult, activeCycle, recentHistory, monthlyTotals, monthlyStats] =
    await Promise.all([
      timed("dashboard.snapshot", () => getDashboardData(supabase, effectiveUser.id)),
      timed("dashboard.layout", () => getDashboardLayoutAction()),
      timed("dashboard.ciclo_ativo", () => getActiveCycleAction()),
      timed("dashboard.estudos_14d", () => getRecentStudyHistoryAction(14), (r) => r.data?.length),
      timed("dashboard.totais_mes", () => getMonthlyDailyTotalsAction(calendarYear, calendarMonth), (r) => r.data?.length),
      timed("dashboard.estatisticas_mes", () => getMonthlyStatsAction(calendarYear, calendarMonth)),
    ])
  logPagePerf("/dashboard")
  const serverDate = new Date().toISOString()

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
      <DashboardLayout snapshot={snapshot} initialLayout={layoutResult.data} serverDate={serverDate} />
    </InitialServerDataProvider>
  )
}
