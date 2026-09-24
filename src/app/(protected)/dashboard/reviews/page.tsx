import { redirect } from "next/navigation"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

import { RefreshCcw } from "lucide-react"

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
  description: "Gerencie suas revisões espaçadas no NomeIA.",
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

import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { PageHeader } from "@/components/ui/page-header"

export default async function ReviewsDashboardPage() {
  const supabase = await createClient()

  const effectiveUser = await getEffectiveSessionUser(supabase)
  if (!effectiveUser) redirect("/login")

  const [backlogCount, memoryStages, retentionData, itemsRes, discRes] = await Promise.all([
    getReviewBacklog(supabase, effectiveUser.id),
    getMemoryStages(supabase, effectiveUser.id),
    getAverageRetention(supabase, effectiveUser.id),
    // Fase F.1: paginado (review_items cresce com flashcards/simulados; 1
    // requisição era cortada em 1.000). Mesmo formato { data, error }.
    fetchAllRowsPaged<{
      id: string
      card_front: string | null
      discipline_id: string | null
      review_stage: string | null
      next_review_at: string | null
      last_review_at: string | null
      lapses_count: number | null
      last_interval_days: number | null
      is_suspended: boolean | null
      source_type: string | null
    }>(
      (withCount) =>
        supabase
          .from("review_items")
          .select(
            "id, card_front, discipline_id, review_stage, next_review_at, last_review_at, lapses_count, last_interval_days, is_suspended, source_type",
            countOption(withCount),
          )
          .eq("user_id", effectiveUser.id)
          .is("deleted_at", null),
      [{ column: "id", ascending: true }],
    ).then(({ data, error }) => ({ data: error ? null : data, error })),
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
      <PageHeader
        icon={RefreshCcw}
        title="Revisões"
        description="Repetição espaçada: 24h · 7d · 15d · 30d · 60d"
      />

      <div className="flex-1 page-container py-5 space-y-5">
        {/* Redesign 2.0 — resumo em uma superfície: a fila de hoje é a
            ação principal (à esquerda, com o botão); retenção, dominados e o
            funil de memória viram colunas/linha de texto, sem caixas
            coloridas nem ícone decorativo gigante. */}
        <section aria-label="Resumo das revisões" className="rounded-lg border border-border bg-card">
          <div className="grid grid-cols-2 md:grid-cols-[minmax(0,1.4fr)_1fr_1fr] md:divide-x divide-border">
            <div className="col-span-2 md:col-span-1 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Fila de hoje</p>
                <p className="text-2xl font-semibold text-foreground tabular-nums mt-0.5">
                  {backlogCount}
                  <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">
                    {backlogCount === 1 ? "cartão pendente" : "cartões pendentes"}
                  </span>
                </p>
              </div>
              <StartReviewButton disabled={backlogCount === 0} />
            </div>

            <div className="p-4 border-t md:border-t-0 border-border">
              <p className="text-xs text-muted-foreground">Retenção</p>
              <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">
                {retentionData.retentionRate}%
              </p>
              <div className="w-full bg-muted rounded-full h-1 mt-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${retentionData.retentionRate}%` }}
                />
              </div>
            </div>

            <div className="p-4 border-t border-l md:border-t-0 md:border-l-0 border-border">
              <p className="text-xs text-muted-foreground">Dominados</p>
              <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">
                {memoryStages.mastered}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  de{" "}
                  {memoryStages.new +
                    memoryStages.learning +
                    memoryStages.review +
                    memoryStages.mastered +
                    memoryStages.lapsed}
                </span>
              </p>
            </div>
          </div>

          {/* Funil de memória */}
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">Estágios de memória</p>
            <ol className="grid grid-cols-3 sm:grid-cols-5 gap-y-2">
              {[
                { label: "Novos", value: memoryStages.new, dot: "bg-muted-foreground/40" },
                { label: "Aprendendo", value: memoryStages.learning, dot: "bg-primary/60" },
                { label: "Revisando", value: memoryStages.review, dot: "bg-primary" },
                { label: "Dominados", value: memoryStages.mastered, dot: "bg-success" },
                { label: "Lapsos", value: memoryStages.lapsed, dot: "bg-destructive" },
              ].map((stage) => (
                <li key={stage.label} className="flex items-baseline gap-2">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full shrink-0 translate-y-[-1px] ${stage.dot}`} />
                  <span className="text-[15px] font-semibold text-foreground tabular-nums">{stage.value}</span>
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Review Tabs */}
        <ReviewTabs initialReviews={initialReviews} />
      </div>
    </div>
  )
}
