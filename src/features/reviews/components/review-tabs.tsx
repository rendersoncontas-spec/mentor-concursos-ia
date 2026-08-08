"use client"

import { useState } from "react"
import { Clock, CheckCircle2, AlertTriangle, Ban, Play, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Mock data ────────────────────────────────────────────────────────────────

type ReviewStatus = "scheduled" | "overdue" | "ignored" | "completed"
type RepetitionInterval = "24h" | "7d" | "15d" | "30d" | "60d" | "custom"

interface ReviewItem {
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

const INTERVAL_COLORS: Record<RepetitionInterval, string> = {
  "24h": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  "7d": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  "15d": "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  "30d": "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  "60d": "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  "custom": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { id: ReviewStatus; label: string; icon: React.ElementType }[] = [
  { id: "scheduled", label: "Programadas", icon: Clock },
  { id: "overdue", label: "Atrasadas", icon: AlertTriangle },
  { id: "ignored", label: "Ignoradas", icon: Ban },
  { id: "completed", label: "Concluídas", icon: CheckCircle2 },
]

// ─── Card ─────────────────────────────────────────────────────────────────────

function ReviewCard({ item }: { item: ReviewItem }) {
  const isOverdue = item.status === "overdue"
  const isCompleted = item.status === "completed"
  const isIgnored = item.status === "ignored"

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all hover:shadow-md group",
        isOverdue && "border-red-200 dark:border-red-900/50 bg-red-500/5",
        isCompleted && "opacity-60 bg-muted/30",
        isIgnored && "opacity-50 bg-muted/20",
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
            <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${INTERVAL_COLORS[item.interval]}`}>
              {INTERVAL_LABELS[item.interval]}
            </span>
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(item.dueDate).toLocaleDateString("pt-BR")}
              </span>
              {isOverdue && item.lapses && (
                <span className="flex items-center gap-1 text-red-500">
                  <AlertTriangle className="h-3 w-3" />
                  {item.lapses} lapsos
                </span>
              )}
            </div>

            {!isCompleted && !isIgnored && (
              <button className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 opacity-0 group-hover:opacity-100 transition-all">
                <Play className="h-3 w-3" fill="currentColor" />
                Revisar
              </button>
            )}
            {isCompleted && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Tabs Component ──────────────────────────────────────────────────────

export function ReviewTabs({ initialReviews = [] }: { initialReviews?: ReviewItem[] }) {
  const [activeTab, setActiveTab] = useState<ReviewStatus>("scheduled")

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
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const count = counts[tab.id]
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                tab.id === "overdue" && count > 0 && !isActive && "text-red-500 hover:text-red-600",
              )}
            >
              <Icon className="h-3.5 w-3.5 hidden sm:block" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold",
                isActive
                  ? "bg-primary text-white"
                  : tab.id === "overdue" && count > 0
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-muted/20">
          <CheckCircle2 className="h-10 w-10 text-green-500/40 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">Nenhuma revisão nesta categoria</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Continue estudando para gerar revisões automáticas!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
