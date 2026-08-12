import { redirect } from "next/navigation"
import { RefreshCcw, Brain, Play } from "lucide-react"

import { createClient } from "@/infrastructure/supabase/server"
import {
  getReviewBacklog,
  getMemoryStages,
  getAverageRetention,
} from "@/application/review-engine/review-analytics.service"
import { ReviewTabs } from "@/features/reviews/components/review-tabs"

export const metadata = {
  title: "Revisões - Mentor Concursos IA",
}

export default async function ReviewsDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [backlogCount, memoryStages, retentionData] = await Promise.all([
    getReviewBacklog(supabase, user.id),
    getMemoryStages(supabase, user.id),
    getAverageRetention(supabase, user.id),
  ])

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <RefreshCcw className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold leading-none">Painel de Revisões</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Repetição espaçada: 24h · 7d · 15d · 30d · 60d</p>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Queue */}
          <div className="col-span-2 rounded-xl border bg-card p-5 flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Brain className="h-32 w-32" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fila de Hoje</p>
              <p className="text-4xl font-bold text-orange-600 mt-1">{backlogCount}</p>
              <p className="text-xs text-muted-foreground mt-1">cartões pendentes</p>
            </div>
            <button
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
              disabled={backlogCount === 0}
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Iniciar
            </button>
          </div>

          {/* Retention */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Retenção</p>
            <p className="text-3xl font-bold">{retentionData.retentionRate}%</p>
            <div className="w-full bg-muted rounded-full h-1.5 mt-3 overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-700"
                style={{ width: `${retentionData.retentionRate}%` }}
              />
            </div>
          </div>

          {/* Mastered */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dominados</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{memoryStages.mastered}</p>
            <p className="text-xs text-muted-foreground mt-1">
              de {memoryStages.new + memoryStages.learning + memoryStages.review + memoryStages.mastered + memoryStages.lapsed} total
            </p>
          </div>
        </div>

        {/* Memory Funnel */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Funil de Spaced Repetition</p>
          <div className="grid grid-cols-5 gap-3 text-center">
            {[
              { label: "Novos", value: memoryStages.new, className: "bg-muted/50" },
              { label: "Aprendendo", value: memoryStages.learning, className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
              { label: "Revisando", value: memoryStages.review, className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
              { label: "Dominados", value: memoryStages.mastered, className: "bg-green-500/10 text-green-700 dark:text-green-400" },
              { label: "Lapsos", value: memoryStages.lapsed, className: "bg-red-500/10 text-red-700 dark:text-red-400" },
            ].map((stage, i, arr) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className={`flex-1 rounded-lg p-3 ${stage.className}`}>
                  <p className="text-xl font-bold">{stage.value}</p>
                  <p className="text-xs mt-0.5 font-medium">{stage.label}</p>
                </div>
                {i < arr.length - 1 && (
                  <span className="text-muted-foreground/50 text-xs hidden sm:block">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Review Tabs */}
        <ReviewTabs />
      </div>
    </div>
  )
}
