"use client"

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react"
import type { StudyTechnique } from "@/domain/study-history/study-history.types"
import { Play, Pause, Maximize2, Square, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { saveStudySessionAction } from "@/application/study-session/study-session.action"

type TimerPhase = 'IDLE' | 'STUDYING' | 'PAUSED' | 'SHORT_BREAK' | 'LONG_BREAK'

const TECHNIQUE_DURATIONS: Record<StudyTechnique, number> = {
  LIVRE: 0,
  POMODORO_25_5: 25 * 60,
  POMODORO_50_10: 50 * 60,
  FLOWTIME: 0,
  DEEP_WORK: 90 * 60,
  PERSONALIZADO: 0,
} as const

const STORAGE_KEY = "mentor_active_study_session"
const POSITION_KEY = "mentor-study-floating-timer-position-v2"
const FLOATING_TIMER_PREF_KEY = "mentor-floating-timer-enabled"

interface StudySessionState {
  isActive: boolean
  isMinimized: boolean
  phase: TimerPhase
  disciplineName: string
  disciplineId: string | undefined
  topicName: string
  studyType: string
  technique: StudyTechnique
  notes: string
  startTime: number | null
  totalPausedMs: number
  lastPauseStartTime: number | null
  plannedSeconds: number
  activeSeconds: number
  pausedSeconds: number
}

interface StudyContextType {
  session: StudySessionState | null
  startSession: (data: { disciplineName: string; disciplineId?: string; topicName?: string; studyType?: string; technique?: StudyTechnique }) => void
  minimizeSession: () => void
  restoreSession: () => void
  pauseSession: () => void
  resumeSession: () => void
  endSession: () => void
  updateNotes: (notes: string) => void
  formatTime: (seconds: number) => string
  floatingTimerEnabled: boolean
  toggleFloatingTimer: () => void
  finalizeAndSaveSession: (formData?: Record<string, unknown>) => Promise<{ success: boolean; error?: string; historyId?: string }>
  isCentralOpen: boolean
  setIsCentralOpen: (open: boolean) => void
}

const StudyContext = createContext<StudyContextType | null>(null)

function calculateTimes(state: StudySessionState): { activeSeconds: number; pausedSeconds: number } {
  if (!state.startTime) return { activeSeconds: 0, pausedSeconds: 0 }
  const now = Date.now()
  const totalElapsedMs = now - state.startTime
  let pausedMs = state.totalPausedMs
  if (state.lastPauseStartTime !== null) {
    pausedMs += (now - state.lastPauseStartTime)
  }
  const activeMs = Math.max(0, totalElapsedMs - pausedMs)
  return {
    activeSeconds: Math.floor(activeMs / 1000),
    pausedSeconds: Math.floor(pausedMs / 1000),
  }
}

// Posição padrão do balão: centralizado horizontalmente no viewport
interface Position {
  x: number
  y: number
}

function getDefaultPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 10 }
  const floatingWidth = 220
  const x = Math.max(0, (window.innerWidth - floatingWidth) / 2)
  const y = 10
  return { x, y }
}

