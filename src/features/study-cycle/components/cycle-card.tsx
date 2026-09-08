"use client"

import { ChevronRight, Edit3, Pause, Play, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"

interface CycleCardProps {
  overview: CycleOverview
  onActivate: (id: string) => void
  onPause: (id: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  onEdit?: (overview: CycleOverview) => void
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
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
        "group relative overflow-hidden transition-all duration-200 hover:shadow-lg border flex flex-col justify-between cursor-pointer",
        isActive
          ? "border-primary/50 bg-gradient-to-br from-primary/5 via-card to-card ring-1 ring-primary/30"
          : "border-border/60 hover:border-border/90 bg-card/80"
      )}
      onClick={() => onSelect(cycle.id)}
    >
      <div className="p-5 space-y-4">
        {/* CABEÇALHO DO CARD */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
              {cycle.name}
            </h3>
            {(cycle.contest_name || cycle.edital_name) && (
              <p className="text-xs font-semibold text-muted-foreground truncate mt-0.5">
                {cycle.contest_name}
                {cycle.edital_name && ` • ${cycle.edital_name}`}
              </p>
            )}
          </div>

          <span
            className={cn(
              "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shrink-0 border",
              isActive &&
                "bg-emerald-100 text-emerald-700 border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400",
              isPaused &&
                "bg-amber-100 text-amber-700 border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-400"
            )}
          >
            {isActive ? "ATIVO" : "PAUSADO"}
          </span>
        </div>

        {/* METADADOS: MATÉRIAS E DURAÇÃO */}
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <span>{items.length} {items.length === 1 ? "matéria" : "matérias"}</span>
          <span>|</span>
          <span>{formatMinutes(totalPlannedMinutesPerRound)} por volta</span>
        </div>

        {/* VOLTAS */}
        <div className="grid grid-cols-2 gap-2 text-xs py-2 px-3 bg-muted/40 rounded-xl border border-border/40">
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Volta atual
            </span>
            <span className="text-sm font-black text-foreground">
              {currentRound}ª volta
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Voltas concluídas
            </span>
            <span className="text-sm font-black text-foreground">
              {totalRoundsDone}
            </span>
          </div>
        </div>

        {/* BARRA DE PROGRESSO DA VOLTA */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Progresso da volta
            </span>
            <span className="text-primary font-black">{roundProgressPercentage}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, roundProgressPercentage)}%` }}
            />
          </div>
        </div>

        {/* PRÓXIMA MATÉRIA / MATÉRIA ATUAL */}
        {currentItem && (
          <div className="text-xs text-muted-foreground truncate pt-1">
            <span className="font-bold text-foreground">Agora: </span>
            <span>{currentItem.disciplineName}</span>
            <span className="text-muted-foreground font-medium"> ({currentItem.studiedMinutesInRound}/{currentItem.plannedMinutes} min)</span>
          </div>
        )}
      </div>

      {/* RODAPÉ DO CARD: BOTÕES DE AÇÃO */}
      <div
        className="p-3 border-t bg-muted/20 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPause(cycle.id)}
              className="h-8 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground"
              title="Pausar ciclo"
            >
              <Pause className="h-3 w-3 mr-1" />
              Pausar
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onActivate(cycle.id)}
              className="h-8 px-2.5 text-xs font-bold bg-primary text-primary-foreground"
              title="Ativar como ciclo principal"
            >
              <Play className="h-3 w-3 mr-1 fill-current" />
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
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(cycle.id)}
            className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            title="Excluir ciclo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect(cycle.id)}
          className="h-8 px-2 text-xs font-black text-primary hover:text-primary/90 hover:bg-primary/10 gap-1"
        >
          {isActive ? "Continuar ciclo" : "Ver detalhes"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  )
}
