"use client"

import { useCallback, useState } from "react"

import {
  Check,
  CircleDashed,
  Clock,
  Edit3,
  Layers,
  Pause,
  Play,
  SkipForward,
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

/** Duração legível compacta a partir de segundos: 1h30m25s, 1h01m, 45s. */
export function formatCycleDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || h === 0) parts.push(h > 0 ? `${String(m).padStart(2, "0")}m` : `${m}m`)
  if (rest > 0) parts.push(h > 0 || m > 0 ? `${String(rest).padStart(2, "0")}s` : `${rest}s`)
  return parts.join("")
}

/** Duração legível a partir de minutos (fonte: minutos inteiros do ciclo). */
export function formatCycleMinutes(totalMinutes: number): string {
  return formatCycleDuration(Math.max(0, Math.round(totalMinutes)) * 60)
}

/** Cor progressiva da barra por percentual (0–100). */
export function getProgressColor(percent: number): string {
  if (percent >= 75) return "bg-emerald-500"
  if (percent >= 50) return "bg-lime-500"
  if (percent >= 25) return "bg-amber-400"
  return "bg-orange-500"
}

/** Percentual com 1 casa decimal no padrão pt-BR (ex: 66,1%). */
export function formatCyclePercent(studiedMinutes: number, targetMinutes: number): string {
  const target = Math.max(1, targetMinutes)
  const pct = Math.min(100, (Math.max(0, studiedMinutes) / target) * 100)
  return `${pct.toFixed(1).replace(".", ",")}%`
}

type CycleItemVisualStatus =
  | "SKIPPED"
  | "CURRENT"
  | "COMPLETED"
  | "COMPLETED_EARLY"
  | "PARTIAL"
  | "PENDING"

/**
 * Status VISUAL do item — derivado do progresso real, não só do cursor.
 * O cursor (current_item_index) continua sendo a única fonte da lógica de avanço.
 */
function getCycleItemVisualStatus(item: {
  status: string
  studiedMinutesInRound: number
  plannedMinutes: number
}): CycleItemVisualStatus {
  if (item.status === "PULADO") return "SKIPPED"
  if (item.status === "ATUAL") return "CURRENT"
  const target = Math.max(1, item.plannedMinutes)
  const studied = Math.max(0, item.studiedMinutesInRound)
  if (studied >= target) {
    // Futura já cumprida: o cursor pode estar em item anterior incompleto
    return item.status === "PENDENTE" ? "COMPLETED_EARLY" : "COMPLETED"
  }
  if (studied > 0) return "PARTIAL"
  return "PENDING"
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return (
    <span
      className={cn(
        "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
        difficulty === "FACIL" && "bg-emerald-100 text-emerald-700 border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400",
        difficulty === "MEDIA" && "bg-amber-100 text-amber-700 border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-400",
        difficulty === "DIFICIL" && "bg-rose-100 text-rose-700 border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-400"
      )}
    >
      Dificuldade: {difficulty}
    </span>
  )
}

