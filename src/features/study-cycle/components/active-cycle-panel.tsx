"use client"

import { useCallback, useState } from "react"

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Edit3,
  Layers,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
} from "lucide-react"
import { toast } from "sonner"

import {
  pauseCycleAction,
  skipCycleCurrentItemAction,
} from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { cn } from "@/lib/utils"

interface ActiveCyclePanelProps {
  overview: CycleOverview
  onRefresh: () => void
  onSelectAnotherCycle?: (() => void) | undefined
  onEditCycle?: (() => void) | undefined
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export function ActiveCyclePanel({
  overview,
  onRefresh,
  onSelectAnotherCycle,
  onEditCycle,
}: ActiveCyclePanelProps) {
  const { startSession, session } = useGlobalStudy()
  const [isSkipping, setIsSkipping] = useState(false)
  const [isPausing, setIsPausing] = useState(false)

  const {
    cycle,
    items,
    currentItem,
    nextItem,
    currentRound,
    totalRoundsDone,
    roundProgressPercentage,
    totalPlannedMinutesPerRound,
    totalStudiedMinutesInRound,
    totalExtraMinutesInRound,
  } = overview

  const isCurrentItemStudying =
    Boolean(session?.isActive) && session?.cycleId === cycle.id

  const handleStartStudy = useCallback(() => {
    if (!currentItem) {
      toast.error("Nenhuma matéria selecionada no ciclo.")
      return
    }

    // Passar source: "CYCLE" explícito e o tempo que falta para cumprir a etapa
    startSession({
      disciplineName: currentItem.disciplineName,
      disciplineId: currentItem.disciplineId,
      studyType: "TEORIA",
      plannedSeconds: Math.max(1, currentItem.remainingMinutesInRound) * 60,
      source: "CYCLE",
      cycleId: cycle.id,
      cycleItemId: currentItem.itemId,
    })

    toast.success(`Estudo do ciclo iniciado: ${currentItem.disciplineName}`)
  }, [currentItem, cycle.id, startSession])

  const handlePauseCycle = useCallback(async () => {
    setIsPausing(true)
    try {
      const res = await pauseCycleAction(cycle.id)
      if (res.success) {
        toast.success("Ciclo de estudos pausado.")
        onRefresh()
      } else {
        toast.error("Erro ao pausar ciclo.")
      }
    } finally {
      setIsPausing(false)
    }
  }, [cycle.id, onRefresh])

  const handleSkipCurrent = useCallback(async () => {
    if (!currentItem) return
    setIsSkipping(true)
    try {
      const res = await skipCycleCurrentItemAction(cycle.id)
      if (res.success) {
        toast.success(
          `Etapa de ${currentItem.disciplineName} pulada. Tempo parcial preservado!`
        )
        onRefresh()
      } else {
        toast.error("Erro ao pular etapa.")
      }
    } finally {
      setIsSkipping(false)
    }
  }, [currentItem, cycle.id, onRefresh])

  return (
    <div className="space-y-6">
      {/* 1. CARD PRINCIPAL DO CICLO ATIVO */}
      <Card className="overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 shadow-md">
        {/* CABEÇALHO DO CARD */}
        <div className="border-b border-border/60 px-5 py-4 flex flex-wrap items-center justify-between gap-3 bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shadow-xs" />
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Ciclo Ativo
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight mt-0.5">
              {cycle.name}
            </h2>
            {(cycle.contest_name || cycle.edital_name) && (
              <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                {cycle.contest_name}
                {cycle.edital_name && ` • ${cycle.edital_name}`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onEditCycle && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEditCycle}
                className="text-xs h-8 gap-1.5 font-bold text-muted-foreground hover:text-foreground"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Editar ciclo
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseCycle}
              disabled={isPausing}
              className="text-xs h-8 gap-1.5 font-bold text-muted-foreground hover:text-foreground"
            >
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
            {onSelectAnotherCycle && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAnotherCycle}
                className="text-xs h-8 font-bold text-muted-foreground"
              >
                Trocar ciclo
              </Button>
            )}
          </div>
        </div>

        {/* MÉTRICAS DE VOLTAS E PROGRESSO DA VOLTA */}
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* VOLTA ATUAL */}
            <div className="p-3.5 rounded-xl bg-background/80 border border-border/60 shadow-2xs">
              <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">
                Volta Atual
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-foreground">
                  {currentRound}ª
                </span>
                <span className="text-xs text-muted-foreground font-bold">volta</span>
              </div>
            </div>