function loadSavedPosition(): Position | null {
  try {
    const saved = localStorage.getItem(POSITION_KEY)
    if (!saved) return null
    const pos = JSON.parse(saved) as { x: number; y: number }
    if (typeof window !== "undefined") {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const floatingWidth = 220
      const floatingHeight = 60
      // Garantir que a posição salva seja válida dentro da viewport
      pos.x = Math.max(0, Math.min(pos.x, vw - floatingWidth))
      pos.y = Math.max(0, Math.min(pos.y, vh - floatingHeight))
    }
    return { x: pos.x, y: pos.y }
  } catch {
    return null
  }
}

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudySessionState | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return null
      const parsed = JSON.parse(saved) as StudySessionState
      if (!parsed.isActive || !parsed.startTime) return null
      const { activeSeconds, pausedSeconds } = calculateTimes(parsed)
      return { ...parsed, activeSeconds, pausedSeconds, isMinimized: true }
    } catch (error) {
      console.error("[STUDY_PROVIDER] Parse error:", error)
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
  })
  const [floatingTimerEnabled, setFloatingTimerEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    const saved = localStorage.getItem(FLOATING_TIMER_PREF_KEY)
    return saved === null ? true : JSON.parse(saved) as boolean
  })
  const [isCentralOpen, setIsCentralOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Escutar eventos globais para abrir/fechar a Central
  useEffect(() => {
    const handleOpenCentral = () => setIsCentralOpen(true)
    const handleCloseCentral = () => setIsCentralOpen(false)
    const handleStudyCenterOpened = () => setIsCentralOpen(true)

    window.addEventListener("open-study-session-modal", handleOpenCentral)
    window.addEventListener("close-study-session-modal", handleCloseCentral)
    window.addEventListener("study-center-opened", handleStudyCenterOpened)

    return () => {
      window.removeEventListener("open-study-session-modal", handleOpenCentral)
      window.removeEventListener("close-study-session-modal", handleCloseCentral)
      window.removeEventListener("study-center-opened", handleStudyCenterOpened)
    }
  }, [])

  useEffect(() => {
    if (!session || !session.isActive || session.phase === 'IDLE') {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setSession(prev => {
        if (!prev || !prev.isActive) return prev
        const { activeSeconds, pausedSeconds } = calculateTimes(prev)
        if (prev.activeSeconds === activeSeconds && prev.pausedSeconds === pausedSeconds) return prev
        return { ...prev, activeSeconds, pausedSeconds }
      })
    }, 1000)
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.isActive, session?.phase])

  useEffect(() => {
    if (session && session.isActive) {
      const { activeSeconds, pausedSeconds, ...rest } = session
      void activeSeconds; void pausedSeconds
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, activeSeconds: 0, pausedSeconds: 0 }))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [session])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return
      setSession(prev => {
        if (!prev || !prev.isActive) return prev
        const { activeSeconds, pausedSeconds } = calculateTimes(prev)
        if (prev.activeSeconds === activeSeconds && prev.pausedSeconds === pausedSeconds) return prev
        return { ...prev, activeSeconds, pausedSeconds }
      })
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  useEffect(() => {
    if (session && session.isActive) {
      const timeStr = formatTime(session.activeSeconds)
      const isStudying = session.phase === 'STUDYING'
      document.title = `${isStudying ? '⏱️' : '⏸️'} ${timeStr} - ${isStudying ? 'Estudando' : 'Pausado'}`
    } else {
      document.title = "Mentor Concursos IA"
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.activeSeconds, session?.phase, session?.isActive])

  const startSession = useCallback((data: { disciplineName: string; disciplineId?: string; topicName?: string; studyType?: string; technique?: StudyTechnique }) => {
    const technique = data.technique || "LIVRE"
    const now = Date.now()
    setSession({
      isActive: true, isMinimized: false, phase: 'STUDYING',
      disciplineName: data.disciplineName, disciplineId: data.disciplineId,
      topicName: data.topicName || "", studyType: data.studyType || "TEORIA",
      technique, notes: "", startTime: now, totalPausedMs: 0,
      lastPauseStartTime: null, plannedSeconds: TECHNIQUE_DURATIONS[technique] || 0,
      activeSeconds: 0, pausedSeconds: 0,
    })
  }, [])

  const minimizeSession = useCallback(() => {
    setSession(prev => prev ? { ...prev, isMinimized: true } : null)
  }, [])

  const restoreSession = useCallback(() => {
    setSession(prev => prev ? { ...prev, isMinimized: false } : null)
    // Dispara evento para reabrir a Central Inteligente
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("restore-study-session"))
    }
  }, [])

  const pauseSession = useCallback(() => {
    setSession(prev => {
      if (!prev || prev.phase !== 'STUDYING') return prev
      return { ...prev, phase: 'PAUSED', lastPauseStartTime: Date.now() }
    })
  }, [])

  const resumeSession = useCallback(() => {
    setSession(prev => {
      if (!prev || prev.phase !== 'PAUSED') return prev
      const pauseDuration = prev.lastPauseStartTime !== null ? (Date.now() - prev.lastPauseStartTime) : 0
      return { ...prev, phase: 'STUDYING', totalPausedMs: prev.totalPausedMs + pauseDuration, lastPauseStartTime: null }
    })
  }, [])

  const endSession = useCallback(() => {
    setSession(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const updateNotes = useCallback((notes: string) => {
    setSession(prev => prev ? { ...prev, notes } : null)
  }, [])

  const finalizeAndSaveSession = useCallback(async (formData?: Record<string, unknown>) => {
    if (!session) return { success: false, error: "Nenhuma sessão ativa" }
    
    // Capturar snapshot ANTES de qualquer alteração
    const snapshot = {
      // Timestamps para cálculo server-side
      sessionStartTime: session.startTime,
      sessionTotalPausedMs: session.totalPausedMs,
      sessionLastPauseStartTime: session.lastPauseStartTime,
      is_manual_mode: false,
      // Dados que o saveStudySessionAction espera
      discipline_id: session.disciplineId,
      discipline_name: session.disciplineName,
      topic_name: session.topicName,
      studyType: session.studyType,
      technique: session.technique,
      notes: session.notes,
      // Form data fields
      pages_read: formData?.["pages_read"] || 0,
      questions_answered: formData?.["questions_answered"] || 0,
      questions_correct: formData?.["questions_correct"] || 0,
      flashcards_reviewed: formData?.["flashcards_reviewed"] || 0,
      flashcards_correct: formData?.["flashcards_correct"] || 0,
      audio_name: formData?.["audio_name"] || null,
      audio_author: formData?.["audio_author"] || null,
      audio_platform: formData?.["audio_platform"] || null,
      audio_speed: formData?.["audio_speed"] || null,
      audio_url: formData?.["audio_url"] || null,
      // Tempo calculado
      activeSeconds: session.activeSeconds,
      pausedSeconds: session.pausedSeconds,
      activeMinutes: Math.floor(session.activeSeconds / 60),
      pausedMinutes: Math.floor(session.pausedSeconds / 60),
      focusPercentage: session.activeSeconds + session.pausedSeconds > 0 
        ? Math.round((session.activeSeconds / (session.activeSeconds + session.pausedSeconds)) * 100) 
        : 0,
      completedCycles: 0,
    }

    const res = await saveStudySessionAction(snapshot)

    if (!res.success) {
      console.error("[FINALIZE] Falha ao salvar:", res.error)
      return { success: false, error: res.error || "Erro ao salvar sessão" }
    }

    // Só limpar sessão APÓS sucesso confirmado
    setSession(null)
    localStorage.removeItem(STORAGE_KEY)
    
    return { success: true, historyId: res.historyId }
  }, [session])

  const toggleFloatingTimer = useCallback(() => {
    setFloatingTimerEnabled(prev => {
      const next = !prev
      localStorage.setItem(FLOATING_TIMER_PREF_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return (
    <StudyContext.Provider value={{ session, startSession, minimizeSession, restoreSession, pauseSession, resumeSession, endSession, updateNotes, formatTime, floatingTimerEnabled, toggleFloatingTimer, finalizeAndSaveSession, isCentralOpen, setIsCentralOpen }}>
      {children}
      <FloatingStudyWidget />
    </StudyContext.Provider>
  )
}

export function useGlobalStudy() {
  const context = useContext(StudyContext)
  if (!context) throw new Error("useGlobalStudy must be used within StudyProvider")
  return context
}

/* ═══════════════════════════════════════════════════════════════
   FLOATING STUDY WIDGET — Mini cronômetro arrastável e persistido
   ═══════════════════════════════════════════════════════════════ */
function FloatingStudyWidget() {
  const { session, restoreSession, pauseSession, resumeSession, formatTime, floatingTimerEnabled, isCentralOpen } = useGlobalStudy()

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    startPosX: number
    startPosY: number
    moved: boolean
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Carregar posição salva no mount (client-only)
  useEffect(() => {
    if (pos === null && !isDragging) {
      const saved = loadSavedPosition()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos(saved || getDefaultPosition())
    }
  }, [pos, isDragging])

  // Handlers de arraste com Pointer Events
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (pos === null) return
    const target = e.target as HTMLElement
    // Não arrastar se clicou em um botão ou ícone
    if (target.closest("button")) return
    e.preventDefault()
    // Se ainda não foi arrastado, usar posição padrão como base
    const startX = pos.x ?? e.clientX
    const startY = pos.y ?? e.clientY
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: startX, startPosY: startY, moved: false }
    setIsDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.preventDefault()
    setIsDragging(true)
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && Math.abs(dx) + Math.abs(dy) < 5) return
    dragRef.current.moved = true

    const vw = window.innerWidth
    const vh = window.innerHeight
    const floatingWidth = 220
    const floatingHeight = 60
    const newX = Math.max(0, Math.min(dragRef.current.startPosX + dx, vw - floatingWidth))
    const newY = Math.max(0, Math.min(dragRef.current.startPosY + dy, vh - floatingHeight))
    setPos({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (dragRef.current?.moved && pos) {
      localStorage.setItem(POSITION_KEY, JSON.stringify(pos))
    }
    dragRef.current = null
    setIsDragging(false)
  }, [pos])

  const handleResetPosition = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    localStorage.removeItem(POSITION_KEY)
    setPos(null) // Isso forçará o uso da posição padrão (centralizada)
  }, [])

  if (!session || !session.isMinimized || !floatingTimerEnabled || isCentralOpen) return null

  const isStudying = session.phase === 'STUDYING'

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "fixed",
        top: pos === null ? "10px" : `${pos.y}px`,
        left: pos === null ? "50%" : `${pos.x}px`,
        transform: pos === null ? "translateX(-50%)" : "none",
        zIndex: 9999
      }}
className={cn(
           "z-[60] flex items-center gap-1 bg-card/95 backdrop-blur-md border rounded-2xl px-2 sm:px-2 py-1 sm:py-1",
           "select-none touch-none cursor-grab active:cursor-grabbing",
           "transition-opacity duration-150",
           "animate-in fade-in zoom-in-95 duration-300"
         )}
    >
{/* Indicador de Status */}
       <div className="flex items-center gap-1 pointer-events-none">
         <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0">
           {isStudying && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
           <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3", isStudying ? "bg-emerald-500" : "bg-amber-500")} />
         </span>
         <div className="font-mono font-black text-sm sm:text-base text-foreground">
           {formatTime(session.activeSeconds)}
         </div>
         <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">
           {isStudying ? "Estudando" : "Pausado"}
         </span>
       </div>

{/* Botões de Ação */}
       <div className="flex items-center gap-0.5 border-l pl-1">
        {isStudying ? (
          <Button size="icon" variant="ghost" onClick={pauseSession} className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10">
            <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        ) : (
          <Button size="icon" variant="ghost" onClick={resumeSession} className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10">
            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        )}

        <Button size="icon" variant="ghost" onClick={restoreSession} className="w-7 h-7 sm:w-8 sm:h-8 text-[#2563EB] hover:text-[#1D4ED8] hover:bg-[#2563EB]/10" title="Restaurar Central">
          <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Button>

        <Button size="icon" variant="ghost" onClick={handleResetPosition} className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground hover:text-foreground hover:bg-muted" title="Voltar à posição original">
          <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </Button>

        <Button size="icon" variant="ghost" onClick={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("open-study-session-modal"))
          }
        }} className="w-7 h-7 sm:w-8 sm:h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Abrir Central Inteligente">
          <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
        </Button>
      </div>
    </div>
  )
}