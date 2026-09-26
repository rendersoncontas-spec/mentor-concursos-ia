"use client"

import { useCallback, useState } from "react"

import {
  Check,
  CircleDashed,
  Clock,
  Edit3,
  Flag,
  Pause,
  Play,
  SkipForward,
} from "lucide-react"
import { toast } from "sonner"

import {
  concludeCycleRoundAction,
  pauseCycleAction,
  skipCycleCurrentItemAction,
} from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview } from "@/domain/study-cycle/study-cycle.types"
import { useStudyActions } from "@/features/study-session/components/study-provider"
import { cn } from "@/lib/utils"
import { formatDuration, formatDurationMinutes } from "@/lib/format-duration"

interface ActiveCyclePanelProps {
  overview: CycleOverview
  onRefresh: () => void
  onSelectAnotherCycle?: (() => void) | undefined
  onEditCycle?: (() => void) | undefined
}

/**
 * Cor da barra por percentual (0–100). Redesign 2.0: uma única cor (teal)
 * com intensidade crescente — antes era uma escala laranja→âmbar→lima→verde,
 * uma cor diferente por faixa, sem significado além do próprio número.
 */
export function getProgressColor(percent: number): string {
  if (percent >= 75) return "bg-primary"
  if (percent >= 50) return "bg-primary/85"
  if (percent >= 25) return "bg-primary/70"
  return "bg-primary/55"
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
  // Informação, não alerta: texto neutro, sem pílula colorida por nível.
  return (
    <span className="text-xs text-muted-foreground">
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
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-y-2 border-y border-border py-2.5">
      {items.map((m, i) => (
        <div key={`${m.label}-${i}`} className={cn("min-w-0 px-3", i > 0 && "sm:border-l sm:border-border")}>
          <span className="block text-xs text-muted-foreground whitespace-nowrap">
            {m.label}
          </span>
          <span className="flex items-baseline gap-0.5 whitespace-nowrap mt-0.5">
            <span className={cn("text-[15px] font-semibold leading-tight tabular-nums", m.valueColor ?? "text-foreground")}>
              {m.value}
            </span>
            {m.unit && (
              <span className="text-[10px] font-semibold text-muted-foreground">{m.unit}</span>
            )}
          </span>
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
  const { startSession, sessionSummary } = useStudyActions()
  const [isSkipping, setIsSkipping] = useState(false)
  const [isPausing, setIsPausing] = useState(false)
  const [isConcluding, setIsConcluding] = useState(false)
  const [showConcludeConfirm, setShowConcludeConfirm] = useState(false)

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
    Boolean(sessionSummary?.isActive) && sessionSummary?.cycleId === cycle.id

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

  /**
   * Encerra administrativamente a volta atual e inicia a próxima do zero.
   * Ação puramente administrativa: NUNCA registra estudo, minutos ou marca
   * matérias como concluídas — apenas avança o cursor do ciclo, reutilizando
   * a mesma transição central de rodada usada pela conclusão natural (ver
   * concludeCurrentCycleRound).
   */
  const handleConcludeRound = useCallback(async () => {
    if (isConcluding) return
    setIsConcluding(true)
    try {
      const res = await concludeCycleRoundAction(cycle.id)
      if (res.success) {
        toast.success("Nova volta iniciada.")
        onRefresh()
      } else {
        toast.error(res.error || "Erro ao concluir a volta.")
      }
    } finally {
      setIsConcluding(false)
      setShowConcludeConfirm(false)
    }
  }, [cycle.id, isConcluding, onRefresh])

  const remainingRoundMinutes = Math.max(0, totalPlannedMinutesPerRound - totalStudiedMinutesInRound)

  return (
    <div className="space-y-4">
      {/* 1. CICLO ATIVO — cabeçalho, métricas e matéria em foco (Redesign 2.0:
          uma superfície só, estrutura por divisórias em vez de caixas internas) */}
      <Card className="overflow-hidden">
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Ciclo ativo
                {(cycle.contest_name || cycle.edital_name) && (
                  <span className="truncate">
                    · {cycle.contest_name}
                    {cycle.edital_name && ` · ${cycle.edital_name}`}
                  </span>
                )}
              </p>
              <h2 className="truncate type-h2 text-foreground mt-0.5">
                {cycle.name}
              </h2>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onEditCycle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEditCycle}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePauseCycle}
                disabled={isPausing}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Pause className="h-3.5 w-3.5" />
                Pausar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConcludeConfirm(true)}
                disabled={isConcluding}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                title="Encerrar a volta atual e iniciar uma nova, do zero"
              >
                <Flag className="h-3.5 w-3.5" />
                Concluir volta
              </Button>
              {onSelectAnotherCycle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAnotherCycle}
                  className="text-muted-foreground hover:text-foreground"
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
              { label: "Tempo/volta", value: formatDurationMinutes(totalPlannedMinutesPerRound) },
              {
                label: "Restam",
                value: formatDurationMinutes(remainingRoundMinutes),
              },
              {
                label: "Progresso",
                value: `${roundProgressPercentage}%`,
                valueColor: "text-primary",
              },
            ]}
          />

          <div className="space-y-1.5">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, roundProgressPercentage)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground tabular-nums">
              <span>{formatDurationMinutes(totalStudiedMinutesInRound)} cumpridos</span>
              {totalExtraMinutesInRound > 0 && (
                <span className="text-foreground">
                  +{formatDurationMinutes(totalExtraMinutesInRound)} extra
                </span>
              )}
              <span>Faltam {formatDurationMinutes(remainingRoundMinutes)}</span>
            </div>
          </div>
        </div>

        {/* 2. EM FOCO + PRÓXIMA */}
        {currentItem ? (
          <div className="grid border-t border-border lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,1fr)] lg:divide-x divide-border">
            <div className="border-l-2 border-primary px-4 py-3.5 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] font-semibold text-primary shrink-0">
                  Em foco
                </span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  Etapa {(cycle.current_item_index || 0) + 1}/{items.length}
                </span>
                <span className="text-xs text-muted-foreground" aria-hidden>·</span>
                <DifficultyBadge difficulty={currentItem.difficulty} />
                <span className="ml-auto text-xs text-muted-foreground shrink-0 tabular-nums">
                  Meta {formatDurationMinutes(currentItem.plannedMinutes)}
                </span>
              </div>

              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="truncate text-lg font-semibold text-foreground leading-tight">
                  {currentItem.disciplineName}
                </h3>
                {currentItem.disciplineArea && (
                  <span className="truncate text-[13px] text-muted-foreground">
                    {currentItem.disciplineArea}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                <span className="font-medium text-foreground whitespace-nowrap">
                  {Math.round(currentItem.studiedMinutesInRound)}/{currentItem.plannedMinutes} min
                </span>
                <div className="h-1 min-w-[120px] flex-1 bg-muted rounded-full overflow-hidden">
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
                <span className="text-muted-foreground whitespace-nowrap">
                  {currentItem.remainingMinutesInRound > 0
                    ? `Faltam ${Math.round(currentItem.remainingMinutesInRound)} min`
                    : "Meta atingida"}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={handleStartStudy}
                  disabled={isCurrentItemStudying}
                  className="w-full sm:w-auto sm:min-w-[200px]"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {isCurrentItemStudying
                    ? "Estudo em andamento"
                    : currentItem.studiedMinutesInRound > 0
                    ? `Continuar (${Math.round(currentItem.remainingMinutesInRound)} min)`
                    : "Iniciar estudo"}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleSkipCurrent}
                  disabled={isSkipping || isCurrentItemStudying}
                  className="gap-1.5 shrink-0"
                  title="Pular esta matéria na volta atual, mantendo o tempo já estudado"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  Pular
                </Button>
              </div>
            </div>

            <div className="border-t lg:border-t-0 border-border px-4 py-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="type-label">
                  Próxima
                </span>
                {nextItem && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                    Meta {formatDurationMinutes(nextItem.plannedMinutes)}
                  </span>
                )}
              </div>
              {nextItem ? (
                <>
                  <h4 className="truncate text-sm font-semibold text-foreground leading-snug">
                    {nextItem.disciplineName}
                  </h4>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {nextItem.disciplineArea || "Geral"} · {nextItem.difficulty}
                  </p>
                  <div className="flex items-center gap-2 text-xs leading-tight tabular-nums">
                    <span className="text-foreground whitespace-nowrap">
                      {Math.round(nextItem.studiedMinutesInRound)}/{nextItem.plannedMinutes} min
                    </span>
                    <span className="ml-auto text-muted-foreground whitespace-nowrap">
                      {Math.min(
                        100,
                        Math.round(
                          (nextItem.studiedMinutesInRound / Math.max(1, nextItem.plannedMinutes)) * 100
                        )
                      )}%
                    </span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all duration-300"
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
                <p className="text-[13px] text-muted-foreground leading-snug">
                  Fim da volta — ao concluir, o ciclo recomeça.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="border-t border-border p-4 text-center text-[13px] text-muted-foreground">
            Nenhuma matéria configurada neste ciclo de estudos.
          </div>
        )}
      </Card>

      {/* 3. SEQUÊNCIA DO CICLO — tabela (Redesign 2.0). O item atual (cursor)
          é marcado por filete teal à esquerda + rótulo "Atual"; concluídas,
          puladas e parciais são estados de texto, não caixas coloridas. */}
      <section aria-labelledby="sequencia-ciclo" className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <h3 id="sequencia-ciclo" className="type-h3 text-foreground">
            Sequência do ciclo
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {items.length} {items.length === 1 ? "matéria" : "matérias"}
            </span>
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDurationMinutes(totalPlannedMinutesPerRound)} por volta
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div
            role="row"
            className="type-label hidden sm:grid grid-cols-[2rem_minmax(0,1.3fr)_minmax(140px,1fr)_88px_96px] lg:grid-cols-[2rem_minmax(0,1.3fr)_minmax(180px,1.2fr)_96px_88px_104px] items-center gap-3 border-b border-border bg-muted/40 px-3 py-2"
          >
            <span>#</span>
            <span>Disciplina</span>
            <span>Progresso</span>
            <span className="hidden lg:block text-right">Estudado</span>
            <span className="text-right">Meta</span>
            <span>Status</span>
          </div>

          <ol className="divide-y divide-border">
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
              const metaLabel = formatDurationMinutes(target)
              const statusLine = isDone
                ? `Extra: ${formatDuration(extra * 60)}`
                : `Falta: ${formatDuration(remaining * 60)}`
              const barColor = isDone
                ? "bg-success"
                : isSkipped
                  ? "bg-warning"
                  : getProgressColor(progressPercent)

              return (
                <li
                  key={item.itemId}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    // Fase E: a coluna de progresso cresce com a tela (antes parava em
                    // 220px e sobrava espaço vazio no nome); no desktop largo entra a
                    // coluna "Estudado" com o tempo já registrado na volta.
                    "grid grid-cols-[2rem_minmax(0,1fr)_auto] sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(140px,1fr)_88px_96px] lg:grid-cols-[2rem_minmax(0,1.3fr)_minmax(180px,1.2fr)_96px_88px_104px] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 border-l-2",
                    isCurrent ? "border-l-primary bg-primary/[0.05]" : "border-l-transparent",
                  )}
                >
                  <span className="text-xs text-muted-foreground tabular-nums flex items-center">
                    {isDone && (
                      <Check aria-label="Concluída" className="h-3.5 w-3.5 text-success" strokeWidth={2.5} />
                    )}
                    {!isDone && isSkipped && (
                      <SkipForward aria-label="Pulada" className="h-3.5 w-3.5 text-warning" />
                    )}
                    {!isDone && !isSkipped && isCurrent && (
                      <Play aria-label="Atual" className="h-3 w-3 text-primary fill-current" />
                    )}
                    {!isDone && !isSkipped && !isCurrent && isPartial && (
                      <Clock aria-label="Em andamento" className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {visual === "PENDING" && (
                      <CircleDashed aria-label="Pendente" className="h-3.5 w-3.5 text-muted-foreground/60" />
                    )}
                    <span className="sr-only">{index + 1}</span>
                  </span>

                  <div className="min-w-0">
                    <p className={cn(
                      "text-sm truncate leading-snug",
                      isCurrent ? "font-semibold text-foreground" : "font-medium text-foreground",
                      isSkipped && "text-muted-foreground",
                    )}>
                      <span className="text-muted-foreground tabular-nums mr-1.5 font-normal">{index + 1}.</span>
                      {item.disciplineName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground leading-tight tabular-nums">
                      {statusLine}
                    </p>
                  </div>

                  <div className="col-span-3 sm:col-span-1 flex items-center gap-2 max-sm:pl-[calc(2rem+0.75rem)]">
                    <div className="h-1 min-w-[60px] flex-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          barColor
                        )}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="shrink-0 w-12 text-right text-xs tabular-nums text-foreground">
                      {progressLabel}
                    </span>
                  </div>

                  <span className="hidden lg:block text-right text-[13px] tabular-nums text-muted-foreground">
                    {formatDurationMinutes(studied)}
                  </span>

                  <span className="hidden sm:block text-right text-[13px] tabular-nums text-foreground">
                    {metaLabel}
                  </span>

                  <span className="row-start-1 col-start-3 sm:row-auto sm:col-auto text-xs whitespace-nowrap">
                    {isCurrent && <span className="font-medium text-primary">Atual</span>}
                    {visual === "COMPLETED_EARLY" && <span className="text-success">Antecipada</span>}
                    {visual === "COMPLETED" && <span className="text-success">Concluída</span>}
                    {isSkipped && <span className="text-amber-700 dark:text-amber-400">Pulada</span>}
                    {isPartial && !isCurrent && <span className="text-muted-foreground">Parcial</span>}
                    {visual === "PENDING" && <span className="text-muted-foreground">Pendente</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {/* DIÁLOGO DE CONFIRMAÇÃO — concluir volta manualmente */}
      {showConcludeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-sm w-full p-5 space-y-3 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Concluir ciclo atual?</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Isso encerra a volta atual e inicia uma nova volta do zero. Seus estudos já
              realizados serão preservados. Nenhum tempo de estudo será adicionado.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConcludeConfirm(false)}
                disabled={isConcluding}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleConcludeRound}
                disabled={isConcluding}
                className="font-semibold text-xs gap-1.5"
              >
                <Flag className="h-3.5 w-3.5" />
                {isConcluding ? "Concluindo..." : "Concluir e iniciar nova volta"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}