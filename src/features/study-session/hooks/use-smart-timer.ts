"use client"

import { useState, useEffect, useRef, useCallback } from "react"

export interface TimerState {
  planId: string | null
  sessionId: string | null
  startTime: number | null
  totalPausedTime: number // Em milissegundos
  lastPauseStartTime: number | null
  isRunning: boolean
  focusInitial: number
  energyInitial: number
}

const STORAGE_KEY = "mentor:study_session_state"
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000 // 15 minutos

export function useSmartTimer(plannedMinutes: number = 0) {
  const [state, setState] = useState<TimerState>({
    planId: null,
    sessionId: null,
    startTime: null,
    totalPausedTime: 0,
    lastPauseStartTime: null,
    isRunning: false,
    focusInitial: 3,
    energyInitial: 3,
  })
  
  const [elapsedMs, setElapsedMs] = useState(0)
  const [hasRecovered, setHasRecovered] = useState(false)
  const [inactivityWarning, setInactivityWarning] = useState(false)
  
  // Tempo restante para contagem regressiva (ms)
  const remainingMs = plannedMinutes > 0 ? Math.max(0, plannedMinutes * 60 * 1000 - elapsedMs) : 0
  
  const lastActivityRef = useRef<number>(Date.now())
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // 1. Carrega do localStorage ao montar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as TimerState
        if (parsed.startTime && (parsed.isRunning || parsed.lastPauseStartTime)) {
          setState(parsed)
          setHasRecovered(true)
        }
      } catch (e) {
        console.error("Failed to parse timer state", e)
      }
    }
  }, [])

  // 2. Auto-save para o localStorage e cálculo do tick
  useEffect(() => {
    if (state.startTime) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }

    let intervalId: NodeJS.Timeout | null = null

    if (state.isRunning && state.startTime) {
      const updateTick = () => {
        // Cálculo Resiliente
        const now = Date.now()
        const currentElapsed = now - state.startTime! - state.totalPausedTime
        setElapsedMs(Math.max(0, currentElapsed))

        // Verificação de Inatividade
        if (now - lastActivityRef.current > INACTIVITY_LIMIT_MS) {
          pauseTimer() // Auto-pause
          setInactivityWarning(true)
        }
      }

      updateTick() // Força re-render imediato
      intervalId = setInterval(updateTick, 1000)
    } else if (!state.isRunning && state.startTime) {
      // Atualiza a tela mesmo pausado
      const pauseDuration = state.lastPauseStartTime ? Date.now() - state.lastPauseStartTime : 0
      const currentElapsed = Date.now() - state.startTime - state.totalPausedTime - pauseDuration
      setElapsedMs(Math.max(0, currentElapsed))
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [state])

  // Listener global de inatividade
  useEffect(() => {
    const handleActivity = () => { lastActivityRef.current = Date.now() }
    window.addEventListener("mousemove", handleActivity)
    window.addEventListener("keydown", handleActivity)
    window.addEventListener("click", handleActivity)
    return () => {
      window.removeEventListener("mousemove", handleActivity)
      window.removeEventListener("keydown", handleActivity)
      window.removeEventListener("click", handleActivity)
    }
  }, [])

  const startTimer = useCallback((sessionId: string, planId: string | null, focus: number, energy: number) => {
    setState({
      planId,
      sessionId,
      startTime: Date.now(),
      totalPausedTime: 0,
      lastPauseStartTime: null,
      isRunning: true,
      focusInitial: focus,
      energyInitial: energy
    })
    lastActivityRef.current = Date.now()
  }, [])

  const pauseTimer = useCallback(() => {
    setState(prev => {
      if (!prev.isRunning) return prev
      return {
        ...prev,
        isRunning: false,
        lastPauseStartTime: Date.now()
      }
    })
  }, [])

  const resumeTimer = useCallback(() => {
    setState(prev => {
      if (prev.isRunning) return prev
      const pauseDuration = prev.lastPauseStartTime ? Date.now() - prev.lastPauseStartTime : 0
      return {
        ...prev,
        isRunning: true,
        totalPausedTime: prev.totalPausedTime + pauseDuration,
        lastPauseStartTime: null
      }
    })
    setInactivityWarning(false)
    lastActivityRef.current = Date.now()
  }, [])

  const clearTimer = useCallback(() => {
    setState({
      planId: null,
      sessionId: null,
      startTime: null,
      totalPausedTime: 0,
      lastPauseStartTime: null,
      isRunning: false,
      focusInitial: 3,
      energyInitial: 3,
    })
    setElapsedMs(0)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  // Contagem regressiva se plannedMinutes > 0, senão progressiva
  const isCountdown = plannedMinutes > 0
  const displayMs = isCountdown ? remainingMs : elapsedMs
  
  return {
    state,
    elapsedMs,
    remainingMs,
    formattedTime: formatTime(displayMs),
    formattedElapsedTime: formatTime(elapsedMs),
    formattedRemainingTime: formatTime(remainingMs),
    elapsedMinutes: Math.floor(elapsedMs / 60000),
    remainingMinutes: Math.ceil(remainingMs / 60000),
    hasRecovered,
    inactivityWarning,
    isCountdown,
    isFinished: isCountdown && remainingMs <= 0,
    startTimer,
    pauseTimer,
    resumeTimer,
    clearTimer,
    setHasRecovered,
    setInactivityWarning
  }
}
