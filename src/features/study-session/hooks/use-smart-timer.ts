"use client"

import { useState, useEffect, useRef, useCallback } from "react"

export interface TimerState {
  planId: string | null
  sessionId: string | null
  startTime: number | null
  totalPausedTime: number
  lastPauseStartTime: number | null
  isRunning: boolean
  focusInitial: number
  energyInitial: number
}

const STORAGE_KEY = "mentor:study_session_state"
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000
const initialState: TimerState = {
  planId: null, sessionId: null, startTime: null, totalPausedTime: 0,
  lastPauseStartTime: null, isRunning: false, focusInitial: 3, energyInitial: 3,
}

function loadTimerState(): TimerState {
  if (typeof window === "undefined") return initialState
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return initialState
    const parsed = JSON.parse(stored) as TimerState
    return parsed.startTime && (parsed.isRunning || parsed.lastPauseStartTime) ? parsed : initialState
  } catch (error) {
    console.error("Failed to parse timer state", error)
    return initialState
  }
}

function getElapsedMs(state: TimerState, now: number): number {
  if (!state.startTime) return 0
  const currentPause = state.lastPauseStartTime ? now - state.lastPauseStartTime : 0
  return Math.max(0, now - state.startTime - state.totalPausedTime - currentPause)
}

export function useSmartTimer(plannedMinutes = 0) {
  const [state, setState] = useState(loadTimerState)
  const [elapsedMs, setElapsedMs] = useState(() => getElapsedMs(loadTimerState(), Date.now()))
  const [hasRecovered, setHasRecovered] = useState(() => loadTimerState().startTime !== null)
  const [inactivityWarning, setInactivityWarning] = useState(false)
  const lastActivityRef = useRef<number | null>(null)

  const pauseTimer = useCallback(() => {
    setState(previous => previous.isRunning
      ? { ...previous, isRunning: false, lastPauseStartTime: Date.now() }
      : previous)
  }, [])

  useEffect(() => {
    if (!state.startTime) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!state.isRunning || !state.startTime) return
    const updateTick = () => {
      const now = Date.now()
      setElapsedMs(getElapsedMs(state, now))
      if (lastActivityRef.current !== null && now - lastActivityRef.current > INACTIVITY_LIMIT_MS) {
        pauseTimer()
        setInactivityWarning(true)
      }
    }
    const intervalId = setInterval(updateTick, 1000)
    return () => clearInterval(intervalId)
  }, [pauseTimer, state])

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
    const now = Date.now()
    setState({ planId, sessionId, startTime: now, totalPausedTime: 0, lastPauseStartTime: null, isRunning: true, focusInitial: focus, energyInitial: energy })
    setElapsedMs(0)
    lastActivityRef.current = now
  }, [])

  const resumeTimer = useCallback(() => {
    const now = Date.now()
    setState(previous => {
      if (previous.isRunning) return previous
      const pauseDuration = previous.lastPauseStartTime ? now - previous.lastPauseStartTime : 0
      return { ...previous, isRunning: true, totalPausedTime: previous.totalPausedTime + pauseDuration, lastPauseStartTime: null }
    })
    setInactivityWarning(false)
    lastActivityRef.current = now
  }, [])

  const clearTimer = useCallback(() => {
    setState(initialState)
    setElapsedMs(0)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  const remainingMs = plannedMinutes > 0 ? Math.max(0, plannedMinutes * 60 * 1000 - elapsedMs) : 0
  const isCountdown = plannedMinutes > 0
  const displayMs = isCountdown ? remainingMs : elapsedMs

  return { state, elapsedMs, remainingMs, formattedTime: formatTime(displayMs), formattedElapsedTime: formatTime(elapsedMs), formattedRemainingTime: formatTime(remainingMs), elapsedMinutes: Math.floor(elapsedMs / 60000), remainingMinutes: Math.ceil(remainingMs / 60000), hasRecovered, inactivityWarning, isCountdown, isFinished: isCountdown && remainingMs <= 0, startTimer, pauseTimer, resumeTimer, clearTimer, setHasRecovered, setInactivityWarning }
}
