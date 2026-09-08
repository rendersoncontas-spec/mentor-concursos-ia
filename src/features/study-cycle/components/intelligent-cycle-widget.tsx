"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useRouter } from "next/navigation"

import {
  ArrowRight,
  Edit3,
  Layers,
  MoreVertical,
  Pause,
  Play,
  RefreshCcw,
  SkipForward,
} from "lucide-react"
import { toast } from "sonner"

import {
  activateCycleAction,
  deleteCycleAction,
  pauseCycleAction,
  skipCycleCurrentItemAction,
} from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview, CycleItemProgress } from "@/domain/study-cycle/study-cycle.types"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { cn } from "@/lib/utils"
import { getActiveCycleAction } from "@/application/study-cycle/study-cycle.actions"

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function getLastSubjectOfRound(items: CycleItemProgress[]): CycleItemProgress | null {
  if (!items || items.length === 0) return null
  return items[items.length - 1] ?? null
}

function isLastSubjectOfRound(currentItem: CycleItemProgress | null, items: CycleItemProgress[]): boolean {
  if (!currentItem || !items || items.length === 0) return false
  const lastItem = items[items.length - 1]
  return lastItem ? lastItem.itemId === currentItem.itemId : false
}

interface IntelligentCycleWidgetProps {
  embedded?: boolean
  onDeleteCycle?: () => void
}