function MetricStrip({
  items,
}: {
  items: { label: string; value: string | number; unit?: string; valueColor?: string }[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5">
      {items.map((m, i) => (
        <div key={`${m.label}-${i}`} className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            {m.label}
          </span>
          <span className="flex items-baseline gap-0.5 whitespace-nowrap">
            <span className={cn("text-sm font-black leading-none", m.valueColor ?? "text-foreground")}>
              {m.value}
            </span>
            {m.unit && (
              <span className="text-[10px] font-bold text-muted-foreground">{m.unit}</span>
            )}
          </span>
          {i < items.length - 1 && (
            <span className="ml-2.5 hidden h-3.5 w-px bg-border/60 sm:block" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  )
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

    const startResult = startSession({
      disciplineName: currentItem.disciplineName,
      disciplineId: currentItem.disciplineId,
      studyType: "TEORIA",
      plannedSeconds: Math.max(1, currentItem.remainingMinutesInRound) * 60,
      source: "CYCLE",
      cycleId: cycle.id,
      cycleItemId: currentItem.itemId,
    })

    if (!startResult.started) {
      toast.error("Já existe uma sessão ativa. Retome, salve ou encerre antes de iniciar outra.")
      return
    }
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

  const remainingRoundMinutes = Math.max(0, totalPlannedMinutesPerRound - totalStudiedMinutesInRound)

  return (
    <div className="space-y-2">
      {/* 1. CARD PRINCIPAL DO CICLO ATIVO - ULTRA COMPACTO */}
      <Card className="overflow-hidden border border-primary/30 bg-card shadow-sm">
        {/* CABEÇALHO + MÉTRICAS + PROGRESSO EM ÁREA ÚNICA */}
        <div className="space-y-1.5 px-2.5 py-2 sm:px-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="truncate text-[15px] font-black text-foreground tracking-tight">
                {cycle.name}
              </h2>
              {(cycle.contest_name || cycle.edital_name) && (
                <span className="truncate text-xs font-semibold text-muted-foreground">
                  • {cycle.contest_name}
                  {cycle.edital_name && ` • ${cycle.edital_name}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onEditCycle && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditCycle}
                  className="text-[11px] h-6 gap-1 font-bold text-muted-foreground hover:text-foreground px-2"
                >
                  <Edit3 className="h-3 w-3" />
                  Editar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseCycle}
                disabled={isPausing}
                className="text-[11px] h-6 gap-1 font-bold text-muted-foreground hover:text-foreground px-2"
              >
                <Pause className="h-3 w-3" />
                Pausar
              </Button>
              {onSelectAnotherCycle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAnotherCycle}
                  className="text-[11px] h-6 font-bold text-muted-foreground px-1.5"
                >
                  Trocar
                </Button>
              )}
            </div>
          </div>

          <MetricStrip
            items={[
              { label: "Volta", value: `${currentRound}ª` },
              {
                label: "Concluídas",
                value: totalRoundsDone,
              },
              { label: "Tempo/volta", value: formatMinutes(totalPlannedMinutesPerRound) },
              {
                label: "Restam",
                value: formatMinutes(remainingRoundMinutes),
              },
              {
                label: "Progresso",
                value: `${roundProgressPercentage}%`,
                valueColor: "text-primary",
              },
            ]}
          />

          <div className="space-y-1">
            <div className="h-[5px] bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, roundProgressPercentage)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] text-muted-foreground font-medium leading-tight">
              <span>{formatMinutes(totalStudiedMinutesInRound)} cumpridos</span>
              {totalExtraMinutesInRound > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  +{formatMinutes(totalExtraMinutesInRound)} extra
                </span>
              )}
              <span>Faltam {formatMinutes(remainingRoundMinutes)}</span>
            </div>
          </div>

          {/* 2. EM FOCO + PRÓXIMA LADO A LADO */}
          {currentItem ? (
            <div className="grid gap-1.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,1fr)]">
              <div className="rounded-xl border border-primary/50 bg-primary/5 px-3 py-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="px-1.5 py-px text-[10px] font-black uppercase tracking-wider rounded-md bg-primary text-primary-foreground shrink-0">
                    ▶ Em foco
                  </span>
                  <span className="text-[11px] text-muted-foreground font-bold shrink-0">
                    Etapa {(cycle.current_item_index || 0) + 1}/{items.length}
                  </span>
                  <DifficultyBadge difficulty={currentItem.difficulty} />
                  <span className="ml-auto text-[11px] font-black text-foreground shrink-0">
                    Meta {formatMinutes(currentItem.plannedMinutes)}
                  </span>
                </div>

                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h3 className="truncate text-lg font-black text-foreground tracking-tight leading-tight">
                    {currentItem.disciplineName}
                  </h3>
                  {currentItem.disciplineArea && (
                    <span className="truncate text-xs font-semibold text-muted-foreground">
                      • {currentItem.disciplineArea}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-tight">
                  <span className="font-black text-foreground whitespace-nowrap">
                    {currentItem.studiedMinutesInRound}/{currentItem.plannedMinutes} min
                  </span>
                  <div className="h-1.5 min-w-[120px] flex-1 bg-muted rounded-full overflow-hidden">
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
                  <span className="font-black text-primary whitespace-nowrap">
                    {currentItem.remainingMinutesInRound > 0
                      ? `Faltam ${currentItem.remainingMinutesInRound} min`
                      : "Meta atingida!"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    onClick={handleStartStudy}
                    disabled={isCurrentItemStudying}
                    className="h-9 w-full sm:max-w-[240px] bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs tracking-wide shadow-sm hover:shadow-md transition-all"
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                    {isCurrentItemStudying
                      ? "Estudo em andamento..."
                      : currentItem.studiedMinutesInRound > 0
                      ? `Continuar (${currentItem.remainingMinutesInRound} min)`
                      : "Iniciar estudo"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSkipCurrent}
                    disabled={isSkipping || isCurrentItemStudying}
                    className="h-9 px-3 text-[11px] font-bold text-muted-foreground hover:text-foreground gap-1 shrink-0"
                    title="Pular esta matéria na volta atual, mantendo o tempo já estudado"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Pular
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Próxima
                  </span>
                  {nextItem && (
                    <span className="text-[11px] font-black text-foreground whitespace-nowrap">
                      Meta {formatMinutes(nextItem.plannedMinutes)}
                    </span>
                  )}
                </div>
                {nextItem ? (
                  <>
                    <h4 className="truncate text-sm font-black text-foreground leading-snug">
                      {nextItem.disciplineName}
                    </h4>
                    <p className="truncate text-[11px] font-semibold text-muted-foreground leading-tight">
                      {nextItem.disciplineArea || "Geral"} • {nextItem.difficulty}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] font-black leading-tight">
                      <span className="text-foreground whitespace-nowrap">
                        {nextItem.studiedMinutesInRound}/{nextItem.plannedMinutes} min
                      </span>
                      <span className="ml-auto text-primary whitespace-nowrap">
                        {Math.min(
                          100,
                          Math.round(
                            (nextItem.studiedMinutesInRound / Math.max(1, nextItem.plannedMinutes)) * 100
                          )
                        )}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (nextItem.studiedMinutesInRound / Math.max(1, nextItem.plannedMinutes)) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] font-semibold text-muted-foreground leading-snug">
                    Fim da volta — ao concluir, o ciclo recomeça.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded-xl border text-sm">
              Nenhuma matéria configurada neste ciclo de estudos.
            </div>
          )}
        </div>
      </Card>

      {/* 3. SEQUÊNCIA COMPLETA DO CICLO - ITENS COMPACTOS (~65-85px) */}
      <Card className="p-2.5 sm:p-3 space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
              Sequência do Ciclo ({items.length} matérias)
            </h3>
          </div>
          <span className="text-[11px] font-bold text-muted-foreground">
            {formatMinutes(totalPlannedMinutesPerRound)} / volta
          </span>
        </div>

        <div className="grid gap-1.5 xl:grid-cols-2">
          {items.map((item, index) => {
            const visual = getCycleItemVisualStatus(item)
            const isCurrent = visual === "CURRENT"
            const isSkipped = visual === "SKIPPED"
            const isDone =
              visual === "COMPLETED" || visual === "COMPLETED_EARLY"
            const isPartial = visual === "PARTIAL"

            const target = Math.max(1, item.plannedMinutes)
            const studied = Math.max(0, item.studiedMinutesInRound)
            const remaining = Math.max(0, target - studied)
            const extra = Math.max(0, item.extraMinutesInRound)
            const progressPercent = Math.min(100, Math.round((studied / target) * 100))
            const progressLabel = formatCyclePercent(studied, target)
            const metaLabel = formatCycleMinutes(target)
            const statusLine = isDone
              ? `Extra: ${formatCycleDuration(extra * 60)} - Meta definida: ${metaLabel}`
              : `Falta: ${formatCycleDuration(remaining * 60)} - Meta definida: ${metaLabel}`
            const barColor = isDone
              ? "bg-emerald-500"
              : isSkipped
                ? "bg-amber-500"
                : getProgressColor(progressPercent)

            return (
              <div
                key={item.itemId}
                className={cn(
                  "rounded-lg border px-2.5 py-2 transition-all min-h-[76px]",
                  isCurrent &&
                    "border-primary/60 bg-primary/5 ring-1 ring-primary/20",
                  isDone &&
                    "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20",
                  isSkipped &&
                    "border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20",
                  !isCurrent && !isDone && !isSkipped && "border-border/50 bg-muted/10"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <div className="shrink-0">
                    {isDone && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                    {isCurrent && !isDone && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground animate-pulse">
                        <Play className="h-3 w-3 fill-current" />
                      </div>
                    )}
                    {isSkipped && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
                        <SkipForward className="h-3 w-3" />
                      </div>
                    )}
                    {isPartial && !isCurrent && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary/60 text-primary">
                        <Clock className="h-3 w-3" />
                      </div>
                    )}
                    {visual === "PENDING" && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground">
                        <CircleDashed className="h-3 w-3" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-black text-muted-foreground shrink-0">
                        #{index + 1}
                      </span>
                      <h4 className={cn(
                        "text-sm font-black truncate leading-snug",
                        isCurrent && !isDone && "text-primary",
                        isDone && "text-emerald-700 dark:text-emerald-400",
                        isSkipped && "text-amber-700 dark:text-amber-400"
                      )}>
                        {item.disciplineName}
                      </h4>
                      {isCurrent && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-1 py-px rounded-full bg-primary text-primary-foreground shrink-0">
                          Atual
                        </span>
                      )}
                      {visual === "COMPLETED_EARLY" && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-1 py-px rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                          Concluída antecipadamente
                        </span>
                      )}
                      {isSkipped && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-1 py-px rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                          Pulada
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground leading-tight">
                      {statusLine}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1.5 min-w-[60px] flex-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            barColor
                          )}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] font-black tabular-nums text-foreground leading-tight">
                        {progressLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}