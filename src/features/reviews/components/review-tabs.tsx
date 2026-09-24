"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, CheckCircle2, AlertTriangle, Ban, Play, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReviewSessionMode } from "@/domain/reviews/models"
import { ReviewPlayerModal } from "./review-player-modal"

// ─── Tipos (dados vêm do banco via review_items, populados pelo servidor) ───

type ReviewStatus = "scheduled" | "overdue" | "ignored" | "completed"
type RepetitionInterval = "24h" | "7d" | "15d" | "30d" | "60d" | "custom"

export interface TabReviewItem {
  id: string
  topic: string
  discipline: string
  disciplineColor: string
  dueDate: string
  interval: RepetitionInterval
  status: ReviewStatus
  lapses?: number
}

const INTERVAL_LABELS: Record<RepetitionInterval, string> = {
  "24h": "24 horas",
  "7d": "7 dias",
  "15d": "15 dias",
  "30d": "30 dias",
  "60d": "60 dias",
  "custom": "Personalizado",
}

// Redesign 2.0: o rótulo do intervalo (24h, 7d...) já é a informação —
// antes cada intervalo tinha uma cor própria (azul, ciano, teal, roxo,
// rosa, âmbar), sem significado além do próprio texto.
const INTERVAL_COLORS: Record<RepetitionInterval, string> = {
  "24h": "bg-muted text-muted-foreground",
  "7d": "bg-muted text-muted-foreground",
  "15d": "bg-muted text-muted-foreground",
  "30d": "bg-muted text-muted-foreground",
  "60d": "bg-muted text-muted-foreground",
  "custom": "bg-muted text-muted-foreground",
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { id: ReviewStatus; label: string; icon: React.ElementType }[] = [
  { id: "scheduled", label: "Programadas", icon: Clock },
  { id: "overdue", label: "Atrasadas", icon: AlertTriangle },
  { id: "ignored", label: "Ignoradas", icon: Ban },
  { id: "completed", label: "Concluídas", icon: CheckCircle2 },
]

function badgeStyle(isActive: boolean, tabId: ReviewStatus, count: number): string {
  if (tabId === "overdue" && count > 0) return "bg-destructive/10 text-destructive"
  if (isActive) return "bg-primary/10 text-primary"
  return "bg-background/60 text-muted-foreground"
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ReviewCard({ item, onReview }: { item: TabReviewItem; onReview: () => void }) {
  const isOverdue = item.status === "overdue"
  const isCompleted = item.status === "completed"
  const isIgnored = item.status === "ignored"

  return (
    <li
      className={cn(
        "px-4 py-3 transition-colors hover:bg-muted/30 group",
        isOverdue && "border-l-2 border-l-destructive",
        isCompleted && "opacity-60",
        isIgnored && "opacity-50",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Color indicator */}
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: item.disciplineColor }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{item.topic}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.discipline}</p>
            </div>

            {/* Interval badge */}
            <span className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-sm ${INTERVAL_COLORS[item.interval]}`}>
              {INTERVAL_LABELS[item.interval]}
            </span>
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(item.dueDate).toLocaleDateString("pt-BR")}
              </span>
              {isOverdue && item.lapses && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {item.lapses} lapsos
                </span>
              )}
            </div>

            {!isCompleted && !isIgnored && (
              <button
                type="button"
                onClick={onReview}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 rounded-md px-2 py-1.5 -mr-2 hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Play className="h-3 w-3" fill="currentColor" />
                Revisar
              </button>
            )}
            {isCompleted && (
              <CheckCircle2 aria-label="Concluída" className="h-4 w-4 text-success" />
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ─── Main Tabs Component ──────────────────────────────────────────────────────

export function ReviewTabs({ initialReviews = [] }: { initialReviews?: TabReviewItem[] }) {
  const [activeTab, setActiveTab] = useState<ReviewStatus>("scheduled")
  const [playerOpen, setPlayerOpen] = useState(false)
  const [playerMode, setPlayerMode] = useState<ReviewSessionMode>("ALL")
  const router = useRouter()

  const filtered = initialReviews.filter((r) => r.status === activeTab)
  const counts = {
    scheduled: initialReviews.filter((r) => r.status === "scheduled").length,
    overdue: initialReviews.filter((r) => r.status === "overdue").length,
    ignored: initialReviews.filter((r) => r.status === "ignored").length,
    completed: initialReviews.filter((r) => r.status === "completed").length,
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div role="tablist" aria-label="Filtrar revisões" className="flex w-full gap-0.5 rounded-md bg-muted p-0.5 sm:inline-flex sm:w-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const count = counts[tab.id]
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={isActive}
              aria-label={`${tab.label} (${count})`}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-[5px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Fase E: o ícone aparece também no mobile (antes só o número ficava visível) */}
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-sm text-[11px] font-medium tabular-nums",
                badgeStyle(isActive, tab.id, count),
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-border rounded-lg bg-card">
          <CheckCircle2 aria-hidden className="h-5 w-5 text-muted-foreground/70 mb-2" />
          <p className="text-sm font-medium text-foreground">Nenhuma revisão nesta categoria</p>
          <p className="text-[13px] text-muted-foreground mt-1">As revisões são agendadas automaticamente a partir dos seus estudos.</p>
        </div>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              onReview={() => {
                setPlayerMode(item.status === "overdue" ? "OVERDUE" : "ALL")
                setPlayerOpen(true)
              }}
            />
          ))}
        </ul>
      )}

      <ReviewPlayerModal
        open={playerOpen}
        onOpenChange={setPlayerOpen}
        mode={playerMode}
        onFinished={() => {
          // Fase F: antes, um reload completo da janela — recarregava o app
          // inteiro (JS, layout, providers, fila offline) só para atualizar
          // esta lista. As abas são 100% derivadas de `initialReviews`, então
          // router.refresh() (re-render do servidor, mesmo padrão do
          // StartReviewButton) traz os mesmos dados atualizados.
          router.refresh()
        }}
      />
    </div>
  )
}
