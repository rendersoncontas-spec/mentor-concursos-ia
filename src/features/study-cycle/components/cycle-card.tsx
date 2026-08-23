"use client"

import { useMemo } from "react"

import { Clock, Play, Pause, Trash2, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { StudyCycleWithItems } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"

interface CycleCardProps {
  cycle: StudyCycleWithItems
  onActivate: (id: string) => void
  onPause: (id: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m}min`
}

const STATUS_CONFIG = {
  ACTIVE: { label: "Ativo", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  PAUSED: { label: "Pausado", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  CONCLUDED: { label: "Concluído", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
} as const

export function CycleCard({ cycle, onActivate, onPause, onDelete, onSelect }: CycleCardProps) {
  const stats = useMemo(() => {
    const totalPlanned = cycle.items.reduce((s, i) => s + i.planned_minutes, 0)
    const totalCompleted = cycle.items.reduce((s, i) => s + i.completed_minutes, 0)
    const progress = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0
    const currentIndex = Math.min(cycle.current_item_index, cycle.items.length - 1)
    const currentItem = cycle.items[currentIndex] || null
    const completedItems = cycle.items.filter((i) => i.status === "CONCLUIDO").length
    return { totalPlanned, totalCompleted, progress, currentItem, completedItems }
  }, [cycle])

  const statusConfig = STATUS_CONFIG[cycle.status]

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer",
        cycle.status === "ACTIVE" && "ring-2 ring-emerald-500/30",
      )}
      onClick={() => onSelect(cycle.id)}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-foreground truncate">{cycle.name}</h3>
            {(cycle.contest_name || cycle.edital_name) && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {cycle.contest_name}
                {cycle.edital_name && ` — ${cycle.edital_name}`}
              </p>
            )}
          </div>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", statusConfig.color)}>
            {statusConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{cycle.items.length} matérias</span>
          <span className="text-border">|</span>
          <span>{formatMinutes(stats.totalPlanned)} por ciclo</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Progresso</span>
            <span className="text-xs font-bold text-foreground">{stats.progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                cycle.status === "ACTIVE" ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${Math.min(stats.progress, 100)}%` }}
            />
          </div>
        </div>

        {cycle.status === "ACTIVE" && stats.currentItem && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Agora
            </p>
            <p className="text-sm font-bold text-foreground">
              {stats.currentItem.discipline?.name || "Matéria"}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {formatMinutes(stats.currentItem.completed_minutes)} /{" "}
                {formatMinutes(stats.currentItem.planned_minutes)}
              </span>
              <span className="text-border">•</span>
              <span>
                Faltam{" "}
                {formatMinutes(
                  Math.max(0, stats.currentItem.planned_minutes - stats.currentItem.completed_minutes)
                )}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-1">
          {cycle.status !== "ACTIVE" && cycle.status !== "CONCLUDED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              onClick={(e) => {
                e.stopPropagation()
                onActivate(cycle.id)
              }}
            >
              <Play className="h-3 w-3 mr-1" />
              Iniciar
            </Button>
          )}
          {cycle.status === "ACTIVE" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs font-semibold text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={(e) => {
                e.stopPropagation()
                onPause(cycle.id)
              }}
            >
              <Pause className="h-3 w-3 mr-1" />
              Pausar
            </Button>
          )}
          {cycle.status !== "CONCLUDED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(cycle.id)
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <div className="flex-1" />
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </Card>
  )
}
