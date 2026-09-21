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
} from "lucide-react"
import { toast } from "sonner"

import {
  activateCycleAction,
  deleteCycleAction,
  pauseCycleAction,
  skipCycleCurrentItemAction,
  getActiveCycleAction,
} from "@/application/study-cycle/study-cycle.actions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CycleOverview, CycleItemProgress } from "@/domain/study-cycle/study-cycle.types"
import { useStudyActions } from "@/features/study-session/components/study-provider"
import { useCachedServerAction } from "@/hooks/use-cached-server-action"
import { cn } from "@/lib/utils"

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
  const { startSession, resumeSession, sessionSummary } = useStudyActions()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isPausing, setIsPausing] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: overview, loading: isLoading, refresh } = useCachedServerAction<CycleOverview | null>(
    "activeCycleOverview",
    () => getActiveCycleAction(),
    2 * 60 * 1000, // 2 min — dados mudam quando usuário estuda
  )

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
        refresh()
      } else {
        toast.error("Erro ao pausar ciclo.")
      }
    } finally {
      setIsPausing(false)
      setIsMenuOpen(false)
    }
  }, [overview, refresh])

  const handleResumeCycle = useCallback(async () => {
    if (!overview) return
    const res = await activateCycleAction(overview.cycle.id)
    if (res.success) {
      toast.success("Ciclo retomado!")
      refresh()
    } else {
      toast.error("Erro ao retomar ciclo.")
    }
  }, [overview, refresh])

  const handleDeleteCycle = useCallback(async () => {
    if (!overview) return
    setIsDeleting(true)
    try {
      const res = await deleteCycleAction(overview.cycle.id)
      if (res.success) {
        toast.success("Ciclo excluído.")
        refresh()
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
        refresh()
      } else {
        toast.error("Erro ao pular etapa.")
      }
    } finally {
      setIsSkipping(false)
    }
  }, [overview, refresh])

  const handleStartStudy = useCallback(() => {
    if (!overview?.currentItem || !overview.cycle) return false
    const result = startSession({
      disciplineName: overview.currentItem.disciplineName,
      disciplineId: overview.currentItem.disciplineId,
      studyType: "TEORIA",
      plannedSeconds: Math.max(1, overview.currentItem.remainingMinutesInRound) * 60,
      source: "CYCLE",
      cycleId: overview.cycle.id,
      cycleItemId: overview.currentItem.itemId,
    })
    if (!result.started) {
      toast.error("Já existe uma sessão ativa. Retome, salve ou encerre antes de iniciar outra.")
      return false
    }
    toast.success(`Estudo do ciclo iniciado: ${overview.currentItem.disciplineName}`)
    return true
  }, [overview, startSession])

  const handleNavigate = useCallback(() => {
    router.push("/ciclos")
  }, [router])

  // "Continuar ciclo" (botão padrão do widget quando já há progresso na etapa
  // atual, ou quando a sessão do ciclo já está ativa): NUNCA deve navegar
  // para /ciclos — só deve dar play no cronômetro, reutilizando o MESMO
  // startSession/resumeSession de sempre (mesmo source=CYCLE/cycleId/
  // cycleItemId/disciplineId — handleStartStudy acima, sem lógica paralela).
  // Não abre a Central de Estudos (pedido explícito): o usuário só quer ver
  // o cronômetro rodando, igual ao fluxo já validado de "Iniciar ciclo".
  const handleContinueCycle = useCallback(() => {
    if (!overview?.currentItem || !overview.cycle) return

    // Já existe uma sessão ativa PARA ESTE CICLO — nunca criar uma segunda.
    const isThisCycleActive =
      Boolean(sessionSummary?.isActive) && sessionSummary?.cycleId === overview.cycle.id

    if (isThisCycleActive) {
      // Só dá play se estiver pausada; se já está tocando, não faz nada.
      if (sessionSummary?.phase === "PAUSED") {
        resumeSession()
      }
      return
    }

    // Nenhuma sessão ativa para este ciclo: inicia (ou, se houver progresso
    // parcial, retoma a partir do tempo restante — handleStartStudy já usa
    // remainingMinutesInRound). Se já existir uma sessão ativa de OUTRO
    // ciclo/disciplina, handleStartStudy recusa e avisa via toast (evita
    // duplicidade) — comportamento existente, intocado.
    handleStartStudy()
  }, [overview, sessionSummary, handleStartStudy, resumeSession])

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
  const isCurrentStudying = Boolean(sessionSummary?.isActive) && sessionSummary?.cycleId === cycle.id
  const isLastStep = isLastSubjectOfRound(currentItem, items)
  const lastSubject = getLastSubjectOfRound(items)

  // Determine button label
  let buttonLabel = "Continuar ciclo"
  let buttonIcon = <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
  let buttonAction = handleContinueCycle

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
    buttonAction = handleContinueCycle
  }

  const content = (
    <div className="p-2.5 space-y-2">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-foreground truncate leading-tight">
              Ciclo {cycle.name}
            </p>
            <p className="text-[11px] font-bold text-muted-foreground truncate leading-tight">
              {currentRound}ª volta · {items.length} {items.length === 1 ? "matéria" : "matérias"} · {roundProgressPercentage}%
              {isPaused && (
                <span className="ml-1.5 text-amber-600 dark:text-amber-400">
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
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <MoreVertical className="h-3.5 w-3.5" />
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

      {/* CURRENT SUBJECT — FULL WIDTH */}
      <div className={cn(
        "rounded-lg border px-2.5 py-2 space-y-1",
        currentItem
          ? "bg-primary/5 border-primary/30"
          : "bg-muted/40 border-border/40"
      )}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-primary leading-none">
            Agora
          </span>
          {currentItem && (
            <>
              <span className="text-[11px] font-bold text-muted-foreground">
                Etapa {(cycle.current_item_index || 0) + 1}/{items.length}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                {currentItem.difficulty}
              </span>
              <span className="ml-auto text-[11px] font-black text-foreground whitespace-nowrap">
                Meta {currentItem.plannedMinutes} min
              </span>
            </>
          )}
        </div>
        {currentItem ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-base font-black text-foreground leading-tight" title={currentItem.disciplineName}>
                {currentItem.disciplineName}
              </p>
              <span className="text-[11px] font-black text-foreground whitespace-nowrap shrink-0">
                {Math.round(currentItem.studiedMinutesInRound)}/{currentItem.plannedMinutes} min
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((currentItem.studiedMinutesInRound / Math.max(1, currentItem.plannedMinutes)) * 100))}%`,
                  }}
                />
              </div>
              <span className="text-[10px] font-black text-primary shrink-0 whitespace-nowrap">
                {Math.min(100, Math.round((currentItem.studiedMinutesInRound / Math.max(1, currentItem.plannedMinutes)) * 100))}%
                {" · "}
                {currentItem.remainingMinutesInRound > 0
                  ? `Faltam ${Math.round(currentItem.remainingMinutesInRound)} min`
                  : "Meta atingida!"}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground font-medium">Nenhuma matéria em foco</p>
        )}
      </div>

      {/* NEXT — COMPACT ROW */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border/40 px-2.5 py-1.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">
          Próxima
        </span>
        {nextItem ? (
          <p className="truncate text-xs font-bold text-foreground leading-tight">
            {nextItem.disciplineName}
            <span className="font-semibold text-muted-foreground">
              {" "}· Meta {nextItem.plannedMinutes} min
              {nextItem.studiedMinutesInRound > 0 && (
                <span className="text-primary"> · {Math.round(nextItem.studiedMinutesInRound)}/{nextItem.plannedMinutes}</span>
              )}
            </span>
          </p>
        ) : isLastStep && lastSubject ? (
          <p className="truncate text-xs font-bold text-foreground leading-tight">
            {lastSubject.disciplineName}
            <span className="text-primary"> · Última etapa da volta</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground font-medium">Sem próxima</p>
        )}
      </div>

      {/* ROUND PROGRESS + START */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0">
              Progresso da volta
            </span>
            <span className="text-[10px] font-black text-primary shrink-0">
              {roundProgressPercentage}%
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(roundProgressPercentage, 100)}%` }}
            />
          </div>
        </div>
        <Button
          onClick={buttonAction}
          disabled={isDeleting}
          className={cn(
            "h-8 w-[132px] shrink-0 font-black text-xs whitespace-nowrap shadow-xs px-2",
            isPaused
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          )}
        >
          {buttonIcon}
          {buttonLabel}
        </Button>
      </div>
    </div>
  )

  if (embedded) return content

  return <Card className="overflow-hidden border shadow-xs">{content}</Card>
}
