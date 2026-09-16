"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCcw,
  Save,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useDisciplineData } from "@/features/study-session/hooks/use-discipline-data"
import { DisciplinePopover } from "@/features/study-session/components/discipline-popover"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { cn } from "@/lib/utils"

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function StudyHeaderControl() {
  const {
    session,
    startSession,
    pauseSession,
    resumeSession,
    resetSession,
    minimizeSession,
    restoreSession,
    isCentralOpen,
    setIsCentralOpen,
  } = useGlobalStudy()
  const { data: disciplineData } = useDisciplineData()

  const [mounted, setMounted] = useState(false)
  const [selectedName, setSelectedName] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isActive = session?.isActive ?? false
  const isMinimized = session?.isMinimized ?? false
  const phase = session?.phase ?? "IDLE"
  const isStudying = phase === "STUDYING"
  const isPaused = phase === "PAUSED"

  const displayTime = isActive ? session?.activeSeconds ?? 0 : 0
  const displayDiscipline = session?.disciplineName ?? ""

  const hasActiveCentralSession = isActive
  const isCentralMinimized = hasActiveCentralSession && isMinimized

  const cycleCurrent = (disciplineData?.suggestions ?? []).find(
    (s) => s.from === "CYCLE" && s.metadata?.isCurrentInCycle,
  ) ?? null

  const handleSelect = useCallback((name: string, id: string) => {
    setSelectedName(name)
    setSelectedId(id)
  }, [])

  const handleStart = useCallback(() => {
    if (!selectedName || !selectedId) {
      toast.error("Selecione uma disciplina primeiro.")
      return
    }
    const isInCycle = !!cycleCurrent
    const sessionData: Parameters<typeof startSession>[0] = {
      disciplineName: selectedName,
      disciplineId: selectedId,
      studyType: "TEORIA",
      technique: "LIVRE",
    }
    if (isInCycle) {
      sessionData.plannedSeconds = cycleCurrent.metadata?.plannedMinutes
        ? cycleCurrent.metadata.plannedMinutes * 60
        : 0
      sessionData.source = "CYCLE"
    }
    const result = startSession(sessionData)
    if (!result.started) {
      toast.error("Já existe uma sessão ativa. Retome, salve ou encerre antes de iniciar outra.")
    }
  }, [selectedName, selectedId, startSession, cycleCurrent])

  const handleOpenCentral = useCallback(() => {
    if (hasActiveCentralSession && isCentralMinimized) {
      restoreSession()
      return
    }
    if (isCentralOpen) {
      return
    }
    if (hasActiveCentralSession && !isCentralMinimized) {
      return
    }
    window.dispatchEvent(new CustomEvent("open-study-session-modal"))
  }, [hasActiveCentralSession, isCentralMinimized, isCentralOpen, restoreSession])

  const handleMinimizeOrRestore = useCallback(() => {
    if (isCentralOpen) {
      minimizeSession()
      setIsCentralOpen(false)
      window.dispatchEvent(new CustomEvent("close-study-session-modal"))
    } else if (hasActiveCentralSession && isCentralMinimized) {
      restoreSession()
    } else {
      window.dispatchEvent(new CustomEvent("open-study-session-modal"))
    }
  }, [isCentralOpen, hasActiveCentralSession, isCentralMinimized, minimizeSession, restoreSession, setIsCentralOpen])

  const handleSave = useCallback(() => {
    pauseSession()
    if (hasActiveCentralSession && isCentralMinimized) {
      restoreSession()
      return
    }
    if (isCentralOpen) {
      return
    }
    window.dispatchEvent(new CustomEvent("open-study-session-modal"))
  }, [pauseSession, hasActiveCentralSession, isCentralMinimized, isCentralOpen, restoreSession])

  if (!mounted) {
    return (
      <div className="h-9 w-[280px] max-w-[40vw] animate-pulse rounded-xl border border-border/50 bg-muted/50" />
    )
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-1.5 h-9 min-w-0 max-w-[420px] transition-all duration-200">
        {!hasActiveCentralSession ? (
          <>
            <div className="flex-1 min-w-0 max-w-[240px]">
              <DisciplinePopover
                value={selectedName}
                onSelect={handleSelect}
                placeholder="Escolha ou busque uma matéria"
                className="h-7 w-full border-0 bg-transparent text-xs font-semibold shadow-none hover:bg-muted/50"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={handleStart}
                  disabled={!selectedName || !selectedId}
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-lg",
                    selectedName && selectedId
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-label="Iniciar estudo"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center">Iniciar estudo</TooltipContent>
            </Tooltip>
            <div className="h-5 w-px shrink-0 bg-border/60" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleOpenCentral}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  aria-label="Central Inteligente"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center">Central Inteligente</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleOpenCentral}
              className="flex min-w-0 items-center gap-1.5 text-left"
              aria-label="Central Inteligente — sessão ativa (clique para restaurar)"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                {isStudying && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    isStudying ? "bg-emerald-500" : isPaused ? "bg-amber-500" : "bg-muted",
                  )}
                />
              </span>
              <span className="font-mono font-black text-sm text-foreground tabular-nums whitespace-nowrap">
                {formatTimer(displayTime)}
              </span>
              <span className="text-[11px] font-medium text-foreground/80 whitespace-nowrap hidden sm:inline">
                {isStudying ? "Estudando" : isPaused ? "Pausado" : "Parado"}
              </span>
              {displayDiscipline && (
                <span className="text-[11px] font-medium text-foreground/70 truncate max-w-[140px] hidden md:inline-block">
                  • {displayDiscipline}
                </span>
              )}
            </button>

            <div className="h-5 w-px shrink-0 bg-muted/30" />

            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  {isStudying ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={pauseSession}
                      className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                      aria-label="Pausar estudo"
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={resumeSession}
                      className="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                      aria-label="Continuar estudo"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center">
                  {isStudying ? "Pausar estudo" : "Continuar estudo"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleMinimizeOrRestore}
                    className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                    aria-label={isCentralOpen ? "Minimizar Central" : "Restaurar Central"}
                  >
                    {isCentralOpen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center">
                  {isCentralOpen ? "Minimizar Central" : "Restaurar Central"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetSession}
                    className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                    aria-label="Reiniciar cronômetro"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center">Reiniciar cronômetro</TooltipContent>
              </Tooltip>

              <div className="mx-0.5 h-5 w-px shrink-0 bg-border/60" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSave}
                    className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                    aria-label="Salvar estudo"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center">Salvar estudo</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
