"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  Pause,
  Play,
  Square,
  Timer,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { StudyCycleBlock } from "@/features/planejamento/components/planning-view"
import { DisciplinePopover } from "@/features/study-session/components/discipline-popover"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { useDisciplineData } from "@/features/study-session/hooks/use-discipline-data"
import { cn } from "@/lib/utils"

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

interface QuickStartBarProps {
  cycleBlocks?: StudyCycleBlock[] | undefined
  onOpenModal?: (disciplineName: string, disciplineId: string, timeSeconds: number) => void
}

export function QuickStartBar({ onOpenModal }: QuickStartBarProps) {
  const { session, startSession, pauseSession, resumeSession, endSession } = useGlobalStudy()
  const { data: disciplineData } = useDisciplineData()

  const [selectedName, setSelectedName] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const cycleCurrent = useMemo(() => {
    const sugg = disciplineData?.suggestions ?? []
    return sugg.find((s) => s.from === "CYCLE" && s.metadata?.isCurrentInCycle) ?? null
  }, [disciplineData])

  // If there's an active session from the global timer, sync with it
  const isActive = session?.isActive ?? false
  const phase = session?.phase ?? "IDLE"
  const isQuickSession = isActive && session?.source === null && !!session?.disciplineName
  const displayPhase = isQuickSession ? phase : "IDLE"
  const displayDiscipline = isQuickSession ? session?.disciplineName ?? selectedName : selectedName
  const displayTime = isQuickSession ? session?.activeSeconds ?? 0 : 0

  const handleSelect = useCallback((name: string, id: string) => {
    setSelectedName(name)
    setSelectedId(id)
  }, [])

  const handleStart = useCallback(() => {
    if (!selectedName || !selectedId) {
      toast.error("Selecione uma disciplina primeiro.")
      return
    }
    startSession({
      disciplineName: selectedName,
      disciplineId: selectedId,
      studyType: "TEORIA",
      technique: "LIVRE",
    })
  }, [selectedName, selectedId, startSession])

  const handlePause = useCallback(() => {
    pauseSession()
  }, [pauseSession])

  const handleResume = useCallback(() => {
    resumeSession()
  }, [resumeSession])

  const handleSave = useCallback(() => {
    pauseSession()
    if (session?.disciplineName && session?.disciplineId) {
      onOpenModal?.(session.disciplineName, session.disciplineId, session.activeSeconds)
    }
  }, [pauseSession, session, onOpenModal])

  const handleCancel = useCallback(() => {
    setShowCancelConfirm(true)
  }, [])

  const confirmCancel = useCallback(() => {
    endSession()
    setSelectedName("")
    setSelectedId(null)
    setShowCancelConfirm(false)
    toast.info("Sessão cancelada.")
  }, [endSession])

  // If there's an active session running (from any source), don't show QuickStartBar
  if (isActive && !isQuickSession) return null

  // ── CANCEL CONFIRMATION DIALOG ──────────────────────────────────
  if (showCancelConfirm) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
        <p className="text-sm font-bold text-foreground mb-1">Cancelar este estudo?</p>
        <p className="text-xs text-muted-foreground mb-3">
          Todo o tempo desta sessão será descartado.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCancelConfirm(false)}
            className="flex-1 h-8 text-xs font-bold"
          >
            Continuar estudando
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={confirmCancel}
            className="flex-1 h-8 text-xs font-bold"
          >
            Cancelar estudo
          </Button>
        </div>
      </div>
    )
  }

  // ── RUNNING / PAUSED STATE ──────────────────────────────────────
  if (displayPhase === "STUDYING" || displayPhase === "PAUSED") {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        {/* Discipline name */}
        <p className="text-sm font-bold text-foreground truncate mb-1.5">{displayDiscipline}</p>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Timer */}
          <div className="flex items-center gap-1.5 font-mono text-lg font-black text-primary tabular-nums">
            <Timer className="h-4 w-4 shrink-0" />
            {formatTimer(displayTime)}
          </div>

          <div className="flex-1" />

          {/* Controls */}
          {displayPhase === "STUDYING" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePause}
              className="h-8 px-3 text-xs font-bold gap-1.5"
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
                className="h-8 px-3 text-xs font-bold gap-1.5"
              >
                <Play className="h-3.5 w-3.5" />
                Continuar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="h-8 px-3 text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Square className="h-3 w-3" />
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                className="h-8 px-2 text-xs font-bold text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── READY STATE ─────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <DisciplinePopover
            value={selectedName}
            onSelect={handleSelect}
            placeholder="Escolha ou busque uma matéria"
            className="w-full h-10 text-xs sm:text-sm font-semibold"
          />
        </div>

        <Button
          onClick={handleStart}
          disabled={!selectedName || !selectedId}
          className={cn(
            "h-10 px-6 text-xs font-black uppercase tracking-wider gap-2 shadow-md transition-all shrink-0",
            selectedName && selectedId
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          Iniciar
        </Button>
      </div>

      {cycleCurrent && (
        <div className="mt-2.5 px-1 flex items-center gap-2 text-[10px] sm:text-[11px] text-muted-foreground/80">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-bold text-foreground/70 shrink-0 uppercase tracking-tight">
              Próximo estudo:
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
      )}
    </div>
  )
}
