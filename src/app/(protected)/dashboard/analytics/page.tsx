import { redirect } from "next/navigation"
import { BarChart3 } from "lucide-react"

import { createClient } from "@/infrastructure/supabase/server"
import { PerformanceChart } from "@/features/analytics/components/performance-chart"
import { HoursDistributionChart } from "@/features/analytics/components/hours-distribution-chart"
import { getDashboardData } from "@/application/dashboard/dashboard.service"

export const metadata = {
  title: "Estatísticas - Mentor Concursos IA",
}

export default async function AnalyticsDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dashboardData = await getDashboardData(supabase, user.id)
  const stats = dashboardData.analytics.stats

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold leading-none">Estatísticas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Análise detalhada do seu desempenho</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-5">
        {/* Top stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Horas no Mês",
              value: `${Math.round(stats.monthlyMinutes / 60)}h`,
              sub: `${stats.monthlyMinutes}min totais`,
              color: "text-blue-600 dark:text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              label: "Ofensiva Atual",
              value: `${stats.consecutiveStreak}d`,
              sub: "dias seguidos",
              color: "text-orange-600 dark:text-orange-400",
              bg: "bg-orange-500/10",
            },
            {
              label: "Foco Médio",
              value: stats.averageFocus ? `${stats.averageFocus}/5` : "—",
              sub: "nas últimas sessões",
              color: "text-green-600 dark:text-green-400",
              bg: "bg-green-500/10",
            },
            {
              label: "Maior Sessão",
              value: `${stats.longestSession}min`,
              sub: "sessão mais longa",
              color: "text-purple-600 dark:text-purple-400",
              bg: "bg-purple-500/10",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Performance line chart */}
        <PerformanceChart />

        {/* Distribution chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <HoursDistributionChart />

          {/* Weekly hours */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold text-sm mb-1">Horas por Dia da Semana</h3>
            <p className="text-xs text-muted-foreground mb-5">Padrão histórico de estudo</p>
            <div className="flex items-end gap-2 h-40">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day, i) => {
                const heights: number[] = [75, 45, 90, 60, 80, 40, 20]
                const h = heights[i] ?? 0
                return (
                  <div key={day} className="flex flex-col items-center gap-2 flex-1">
                    <div
                      className="w-full rounded-t-md bg-primary/70 hover:bg-primary transition-colors"
                      style={{ height: `${h}%` }}
                      title={`${day}: ~${Math.round(h / 20)}h`}
                    />
                    <span className="text-xs text-muted-foreground">{day}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