            {/* VOLTAS COMPLETAS */}
            <div className="p-3.5 rounded-xl bg-background/80 border border-border/60 shadow-2xs">
              <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">
                Voltas Concluídas
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-foreground">
                  {totalRoundsDone}
                </span>
                <span className="text-xs text-muted-foreground font-bold">
                  {totalRoundsDone === 1 ? "volta feita" : "voltas feitas"}
                </span>
              </div>
            </div>

            {/* TEMPO DA VOLTA */}
            <div className="p-3.5 rounded-xl bg-background/80 border border-border/60 shadow-2xs">
              <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">
                Tempo da Volta
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-foreground">
                  {formatMinutes(totalPlannedMinutesPerRound)}
                </span>
              </div>
            </div>

            {/* PROGRESSO DA VOLTA */}
            <div className="p-3.5 rounded-xl bg-background/80 border border-border/60 shadow-2xs">
              <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">
                Progresso Geral
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-black text-primary">
                  {roundProgressPercentage}%
                </span>
              </div>
            </div>
          </div>

          {/* BARRA DE PROGRESSO DA VOLTA */}
          <div className="space-y-2 bg-background/60 p-4 rounded-xl border border-border/60">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-muted-foreground uppercase tracking-wider">
                Progresso da Volta {currentRound}
              </span>
              <span className="text-primary font-black">{roundProgressPercentage}%</span>
            </div>
            <div className="h-3.5 bg-muted rounded-full overflow-hidden p-0.5 border border-border/40">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, roundProgressPercentage)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-medium">
              <span>{formatMinutes(totalStudiedMinutesInRound)} cumpridos nesta volta</span>
              {totalExtraMinutesInRound > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  +{formatMinutes(totalExtraMinutesInRound)} de tempo extra
                </span>
              )}
              <span>
                Faltam {formatMinutes(Math.max(0, totalPlannedMinutesPerRound - totalStudiedMinutesInRound))}
              </span>
            </div>
          </div>

          {/* 2. MATÉRIA ATUAL (EM FOCO) */}
          {currentItem ? (
            <div className="rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-5 sm:p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider rounded-md bg-primary text-primary-foreground shadow-xs">
                      ▶ EM FOCO
                    </span>
                    <span className="text-xs text-muted-foreground font-bold">
                      Etapa {(cycle.current_item_index || 0) + 1} de {items.length}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                        currentItem.difficulty === "FACIL" && "bg-emerald-100 text-emerald-700 border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400",
                        currentItem.difficulty === "MEDIA" && "bg-amber-100 text-amber-700 border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-400",
                        currentItem.difficulty === "DIFICIL" && "bg-rose-100 text-rose-700 border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-400"
                      )}
                    >
                      Dificuldade: {currentItem.difficulty}
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                    {currentItem.disciplineName}
                  </h3>
                  {currentItem.disciplineArea && (
                    <p className="text-xs font-semibold text-muted-foreground">
                      Área: {currentItem.disciplineArea}
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right shrink-0 bg-background/80 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    Meta da Etapa
                  </span>
                  <span className="text-2xl font-black text-foreground">
                    {formatMinutes(currentItem.plannedMinutes)}
                  </span>
                </div>
              </div>

              {/* PROGRESSO DA ETAPA ATUAL */}
              <div className="space-y-2 bg-background/90 rounded-xl p-4 border border-border/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black text-foreground">
                    {currentItem.studiedMinutesInRound} min / {currentItem.plannedMinutes} min
                  </span>
                  <span className="font-black text-primary">
                    {currentItem.remainingMinutesInRound > 0
                      ? `Faltam ${currentItem.remainingMinutesInRound} minutos`
                      : "Meta da etapa atingida!"}
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (currentItem.studiedMinutesInRound / currentItem.plannedMinutes) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* BOTÕES PRINCIPAIS DE AÇÃO */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <Button
                  onClick={handleStartStudy}
                  disabled={isCurrentItemStudying}
                  className="flex-1 h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm tracking-wide shadow-md hover:shadow-lg transition-all"
                >
                  <Play className="h-5 w-5 mr-2 fill-current" />
                  {isCurrentItemStudying
                    ? "Estudo em andamento no cronômetro..."
                    : currentItem.studiedMinutesInRound > 0
                    ? `CONTINUAR ESTUDO (${currentItem.remainingMinutesInRound} min restantes)`
                    : `INICIAR ESTUDO DE ${currentItem.disciplineName.toUpperCase()}`}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkipCurrent}
                  disabled={isSkipping || isCurrentItemStudying}
                  className="h-14 px-5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/80 gap-1.5"
                  title="Pular esta matéria na volta atual, mantendo o tempo já estudado"
                >
                  <SkipForward className="h-4 w-4" />
                  Pular etapa
                </Button>
              </div>

              {/* PRÉVIA DA PRÓXIMA MATÉRIA */}
              {nextItem && (
                <div className="pt-2 border-t border-border/40 flex items-center gap-2 text-xs text-muted-foreground">
                  <CornerDownRight className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    Depois desta:{" "}
                    <strong className="text-foreground font-black">
                      {nextItem.disciplineName}
                    </strong>{" "}
                    — {formatMinutes(nextItem.plannedMinutes)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-xl border">
              Nenhuma matéria configurada neste ciclo de estudos.
            </div>
          )}
        </div>
      </Card>

      {/* 3. SEQUÊNCIA COMPLETA DO CICLO */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
              Sequência do Ciclo ({items.length} matérias)
            </h3>
          </div>
          <span className="text-xs font-bold text-muted-foreground">
            {formatMinutes(totalPlannedMinutesPerRound)} / volta
          </span>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => {
            const isCompleted = item.status === "CONCLUIDO"
            const isCurrent = item.status === "ATUAL"
            const isSkipped = item.status === "PULADO"

            const progressPercent = Math.min(
              100,
              Math.round((item.studiedMinutesInRound / Math.max(1, item.plannedMinutes)) * 100)
            )

            return (
              <div
                key={item.itemId}
                className={cn(
                  "rounded-xl border p-3.5 transition-all",
                  isCurrent &&
                    "border-primary/60 bg-primary/5 shadow-xs ring-1 ring-primary/20",
                  isCompleted &&
                    "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20",
                  isSkipped &&
                    "border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20",
                  !isCurrent && !isCompleted && !isSkipped && "border-border/50 bg-muted/10"
                )}
              >
                {/* LINHA 1: Ícone + Número + Nome + Tempo */}
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    {isCompleted && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white font-black text-xs shadow-xs">
                        ✓
                      </div>
                    )}
                    {isCurrent && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground font-black text-xs animate-pulse shadow-xs">
                        ▶
                      </div>
                    )}
                    {isSkipped && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white font-black text-xs shadow-xs">
                        ↷
                      </div>
                    )}
                    {!isCompleted && !isCurrent && !isSkipped && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground font-bold text-xs">
                        ○
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-muted-foreground">
                        #{index + 1}
                      </span>
                      <h4 className={cn(
                        "text-sm font-black truncate",
                        isCurrent && "text-primary",
                        isCompleted && "text-emerald-700 dark:text-emerald-400",
                        isSkipped && "text-amber-700 dark:text-amber-400"
                      )}>
                        {item.disciplineName}
                      </h4>
                      {isCurrent && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                          Atual
                        </span>
                      )}
                      {isSkipped && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          Pulada
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={cn(
                      "text-xs font-black",
                      isCompleted && "text-emerald-600 dark:text-emerald-400",
                      isCurrent && "text-primary",
                      isSkipped && "text-amber-600 dark:text-amber-400",
                      !isCompleted && !isCurrent && !isSkipped && "text-foreground"
                    )}>
                      {item.studiedMinutesInRound}/{item.plannedMinutes} min
                    </span>
                  </div>
                </div>

                {/* LINHA 2: Área + Dificuldade + Extra/Status */}
                <div className="flex items-center justify-between mt-1 pl-10">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {item.disciplineArea || "Geral"} • Dificuldade: {item.difficulty}
                  </p>
                  <div className="text-right shrink-0">
                    {item.extraMinutesInRound > 0 && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        +{item.extraMinutesInRound} min extra
                      </span>
                    )}
                    {isCompleted && item.extraMinutesInRound === 0 && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Concluída na volta
                      </span>
                    )}
                    {isCurrent && item.remainingMinutesInRound > 0 && (
                      <span className="text-[11px] font-bold text-primary">
                        Faltam {item.remainingMinutesInRound} min
                      </span>
                    )}
                    {isSkipped && !isCompleted && (
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Incompleta nesta volta
                      </span>
                    )}
                  </div>
                </div>

                {/* LINHA 3: Barra de Progresso */}
                <div className="mt-2.5 pl-10">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isCompleted && "bg-emerald-500",
                        isCurrent && "bg-primary",
                        isSkipped && "bg-amber-500",
                        !isCompleted && !isCurrent && !isSkipped && "bg-muted-foreground/30"
                      )}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className={cn(
                    "text-[10px] font-bold mt-1 text-right",
                    isCompleted && "text-emerald-600 dark:text-emerald-400",
                    isCurrent && "text-primary",
                    isSkipped && "text-amber-600 dark:text-amber-400",
                    !isCompleted && !isCurrent && !isSkipped && "text-muted-foreground"
                  )}>
                    {progressPercent}%
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