export function IntelligentCycleWidget({ embedded = false, onDeleteCycle }: IntelligentCycleWidgetProps) {
  const router = useRouter()
  const { startSession, session } = useGlobalStudy()
  const [overview, setOverview] = useState<CycleOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isPausing, setIsPausing] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadOverview = useCallback(() => {
    setIsLoading(true)
    getActiveCycleAction()
      .then(setOverview)
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handlePauseCycle = useCallback(async () => {
    if (!overview) return
    setIsPausing(true)
    try {
      const res = await pauseCycleAction(overview.cycle.id)
      if (res.success) {
        toast.success("Ciclo pausado.")
        loadOverview()
      } else {
        toast.error("Erro ao pausar ciclo.")
      }
    } finally {
      setIsPausing(false)
      setIsMenuOpen(false)
    }
  }, [overview, loadOverview])

  const handleResumeCycle = useCallback(async () => {
    if (!overview) return
    const res = await activateCycleAction(overview.cycle.id)
    if (res.success) {
      toast.success("Ciclo retomado!")
      loadOverview()
    } else {
      toast.error("Erro ao retomar ciclo.")
    }
  }, [overview, loadOverview])

  const handleDeleteCycle = useCallback(async () => {
    if (!overview) return
    setIsDeleting(true)
    try {
      const res = await deleteCycleAction(overview.cycle.id)
      if (res.success) {
        toast.success("Ciclo excluído.")
        setOverview(null)
        onDeleteCycle?.()
      } else {
        toast.error("Erro ao excluir ciclo.")
      }
    } finally {
      setIsDeleting(false)
      setIsMenuOpen(false)
    }
  }, [overview, onDeleteCycle])

  const handleSkipStep = useCallback(async () => {
    if (!overview) return
    setIsSkipping(true)
    try {
      const res = await skipCycleCurrentItemAction(overview.cycle.id)
      if (res.success) {
        toast.success("Etapa pulada. Tempo parcial preservado!")
        loadOverview()
      } else {
        toast.error("Erro ao pular etapa.")
      }
    } finally {
      setIsSkipping(false)
    }
  }, [overview, loadOverview])

  const handleStartStudy = useCallback(() => {
    if (!overview?.currentItem || !overview.cycle) return
    startSession({
      disciplineName: overview.currentItem.disciplineName,
      disciplineId: overview.currentItem.disciplineId,
      studyType: "TEORIA",
      plannedSeconds: Math.max(1, overview.currentItem.remainingMinutesInRound) * 60,
      source: "CYCLE",
      cycleId: overview.cycle.id,
      cycleItemId: overview.currentItem.itemId,
    })
    toast.success(`Estudo do ciclo iniciado: ${overview.currentItem.disciplineName}`)
  }, [overview, startSession])

  const handleNavigate = useCallback(() => {
    router.push("/ciclos")
  }, [router])

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center h-24">
        <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No cycle state
  if (!overview) {
    return (
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Ciclo de Estudo
            </p>
            <p className="text-sm font-black text-foreground">Nenhum ciclo ativo</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Crie um ciclo de estudos para organizar suas matérias em uma sequência contínua.
        </p>
        <Button
          onClick={handleNavigate}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs h-9 shadow-xs"
        >
          Criar ciclo
        </Button>
      </div>
    )
  }

  const { cycle, items, currentItem, nextItem, currentRound, totalRoundsDone, roundProgressPercentage } = overview
  const isPaused = cycle.status === "PAUSED"
  const isCurrentStudying = Boolean(session?.isActive) && session?.cycleId === cycle.id
  const isLastStep = isLastSubjectOfRound(currentItem, items)
  const lastSubject = getLastSubjectOfRound(items)

  // Determine button label
  let buttonLabel = "Continuar ciclo"
  let buttonIcon = <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
  let buttonAction = handleNavigate

  if (isPaused) {
    buttonLabel = "Retomar ciclo"
    buttonIcon = <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
    buttonAction = handleResumeCycle
  } else if (!currentItem) {
    buttonLabel = "Ver ciclo"
    buttonIcon = <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
    buttonAction = handleNavigate
  } else if (currentItem.studiedMinutesInRound === 0 && !isCurrentStudying) {
    buttonLabel = "Iniciar ciclo"
    buttonIcon = <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
    buttonAction = handleStartStudy
  } else if (isCurrentStudying) {
    buttonLabel = "Estudo em andamento..."
    buttonIcon = <RefreshCcw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
    buttonAction = handleNavigate
  }

  const content = (
    <div className="p-4 space-y-3.5">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground truncate">
              Ciclo {cycle.name}
            </p>
            <p className="text-xs font-black text-foreground truncate">
              {currentRound}ª volta · {roundProgressPercentage}%
              {isPaused && (
                <span className="ml-1.5 text-amber-600 dark:text-amber-400 text-[10px]">
                  PAUSADO
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Edit menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={handleNavigate}
                className="w-full px-3 py-2.5 text-left text-xs font-bold text-foreground hover:bg-muted/50 flex items-center gap-2 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                Editar ciclo
              </button>
              {isPaused ? (
                <button
                  onClick={handleResumeCycle}
                  className="w-full px-3 py-2.5 text-left text-xs font-bold text-foreground hover:bg-muted/50 flex items-center gap-2 transition-colors"
                >
                  <Play className="h-3.5 w-3.5 text-emerald-500" />
                  Retomar ciclo
                </button>
              ) : (
                <button
                  onClick={handlePauseCycle}
                  disabled={isPausing}
                  className="w-full px-3 py-2.5 text-left text-xs font-bold text-foreground hover:bg-muted/50 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Pause className="h-3.5 w-3.5 text-amber-500" />
                  Pausar ciclo
                </button>
              )}
              <div className="border-t border-border" />
              <button
                onClick={handleDeleteCycle}
                disabled={isDeleting}
                className="w-full px-3 py-2.5 text-left text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                Excluir ciclo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3 SUB-CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Card 1: VOLTA ATUAL */}
        <div className="rounded-xl bg-muted/40 border border-border/40 p-3 space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
            Volta Atual
          </p>
          <p className="text-lg font-black text-foreground leading-none">{currentRound}ª</p>
          <p className="text-[11px] font-bold text-muted-foreground">
            {items.length} {items.length === 1 ? "matéria" : "matérias"}
          </p>
          {totalRoundsDone > 0 && (
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              {totalRoundsDone} {totalRoundsDone === 1 ? "volta concluída" : "voltas concluídas"}
            </p>
          )}
        </div>

        {/* Card 2: EM FOCO */}
        <div className={cn(
          "rounded-xl border p-3 space-y-1.5",
          currentItem
            ? "bg-primary/5 border-primary/30"
            : "bg-muted/40 border-border/40"
        )}>
          <p className="text-[9px] font-black uppercase tracking-wider text-primary">
            Em Foco
          </p>
          {currentItem ? (
            <>
              <p className="text-sm font-black text-foreground leading-tight truncate">
                {currentItem.disciplineName}
              </p>
              <p className="text-[11px] font-bold text-muted-foreground">
                {currentItem.studiedMinutesInRound} / {currentItem.plannedMinutes} min
              </p>
              {currentItem.remainingMinutesInRound > 0 && (
                <p className="text-[10px] font-bold text-primary">
                  {currentItem.remainingMinutesInRound} min restantes
                </p>
              )}
              {currentItem.isCompletedInRound && (
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Concluída nesta volta
                </p>
              )}
              {/* Mini progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((currentItem.studiedMinutesInRound / currentItem.plannedMinutes) * 100))}%`,
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground font-medium">Nenhuma matéria</p>
          )}
        </div>

        {/* Card 3: PRÓXIMA */}
        <div className="rounded-xl bg-muted/40 border border-border/40 p-3 space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
            Próxima
          </p>
          {nextItem ? (
            <>
              <p className="text-sm font-black text-foreground leading-tight truncate">
                {nextItem.disciplineName}
              </p>
              <p className="text-[11px] font-bold text-muted-foreground">
                {nextItem.plannedMinutes} min
              </p>
            </>
          ) : isLastStep && lastSubject ? (
            <>
              <p className="text-sm font-black text-foreground leading-tight truncate">
                {lastSubject.disciplineName}
              </p>
              <p className="text-[10px] font-bold text-primary">
                Última etapa da volta
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground font-medium">Sem próxima</p>
          )}
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Progresso da volta
          </span>
          <span className="text-xs font-black text-primary">{roundProgressPercentage}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(roundProgressPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* ROUNDS COMPLETED INFO */}
      {totalRoundsDone > 0 && (
        <p className="text-[11px] font-bold text-muted-foreground text-center">
          {totalRoundsDone} {totalRoundsDone === 1 ? "volta concluída" : "voltas concluídas"}
        </p>
      )}

      {/* SKIP STEP BUTTON (only when in progress) */}
      {currentItem && !isPaused && currentItem.studiedMinutesInRound > 0 && !currentItem.isCompletedInRound && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkipStep}
          disabled={isSkipping}
          className="w-full h-8 text-[11px] font-bold text-muted-foreground hover:text-foreground gap-1.5"
        >
          <SkipForward className="h-3 w-3" />
          Pular etapa atual
        </Button>
      )}

      {/* MAIN BUTTON */}
      <Button
        onClick={buttonAction}
        disabled={isDeleting}
        className={cn(
          "w-full font-black text-xs h-9 shadow-xs",
          isPaused
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "bg-primary hover:bg-primary/90 text-primary-foreground"
        )}
      >
        {buttonIcon}
        {buttonLabel}
      </Button>
    </div>
  )

  if (embedded) return content

  return <Card className="overflow-hidden border shadow-xs">{content}</Card>
}
