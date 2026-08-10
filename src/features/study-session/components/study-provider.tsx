"use client"

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react"
import type { StudyTechnique } from "@/domain/study-history/study-history.types"
import { Play, Pause, Maximize2, Square, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
const POSITION_KEY = "mentor-study-floating-timer-position"
const SIDEBAR_WIDTH = 256
const MARGIN = 20

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

function getDefaultPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 200, y: 20 }
  const sidebar = window.innerWidth >= 768 ? SIDEBAR_WIDTH : 0
  const contentWidth = window.innerWidth - sidebar
  const x = sidebar + (contentWidth / 2)
  return { x: Math.max(x, sidebar + MARGIN), y: MARGIN }
}

function loadSavedPosition(): { x: number; y: number } | null {
  try {
    const saved = localStorage.getItem(POSITION_KEY)
    if (!saved) return null
    const pos = JSON.parse(saved) as { x: number; y: number }
    const vw = typeof window !== "undefined" ? window.innerWidth : 1920
    const vh = typeof window !== "undefined" ? window.innerHeight : 1080
    pos.x = Math.max(0, Math.min(pos.x, vw - 50))
    pos.y = Math.max(0, Math.min(pos.y, vh - 50))
    return pos
  } catch {
    return null
  }
}

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudySessionState | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StudySessionState
        if (parsed && parsed.isActive && parsed.startTime) {
          const { activeSeconds, pausedSeconds } = calculateTimes(parsed)
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSession({ ...parsed, activeSeconds, pausedSeconds, isMinimized: true })
}
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
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

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return (
    <StudyContext.Provider value={{ session, startSession, minimizeSession, restoreSession, pauseSession, resumeSession, endSession, updateNotes, formatTime }}>
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
  const { session, restoreSession, pauseSession, resumeSession, endSession, formatTime } = useGlobalStudy()

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
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
    if (pos === null) {
      const saved = loadSavedPosition()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos(saved || getDefaultPosition())
    }
  }, [pos])

  // Handlers de arraste com Pointer Events
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!pos) return
    const target = e.target as HTMLElement
    // Não arrastar se clicou em um botão ou ícone
    if (target.closest("button")) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.preventDefault()
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.moved && Math.abs(dx) + Math.abs(dy) < 5) return
    dragRef.current.moved = true

    const vw = window.innerWidth
    const vh = window.innerHeight
    const newX = Math.max(0, Math.min(dragRef.current.startPosX + dx, vw - 50))
    const newY = Math.max(0, Math.min(dragRef.current.startPosY + dy, vh - 50))
    setPos({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (dragRef.current?.moved && pos) {
      localStorage.setItem(POSITION_KEY, JSON.stringify(pos))
    }
    dragRef.current = null
  }, [pos])

  const handleResetPosition = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const def = getDefaultPosition()
    setPos(def)
    localStorage.removeItem(POSITION_KEY)
  }, [])

  if (!session || !session.isMinimized) return null

  const isStudying = session.phase === 'STUDYING'

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={pos ? { left: pos.x, top: pos.y, position: "fixed" } : { left: 0, top: 0, position: "fixed", visibility: "hidden" }}
      className={cn(
        "z-[60] flex items-center gap-2 sm:gap-3 bg-card/95 backdrop-blur-md border shadow-2xl rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3",
        "select-none touch-none cursor-grab active:cursor-grabbing",
        "transition-opacity duration-200",
        "animate-in fade-in zoom-in-95 duration-300"
      )}
    >
      {/* Indicador de Status */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-none">
        <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0">
          {isStudying && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3", isStudying ? "bg-emerald-500" : "bg-amber-500")} />
        </span>
        <div className="font-mono font-black text-sm sm:text-base tracking-tight tabular-nums text-foreground min-w-[65px]">
          {formatTime(session.activeSeconds)}
        </div>
        <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:inline">
          {isStudying ? "Estudando" : "Pausado"}
        </span>
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center gap-0.5 sm:gap-1 border-l pl-1.5 sm:pl-2">
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

        <Button size="icon" variant="ghost" onClick={endSession} className="w-7 h-7 sm:w-8 sm:h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Finalizar Sessão">
          <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
        </Button>
      </div>
    </div>
  )
}