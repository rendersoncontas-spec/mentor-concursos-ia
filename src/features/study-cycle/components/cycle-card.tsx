"use client"

import { ChevronRight, Edit3, Pause, Play, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"
import { formatDurationMinutes } from "@/lib/format-duration"

interface CycleCardProps {
  overview: CycleOverview
  onActivate: (id: string) => void
  onPause: (id: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  onEdit?: (overview: CycleOverview) => void
}

export function CycleCard({
  overview,
  onActivate,
  onPause,
  onDelete,
  onSelect,
  onEdit,
}: CycleCardProps) {
  const {
    cycle,
    items,
    currentRound,
    totalRoundsDone,
    roundProgressPercentage,
    totalPlannedMinutesPerRound,
    currentItem,
  } = overview

  const isActive = cycle.status === "ACTIVE"
  const isPaused = cycle.status === "PAUSED"

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-colors duration-150 flex flex-col cursor-pointer hover:border-foreground/20",
        isActive ? "border-l-2 border-l-primary" : ""
      )}
      onClick={() => onSelect(cycle.id)}
    >
      <div className="p-3.5 space-y-2.5">
        {/* CABEÇALHO DO CARD */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {cycle.name}
            </h3>
            {(cycle.contest_name || cycle.edital_name) && (
              <p className="text-[11px] font-semibold text-muted-foreground truncate mt-0.5">
                {cycle.contest_name}
                {cycle.edital_name && ` • ${cycle.edital_name}`}
              </p>
            )}
          </div>

          <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isActive && "bg-primary",
                isPaused && "bg-warning",
              )}
            />
            {isActive ? "Ativo" : "Pausado"}
          </span>
        </div>

        {/* METADADOS: MATÉRIAS E DURAÇÃO */}
        <p className="text-xs text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "matéria" : "matérias"} · {formatDurationMinutes(totalPlannedMinutesPerRound)} por volta · {currentRound}ª volta · {totalRoundsDone} concluídas
        </p>

        {/* BARRA DE PROGRESSO DA VOLTA */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Progresso da volta
            </span>
            <span className="text-foreground font-medium tabular-nums">{roundProgressPercentage}%</span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, roundProgressPercentage)}%` }}
            />
          </div>
        </div>

        {/* PRÓXIMA MATÉRIA / MATÉRIA ATUAL */}
        {currentItem && (
          <div className="text-xs text-muted-foreground truncate pt-0.5">
            <span className="font-medium text-foreground">Agora: </span>
            <span>{currentItem.disciplineName}</span>
            <span className="text-muted-foreground font-medium"> ({Math.round(currentItem.studiedMinutesInRound)}/{currentItem.plannedMinutes} min)</span>
          </div>
        )}
      </div>

      {/* RODAPÉ DO CARD: BOTÕES DE AÇÃO */}
      <div
        className="px-2.5 py-2 border-t border-border flex items-center justify-between gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5">
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPause(cycle.id)}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              title="Pausar ciclo"
            >
              <Pause className="h-3 w-3" />
              Pausar
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onActivate(cycle.id)}
              className="h-8 px-2.5 text-xs"
              title="Ativar como ciclo principal"
            >
              <Play className="h-3 w-3 fill-current" />
              Ativar
            </Button>
          )}

          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(overview)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Editar ciclo"
              aria-label="Editar ciclo"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(cycle.id)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Excluir ciclo"
            aria-label="Excluir ciclo"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect(cycle.id)}
          className="h-8 px-2.5 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-0.5"
        >
          {isActive ? "Continuar" : "Ver"}
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  )
}