"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { StudyTechnique } from "@/domain/study-history/study-history.types"
import { Play, Pause, RotateCcw, Maximize2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

type TimerPhase = 'IDLE' | 'STUDYING' | 'PAUSED' | 'SHORT_BREAK' | 'LONG_BREAK'

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
  activeSeconds: number
  pausedSeconds: number
  lastUpdated: number
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

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudySessionState | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_active_study_session")
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          return null
        }
      }
    }
    return null
  })

  // Timer tick baseado em timestamp real
  useEffect(() => {
    if (!session || !session.isActive || session.phase === 'IDLE') return

    const interval = setInterval(() => {
      setSession(prev => {
        if (!prev || !prev.isActive) return prev
        const now = Date.now()
        const elapsedSinceLast = Math.floor((now - prev.lastUpdated) / 1000)
        
        if (elapsedSinceLast <= 0) return prev

        if (prev.phase === 'STUDYING') {
          return {
            ...prev,
            activeSeconds: prev.activeSeconds + elapsedSinceLast,
            lastUpdated: now
          }
        } else if (prev.phase === 'PAUSED') {
          return {
            ...prev,
            pausedSeconds: prev.pausedSeconds + elapsedSinceLast,
            lastUpdated: now
          }
        }
        return prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [session?.isActive, session?.phase])

  // Persistir no localStorage
  useEffect(() => {
    if (session && session.isActive) {
      localStorage.setItem("mentor_active_study_session", JSON.stringify(session))
    } else {
      localStorage.removeItem("mentor_active_study_session")
    }
  }, [session])

  const startSession = (data: { disciplineName: string; disciplineId?: string; topicName?: string; studyType?: string; technique?: StudyTechnique }) => {
    const newSession: StudySessionState = {
      isActive: true,
      isMinimized: false,
      phase: 'STUDYING',
      disciplineName: data.disciplineName,
      disciplineId: data.disciplineId,
      topicName: data.topicName || "",
      studyType: data.studyType || "TEORIA",
      technique: data.technique || "LIVRE",
      notes: "",
      startTime: Date.now(),
      activeSeconds: 0,
      pausedSeconds: 0,
      lastUpdated: Date.now()
    }
    setSession(newSession)
  }

  const minimizeSession = () => {
    setSession(prev => prev ? { ...prev, isMinimized: true, lastUpdated: Date.now() } : null)
  }

  const restoreSession = () => {
    setSession(prev => prev ? { ...prev, isMinimized: false, lastUpdated: Date.now() } : null)
  }

  const pauseSession = () => {
    setSession(prev => prev ? { ...prev, phase: 'PAUSED', lastUpdated: Date.now() } : null)
  }

  const resumeSession = () => {
    setSession(prev => prev ? { ...prev, phase: 'STUDYING', lastUpdated: Date.now() } : null)
  }

  const endSession = () => {
    setSession(null)
    localStorage.removeItem("mentor_active_study_session")
  }

  const updateNotes = (notes: string) => {
    setSession(prev => prev ? { ...prev, notes } : null)
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  // Atualiza título da aba
  useEffect(() => {
    // Atualização direta do document.title baseada na sessão ativa
    if (session && session.isActive) {
      const timeStr = formatTime(session.activeSeconds)
      const isStudying = session.phase === 'STUDYING'
      const status = isStudying ? 'Estudando' : 'Pausado'
      const icon = isStudying ? '⏱️' : '⏸️'
      document.title = `${icon} ${timeStr} - ${status}`
    } else {
      document.title = "Mentor Concursos IA"
    }
  }, [session?.activeSeconds, session?.phase, session?.isActive])

  return (
    <StudyContext.Provider value={{
      session,
      startSession,
      minimizeSession,
      restoreSession,
      pauseSession,
      resumeSession,
      endSession,
      updateNotes,
      formatTime
    }}>
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
            <Play className="w-4 h-4" />
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
