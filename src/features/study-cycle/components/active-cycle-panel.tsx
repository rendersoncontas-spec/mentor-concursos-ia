"use client"

import { useCallback, useEffect, useState } from "react"

import { CheckCircle2, Clock, ArrowRight, Pause, Play, Square, SkipForward } from "lucide-react"

import {
  advanceCycleItemAction,
  pauseCycleAction,
  concludeCycleAction,
} from "@/application/study-cycle/study-cycle.actions"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { StudyCycleWithItems } from "@/domain/study-cycle/study-cycle.types"
import { cn } from "@/lib/utils"

interface ActiveCyclePanelProps {
  cycle: StudyCycleWithItems
  onRefresh: () => void
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m}min`
}

export function ActiveCyclePanel({ cycle, onRefresh }: ActiveCyclePanelProps) {
  const { startSession, session, endSession } = useGlobalStudy()
  const [isProcessing, setIsProcessing] = useState(false)
  const [blockCompleteMessage, setBlockCompleteMessage] = useState<string | null>(null)
  const [nextDiscipline, setNextDiscipline] = useState<string | null>(null)

  const currentIndex = Math.min(cycle.current_item_index, cycle.items.length - 1)
  const currentItem = cycle.items[currentIndex]
  const nextItem = cycle.items[currentIndex + 1]

  const totalPlanned = cycle.items.reduce((s, i) => s + i.planned_minutes, 0)
  const totalCompleted = cycle.items.reduce((s, i) => s + i.completed_minutes, 0)
  const progress = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0

  const currentRemaining = currentItem
    ? Math.max(0, currentItem.planned_minutes - currentItem.completed_minutes)
    : 0

  const isStudyingThisCycle = session?.isActive && session.disciplineId === currentItem?.discipline_id

  const handleStartStudy = useCallback(() => {
    if (!currentItem) return
    startSession({
      disciplineName: currentItem.discipline?.name || "Matéria",
      disciplineId: currentItem.discipline_id,
      studyType: "TEORIA",
      plannedSeconds: currentRemaining * 60,
      source: "PLAN",
      cycleId: cycle.id,
      cycleItemId: currentItem.id,
    })
  }, [currentItem, currentRemaining, cycle.id, startSession])

  const handleRegisterStudy = useCallback(async () => {
    if (!currentItem || !session?.isActive) return
    setIsProcessing(true)
    try {
      const elapsedMinutes = Math.floor(session.activeSeconds / 60)
      if (elapsedMinutes > 0) {
        const result = await advanceCycleItemAction(cycle.id, elapsedMinutes)
        if (result.success) {
          if (result.blockJustCompleted) {
            setBlockCompleteMessage("Bloco concluído!")
            setNextDiscipline(
              nextItem ? (nextItem.discipline?.name || "Próxima matéria") : null
            )
            setTimeout(() => {
              setBlockCompleteMessage(null)
              setNextDiscipline(null)
            }, 4000)
          }
          endSession()
          onRefresh()
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [currentItem, session, cycle.id, nextItem, endSession, onRefresh])

  const handlePauseCycle = useCallback(async () => {
    await pauseCycleAction(cycle.id)
    onRefresh()
  }, [cycle.id, onRefresh])

  const handleSkipBlock = useCallback(async () => {
    if (!currentItem) return
    setIsProcessing(true)
    try {
      const remainingMinutes = currentItem.planned_minutes - currentItem.completed_minutes
      if (remainingMinutes > 0) {
        const result = await advanceCycleItemAction(cycle.id, remainingMinutes)
        if (result.success) {
          setBlockCompleteMessage("Bloco pulado")
          setNextDiscipline(
            nextItem ? (nextItem.discipline?.name || "Próxima matéria") : null
          )
          setTimeout(() => {
            setBlockCompleteMessage(null)
            setNextDiscipline(null)
          }, 3000)
          onRefresh()
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [currentItem, cycle.id, nextItem, onRefresh])

  if (!currentItem) {
    return (
      <Card className="p-6 text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
        <h3 className="text-lg font-bold text-foreground">Ciclo concluído!</h3>
        <p className="text-sm text-muted-foreground">
          Todas as matérias foram concluídas. Parabéns!
        </p>
        <Button onClick={handlePauseCycle} variant="outline" size="sm">
          Pausar ciclo
        </Button>
      </Card>
    )
  }

  if (blockCompleteMessage) {
    return (
      <Card className="p-6 text-center space-y-3 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
        <h3 className="text-lg font-bold text-foreground">{blockCompleteMessage}</h3>
        {nextDiscipline && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Próxima matéria:</p>
            <p className="text-base font-bold text-foreground">{nextDiscipline}</p>
          </div>
        )}
        <Button onClick={onRefresh} size="sm" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white">
          <ArrowRight className="h-4 w-4 mr-1" />
          Continuar ciclo
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-muted/30 px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Matéria Atual
              </p>
              <h3 className="text-lg font-black text-foreground mt-0.5">
                {currentItem.discipline?.name || "Matéria"}
              </h3>
            </div>
            <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {currentIndex + 1}/{cycle.items.length}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso do bloco</span>
              <span className="font-bold text-foreground">
                {formatMinutes(currentItem.completed_minutes)} / {formatMinutes(currentItem.planned_minutes)}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    (currentItem.completed_minutes / currentItem.planned_minutes) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Faltam {formatMinutes(currentRemaining)}</span>
              </div>
              <span>Prioridade: {currentItem.priority}</span>
            </div>
          </div>

          {nextItem && (
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Próxima
              </p>
              <p className="text-sm font-semibold text-foreground">
                {nextItem.discipline?.name || "Matéria"}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {!isStudyingThisCycle ? (
              <Button
                onClick={handleStartStudy}
                className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold"
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar estudo
              </Button>
            ) : (
              <Button
                onClick={handleRegisterStudy}
                disabled={isProcessing}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isProcessing ? "Registrando..." : "Registrar estudo"}
              </Button>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handlePauseCycle}
              >
                <Pause className="h-3 w-3 mr-1" />
                Pausar ciclo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleSkipBlock}
                disabled={isProcessing}
              >
                <SkipForward className="h-3 w-3 mr-1" />
                Pular
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Sequência do ciclo
        </h4>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {cycle.items.map((item, index) => {
            const isActive = index === currentIndex
            const isDone = item.status === "CONCLUIDO"
            const isPast = index < currentIndex
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive && "bg-[#2563EB]/10 border border-[#2563EB]/20",
                  isDone && "opacity-60",
                  isPast && !isDone && "opacity-50",
                  !isActive && !isDone && !isPast && "hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0",
                    isDone && "bg-emerald-500 text-white",
                    isActive && "bg-[#2563EB] text-white",
                    !isDone && !isActive && "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? "✓" : index + 1}
                </span>
                <span className="flex-1 truncate">{item.discipline?.name || "Matéria"}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatMinutes(item.completed_minutes)}/{formatMinutes(item.planned_minutes)}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
