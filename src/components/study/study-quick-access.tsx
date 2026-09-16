"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles, Play } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DisciplinePopover } from "@/features/study-session/components/discipline-popover"
import { useGlobalStudy } from "@/features/study-session/components/study-provider"
import { useDisciplineData } from "@/features/study-session/hooks/use-discipline-data"
import { cn } from "@/lib/utils"

export function StudyQuickAccess() {
  const router = useRouter()
  const {
    session,
    startSession,
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

  const cycleCurrent = disciplineData?.suggestions?.find(
    (s) => s.from === "CYCLE" && s.metadata?.isCurrentInCycle
  ) ?? null

  const isActive = session?.isActive ?? false
  const isMinimized = session?.isMinimized ?? false
  const isQuickSession = isActive && !!session?.disciplineName

  const hasActiveCentralSession = isQuickSession
  const isCentralMinimized = hasActiveCentralSession && isMinimized

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
      sessionData.plannedSeconds = cycleCurrent.metadata?.plannedMinutes ? cycleCurrent.metadata.plannedMinutes * 60 : 0
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

  if (!mounted) {
    return (
      <div className="h-12 animate-pulse bg-muted/50 rounded-xl border border-border/50 flex items-center px-3 gap-2" />
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
        <div className="flex-1 min-w-0">
          <DisciplinePopover
            value={selectedName}
            onSelect={handleSelect}
            placeholder="Escolha ou busque uma matéria..."
            className="w-full h-10 text-sm font-semibold"
          />
        </div>

        <Button
          onClick={handleStart}
          disabled={!selectedName || !selectedId}
          className={cn(
            "h-10 px-5 text-sm font-black uppercase tracking-wider gap-2 shadow-md transition-all shrink-0",
            selectedName && selectedId
              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Play className="h-4 w-4 fill-current" />
          <span className="hidden sm:inline">Iniciar</span>
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={handleOpenCentral}
              className={cn(
                "h-10 w-10 rounded-xl relative transition-all",
                hasActiveCentralSession && isCentralMinimized
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/20"
                  : "bg-muted hover:bg-accent/50 border-border/60",
              )}
              aria-label="Central Inteligente"
            >
              <Sparkles className="h-5 w-5" />
              {hasActiveCentralSession && isCentralMinimized && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-background" />
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            {hasActiveCentralSession && isCentralMinimized
              ? "Central Inteligente — sessão ativa (clique para restaurar)"
              : "Central Inteligente"}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}