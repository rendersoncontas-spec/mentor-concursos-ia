import { redirect } from "next/navigation"

import { Brain, RefreshCcw } from "lucide-react"

import {
  getAverageRetention,
  getMemoryStages,
  getReviewBacklog,
} from "@/application/review-engine/review-analytics.service"
import { ReviewTabs, type TabReviewItem } from "@/features/reviews/components/review-tabs"
import { StartReviewButton } from "@/features/reviews/components/start-review-button"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Revisões",
  description: "Gerencie suas revisões espaçadas no Nomeia.",
}

const DISC_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#6366f1",
  "#ef4444",
]

function intervalLabel(days: number): TabReviewItem["interval"] {
  if (days <= 1) return "24h"
  if (days <= 7) return "7d"
  if (days <= 15) return "15d"
  if (days <= 30) return "30d"
  if (days <= 60) return "60d"
  return "custom"
}

function discColor(id: string | null): string {
  if (!id) return "#3b82f6"
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return DISC_PALETTE[hash % DISC_PALETTE.length] ?? "#3b82f6"
}

export default async function ReviewsDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [backlogCount, memoryStages, retentionData, itemsRes, discRes] = await Promise.all([
    getReviewBacklog(supabase, user.id),
    getMemoryStages(supabase, user.id),
    getAverageRetention(supabase, user.id),
    supabase
      .from("review_items")
      .select(
        "id, card_front, discipline_id, review_stage, next_review_at, last_review_at, lapses_count, last_interval_days, is_suspended, source_type",
      )
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase.from("disciplines").select("id, name"),
  ])

  const discNameMap = new Map<string, string>(
    (discRes.data ?? []).map((d) => [String(d.id), String(d.name ?? "")]),
  )
  const nowIso = new Date().toISOString()

  const initialReviews: TabReviewItem[] = (itemsRes.data ?? [])
    .map((r) => {
      const stage = String(r.review_stage ?? "")
      let status: TabReviewItem["status"]
      if (r.is_suspended) status = "ignored"
      else if (stage === "MASTERED") status = "completed"
      else if (!r.next_review_at || String(r.next_review_at) <= nowIso) status = "overdue"
      else status = "scheduled"

      const intervalDays = Number(r.last_interval_days ?? 0)

      return {
        id: String(r.id),
        topic: String(
          r.card_front || (r.source_type === "QUESTION" ? "Questão revisada" : "Cartão de revisão"),
        ),
        discipline: discNameMap.get(String(r.discipline_id ?? "")) || "Disciplina",
        disciplineColor: discColor(r.discipline_id),
        dueDate: String(r.next_review_at || r.last_review_at || nowIso),
        interval: intervalLabel(intervalDays),
        status,
        ...(Number(r.lapses_count) > 0 ? { lapses: Number(r.lapses_count) } : {}),
      }
    })
    .sort((a, b) => {
      if (a.status === b.status) return a.dueDate.localeCompare(b.dueDate)
      return a.status < b.status ? -1 : 1
    })

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b px-6 py-3 flex items-center gap-3">
        <RefreshCcw className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold leading-none">Painel de Revisões</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Repetição espaçada: 24h · 7d · 15d · 30d · 60d
          </p>
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Fila de Hoje
              </p>
              <p className="text-4xl font-bold text-orange-600 mt-1">{backlogCount}</p>
              <p className="text-xs text-muted-foreground mt-1">cartões pendentes</p>
            </div>
            <StartReviewButton disabled={backlogCount === 0} />
          </div>

          {/* Retention */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Retenção
            </p>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Dominados
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {memoryStages.mastered}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              de{" "}
              {memoryStages.new +
                memoryStages.learning +
                memoryStages.review +
                memoryStages.mastered +
                memoryStages.lapsed}{" "}
              total
            </p>
          </div>
        </div>

        {/* Memory Funnel */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Funil de Spaced Repetition</p>
          <div className="grid grid-cols-5 gap-3 text-center">
            {[
              { label: "Novos", value: memoryStages.new, className: "bg-muted/50" },
              {
                label: "Aprendendo",
                value: memoryStages.learning,
                className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
              },
              {
                label: "Revisando",
                value: memoryStages.review,
                className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              },
              {
                label: "Dominados",
                value: memoryStages.mastered,
                className: "bg-green-500/10 text-green-700 dark:text-green-400",
              },
              {
                label: "Lapsos",
                value: memoryStages.lapsed,
                className: "bg-red-500/10 text-red-700 dark:text-red-400",
              },
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
        <ReviewTabs initialReviews={initialReviews} />
      </div>
    </div>
  )
}
