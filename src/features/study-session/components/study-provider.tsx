"use client"

import React, { createContext, useContext, useState, useEffect, useRef } from "react"
import type { StudyTechnique } from "@/domain/study-history/study-history.types"
import { Play, Pause, Maximize2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

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

/**
 * Estado persistido da sessão de estudo.
 *
 * FONTE DE VERDADE: startTime + totalPausedMs + lastPauseStartTime
 *
 * activeSeconds e pausedSeconds são SEMPRE calculados a partir dos timestamps,
 * nunca incrementados por contador. O setInterval serve apenas para forçar
 * re-render da UI a cada segundo.
 */
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
  // === TIMESTAMPS (fonte de verdade) ===
  startTime: number | null          // Momento exato de início (Date.now())
  totalPausedMs: number             // Soma de TODAS as pausas em ms
  lastPauseStartTime: number | null // Quando a pausa ATUAL começou (null se não pausado)
  plannedSeconds: number            // Duração planejada para contagem regressiva (0 = livre)
  // === CAMPOS CALCULADOS (não persistidos, recalculados no mount) ===
  activeSeconds: number             // Calculado: (now - startTime - totalPausedMs) / 1000
  pausedSeconds: number             // Calculado: totalPausedMs / 1000 (+ pausa atual se pausado
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

/**
 * Calcula activeSeconds e pausedSeconds a partir dos timestamps.
 * Esta é a ÚNICA fonte de verdade para o tempo.
 */
function calculateTimes(state: StudySessionState): { activeSeconds: number; pausedSeconds: number } {
  if (!state.startTime) return { activeSeconds: 0, pausedSeconds: 0 }

  const now = Date.now()
  const totalElapsedMs = now - state.startTime

  let pausedMs = state.totalPausedMs

  // Se está pausado agora, soma o tempo desde o início da pausa
  if (state.lastPauseStartTime !== null) {
    pausedMs += (now - state.lastPauseStartTime)
  }

  const activeMs = Math.max(0, totalElapsedMs - pausedMs)

  return {
    activeSeconds: Math.floor(activeMs / 1000),
    pausedSeconds: Math.floor(pausedMs / 1000),
  }
}

/**
 * Cria um estado inicial limpo (sem startTime).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createIdleState(): StudySessionState {
  return {
    isActive: false,
    isMinimized: false,
    phase: 'IDLE',
    disciplineName: "",
    disciplineId: undefined,
    topicName: "",
    studyType: "TEORIA",
    technique: "LIVRE",
    notes: "",
    startTime: null,
    totalPausedMs: 0,
    lastPauseStartTime: null,
    plannedSeconds: 0,
    activeSeconds: 0,
    pausedSeconds: 0,
  }
}

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudySessionState | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

// 1. Carregar do localStorage no mount (client-only, para evitar hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StudySessionState
        if (parsed && parsed.isActive && parsed.startTime) {
          // Recalcular activeSeconds e pausedSeconds dos timestamps
          const { activeSeconds, pausedSeconds } = calculateTimes(parsed)
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSession({
            ...parsed,
            activeSeconds,
            pausedSeconds,
            isMinimized: true, // Sobrevive minimizado após F5/troca de página
          })
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2. Tick visual: setInterval que apenas FORÇA re-render a cada segundo
  //    NÃO incrementa contadores — recalcula a partir dos timestamps.
  useEffect(() => {
    if (!session || !session.isActive || session.phase === 'IDLE') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Limpar interval anterior se existir (evita duplicação)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    intervalRef.current = setInterval(() => {
      setSession(prev => {
        if (!prev || !prev.isActive) return prev

        // RECALCULAR a partir dos timestamps — fonte de verdade
        const { activeSeconds, pausedSeconds } = calculateTimes(prev)

        // Só atualiza se houve mudança (evita re-renders desnecessários)
        if (prev.activeSeconds === activeSeconds && prev.pausedSeconds === pausedSeconds) {
          return prev
        }

        return {
          ...prev,
          activeSeconds,
          pausedSeconds,
        }
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.isActive, session?.phase])

  // 3. Persistir no localStorage (apenas campos de timestamp, não os calculados)
  useEffect(() => {
    if (session && session.isActive) {
      // Salvar SEM activeSeconds/pausedSeconds (são recalculados no mount)
      const toPersist = {
        ...session,
        activeSeconds: 0,  // Será recalculado
        pausedSeconds: 0,  // Será recalculado
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [session])

  // 4. Atualizar document.title com o tempo real
  useEffect(() => {
    if (session && session.isActive) {
      const timeStr = formatTime(session.activeSeconds)
      const isStudying = session.phase === 'STUDYING'
      const status = isStudying ? 'Estudando' : 'Pausado'
      const icon = isStudying ? '⏱️' : '⏸️'
      document.title = `${icon} ${timeStr} - ${status}`
    } else {
      document.title = "Mentor Concursos IA"
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.activeSeconds, session?.phase, session?.isActive])

  // === AÇÕES ===

  const startSession = (data: { disciplineName: string; disciplineId?: string; topicName?: string; studyType?: string; technique?: StudyTechnique }) => {
    const technique = data.technique || "LIVRE"
    const plannedSeconds = TECHNIQUE_DURATIONS[technique] || 0
    const now = Date.now()

    const newSession: StudySessionState = {
      isActive: true,
      isMinimized: false,
      phase: 'STUDYING',
      disciplineName: data.disciplineName,
      disciplineId: data.disciplineId,
      topicName: data.topicName || "",
      studyType: data.studyType || "TEORIA",
      technique,
      notes: "",
      startTime: now,          // ← Timestamp exato de início
      totalPausedMs: 0,        // ← Sem pausas acumuladas
      lastPauseStartTime: null, // ← Não está pausado
      plannedSeconds,
      activeSeconds: 0,
      pausedSeconds: 0,
    }
    setSession(newSession)
  }

  const minimizeSession = () => {
    setSession(prev => prev ? { ...prev, isMinimized: true } : null)
  }

  const restoreSession = () => {
    setSession(prev => prev ? { ...prev, isMinimized: false } : null)
  }

  const pauseSession = () => {
    setSession(prev => {
      if (!prev || prev.phase !== 'STUDYING') return prev
      return {
        ...prev,
        phase: 'PAUSED',
        lastPauseStartTime: Date.now(), // ← Registra timestamp exato da pausa
      }
    })
  }

  const resumeSession = () => {
    setSession(prev => {
      if (!prev || prev.phase !== 'PAUSED') return prev
      const now = Date.now()
      const pauseDuration = prev.lastPauseStartTime !== null
        ? (now - prev.lastPauseStartTime)
        : 0

      return {
        ...prev,
        phase: 'STUDYING',
        totalPausedMs: prev.totalPausedMs + pauseDuration, // ← Acumula pausa
        lastPauseStartTime: null,                          // ← Limpa pausa atual
      }
    })
  }

  const endSession = () => {
    setSession(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const updateNotes = (notes: string) => {
    setSession(prev => prev ? { ...prev, notes } : null)
  }

  // === UTILS ===

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return (
    <StudyContext.Provider
      value={{
        session,
        startSession,
        minimizeSession,
        restoreSession,
        pauseSession,
        resumeSession,
        endSession,
        updateNotes,
        formatTime
      }}
    >
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

function FloatingStudyWidget() {
  const { session, restoreSession, pauseSession, resumeSession, endSession, formatTime } = useGlobalStudy()

  if (!session || !session.isMinimized) return null

  const isStudying = session.phase === 'STUDYING'

  return (
    <div className="fixed bottom-20 right-6 z-50 flex items-center gap-3 bg-card border shadow-2xl rounded-2xl px-4 py-3 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          {isStudying && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isStudying ? "bg-emerald-500" : "bg-amber-500"}`}></span>
        </span>
        <div className="font-mono font-black text-sm tracking-tight w-[60px] tabular-nums text-foreground">
          {formatTime(session.activeSeconds)}
        </div>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {isStudying ? "Estudando" : "Pausado"}
        </span>
      </div>

      <div className="flex items-center gap-1 border-l pl-2">
        {isStudying ? (
          <Button size="icon" variant="ghost" onClick={pauseSession} className="w-8 h-8 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10">
            <Pause className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="icon" variant="ghost" onClick={resumeSession} className="w-8 h-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10">
            <Play className="w-4 w-4" />
          </Button>
        )}

        <Button size="icon" variant="ghost" onClick={restoreSession} className="w-8 h-8 text-[#2563EB] hover:text-[#1D4ED8] hover:bg-[#2563EB]/10" title="Restaurar Centro de Estudos">
          <Maximize2 className="w-4 h-4" />
        </Button>

        <Button size="icon" variant="ghost" onClick={endSession} className="w-8 h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" title="Finalizar Sessão">
          <Square className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
