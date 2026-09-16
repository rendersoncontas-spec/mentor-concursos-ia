"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sparkles, Timer, Play, Pause, Minimize2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DisciplinePopover } from "@/features/study-session/components/discipline-popover"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { useDisciplineData } from "@/features/study-session/hooks/use-discipline-data"
import { cn } from "@/lib/utils"

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function StudyDock() {
  const router = useRouter()
  const {
    session,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    resetSession,
    minimizeSession,
    restoreSession,
    isCentralOpen,
  } = useGlobalStudy()
  const { data: disciplineData } = useDisciplineData()

  const [selectedName, setSelectedName] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const cycleCurrent = useMemo(() => {
    const sugg = disciplineData?.suggestions ?? []
    return sugg.find((s) => s.from === "CYCLE" && s.metadata?.isCurrentInCycle) ?? null
  }, [disciplineData])

  const isActive = session?.isActive ?? false
  const phase = session?.phase ?? "IDLE"
  const isMinimized = session?.isMinimized ?? false
  const isQuickSession = isActive && !!session?.disciplineName

  const displayPhase = isQuickSession ? phase : "IDLE"
  const displayDiscipline = isQuickSession ? session?.disciplineName ?? selectedName : selectedName
  const displayTime = isQuickSession ? session?.activeSeconds ?? 0 : 0
  const displayIsMinimized = isQuickSession ? isMinimized : false

  const handleSelect = useCallback((name: string, id: string) => {
    setSelectedName(name)
    setSelectedId(id)
  }, [])

  const handleStart = useCallback(() => {
    if (!selectedName || !selectedId) {
      toast.error("Selecione uma disciplina primeiro.")
      return
    }
    const cycleBlock = cycleCurrent
    const isInCycle = !!cycleBlock
    const sessionData: Parameters<typeof startSession>[0] = {
      disciplineName: selectedName,
      disciplineId: selectedId,
      studyType: "TEORIA",
      technique: "LIVRE",
    }
    if (isInCycle) {
      sessionData.plannedSeconds = cycleBlock.metadata?.plannedMinutes ? cycleBlock.metadata.plannedMinutes * 60 : 0
      sessionData.source = "CYCLE"
    }
    const result = startSession(sessionData)
    if (!result.started) {
      toast.error("Já existe uma sessão ativa. Retome, salve ou encerre antes de iniciar outra.")
    }
  }, [selectedName, selectedId, startSession, cycleCurrent])

  const handlePause = useCallback(() => {
    pauseSession()
  }, [pauseSession])

  const handleResume = useCallback(() => {
    resumeSession()
  }, [resumeSession])

  const handleCancel = useCallback(() => {
    endSession()
    setSelectedName("")
    setSelectedId(null)
    toast.info("Sessão cancelada.")
  }, [endSession])

  const handleOpenCentral = useCallback(() => {
    if (isActive && displayIsMinimized) {
      restoreSession()
      return
    }
    if (isCentralOpen) {
      return
    }
    if (isActive && !displayIsMinimized) {
      return
    }
    window.dispatchEvent(new CustomEvent("open-study-session-modal"))
  }, [isActive, displayIsMinimized, isCentralOpen, restoreSession])

  const handleSave = useCallback(() => {
    if (session?.disciplineName && session?.disciplineId) {
      pauseSession()
      router.push(`/dashboard/study-session?disciplineId=${session.disciplineId}`)
    }
  }, [pauseSession, session, router])

  if (!mounted) {
    return (
      <div className="h-16 animate-pulse bg-muted/50 rounded-xl border border-border/50" />
    )
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-all duration-200">
      {displayPhase === "STUDYING" || displayPhase === "PAUSED" ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {displayPhase === "STUDYING" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2.5 w-2.5",
                    displayPhase === "STUDYING" ? "bg-emerald-500" : "bg-amber-500"
                  )}
                />
              </span>
              <span className="font-mono font-black text-base text-foreground tabular-nums">
                {formatTimer(displayTime)}
              </span>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {displayPhase === "STUDYING" ? "Estudando" : "Pausado"}
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold text-primary bg-primary/10 rounded-full border border-primary/20">
              {displayDiscipline}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {displayPhase === "STUDYING" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePause}
                className="h-9 px-3 text-xs font-bold gap-1.5"
              >
                <Pause className="h-3.5 w-3.5" />
                Pausar
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResume}
                  className="h-9 px-3 text-xs font-bold gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Continuar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="h-9 px-3 text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Timer className="h-3 w-3" />
                  Salvar
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenCentral}
              className="h-9 px-3 text-xs font-bold gap-1.5 relative"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Central</span>
              {isActive && displayIsMinimized && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-background" />
                </span>
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={resetSession}
              className="h-9 px-2 text-xs font-bold text-muted-foreground hover:text-destructive"
              title="Reiniciar"
              aria-label="Reiniciar estudo"
            >
              <Minimize2 className="h-3.5 w-3.5 rotate-90" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-9 px-2 text-xs font-bold text-muted-foreground hover:text-destructive"
              title="Cancelar"
              aria-label="Cancelar estudo"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <DisciplinePopover
              value={selectedName}
              onSelect={handleSelect}
              placeholder="Escolha ou busque uma matéria..."
              className="w-full h-9 text-sm font-semibold"
            />
          </div>

          <Button
            onClick={handleStart}
            disabled={!selectedName || !selectedId}
            className={cn(
              "h-9 px-6 text-sm font-black uppercase tracking-wider gap-2 shadow-md transition-all shrink-0",
              selectedName && selectedId
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Play className="h-4 w-4 fill-current" />
            <span>Iniciar</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenCentral}
            className="h-9 px-4 text-sm font-bold gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Central Inteligente</span>
            {isActive && displayIsMinimized && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-background" />
              </span>
            )}
          </Button>
        </div>
      )}

      {cycleCurrent && (
        <div className="mt-2.5 pt-2.5 border-t border-border/50">
          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-muted-foreground/80">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-foreground/70 shrink-0 uppercase tracking-tight">
                Próximo no ciclo:
              </span>
              <span className="truncate font-medium text-foreground/90">
                {cycleCurrent.name}
              </span>
              <span className="shrink-0 font-mono text-[9px] bg-muted/50 px-1.5 py-0.5 rounded-md border border-border/40">
                {cycleCurrent.metadata?.studiedMinutes ?? 0}/
                {cycleCurrent.metadata?.plannedMinutes ?? 0} min
              </span>
              {cycleCurrent.metadata?.plannedMinutes != null && (
                <span className="shrink-0 italic">
                  • faltam {Math.max(0, cycleCurrent.metadata.plannedMinutes - (cycleCurrent.metadata.studiedMinutes ?? 0))} min
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}