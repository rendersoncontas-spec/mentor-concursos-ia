import { useState, useEffect, useRef, useCallback } from "react"
import { StudyTechnique } from "@/domain/study-history/study-history.types"

type TimerPhase = 'IDLE' | 'STUDYING' | 'PAUSED' | 'SHORT_BREAK' | 'LONG_BREAK'

interface UseStudyTimerProps {
  technique: StudyTechnique
  onPhaseChange?: (phase: TimerPhase) => void
  onCycleComplete?: (cycleCount: number) => void
}

export function useStudyTimer({ technique, onPhaseChange, onCycleComplete }: UseStudyTimerProps) {
  const [phase, setPhase] = useState<TimerPhase>('IDLE')
  
  const [activeSeconds, setActiveSeconds] = useState(0)
  const [pausedSeconds, setPausedSeconds] = useState(0)
  
  const [techniqueCountdown, setTechniqueCountdown] = useState<number | null>(null) // Para pomodoros
  const [completedCycles, setCompletedCycles] = useState(0)

  const activeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pausedIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Configurações de técnica
  const getTechniqueSettings = useCallback((t: StudyTechnique) => {
    switch (t) {
      case 'POMODORO_25_5': return { study: 25 * 60, shortBreak: 5 * 60, longBreak: 15 * 60, cyclesBeforeLong: 4 }
      case 'POMODORO_50_10': return { study: 50 * 60, shortBreak: 10 * 60, longBreak: 30 * 60, cyclesBeforeLong: 3 }
      case 'DEEP_WORK': return { study: 90 * 60, shortBreak: 15 * 60, longBreak: 30 * 60, cyclesBeforeLong: 2 }
      default: return null // LIVRE, FLOWTIME, PERSONALIZADO
    }
  }, [])

  const startTimer = useCallback(() => {
    if (phase === 'IDLE' || phase === 'PAUSED') {
      setPhase('STUDYING')
      onPhaseChange?.('STUDYING')
      
      const settings = getTechniqueSettings(technique)
      if (settings && phase === 'IDLE') {
        setTechniqueCountdown(settings.study)
      }
    } else if (phase === 'SHORT_BREAK' || phase === 'LONG_BREAK') {
      // Retornando do break
      setPhase('STUDYING')
      onPhaseChange?.('STUDYING')
      const settings = getTechniqueSettings(technique)
      if (settings) setTechniqueCountdown(settings.study)
    }
  }, [phase, technique, getTechniqueSettings, onPhaseChange])

  const pauseTimer = useCallback(() => {
    if (phase === 'STUDYING') {
      setPhase('PAUSED')
      onPhaseChange?.('PAUSED')
    }
  }, [phase, onPhaseChange])

  const resetTimer = useCallback(() => {
    setPhase('IDLE')
    setActiveSeconds(0)
    setPausedSeconds(0)
    setTechniqueCountdown(null)
    setCompletedCycles(0)
    onPhaseChange?.('IDLE')
  }, [onPhaseChange])

  // Lógica principal de tick (1 segundo)
  useEffect(() => {
    // Clear both intervals initially to prevent multiple running
    if (activeIntervalRef.current) clearInterval(activeIntervalRef.current)
    if (pausedIntervalRef.current) clearInterval(pausedIntervalRef.current)

    if (phase === 'STUDYING' || phase === 'SHORT_BREAK' || phase === 'LONG_BREAK') {
      activeIntervalRef.current = setInterval(() => {
        if (phase === 'STUDYING') {
          setActiveSeconds(s => s + 1)
        }
        
        // Handle countdown for techniques
        setTechniqueCountdown(prev => {
          if (prev === null) return null
          if (prev <= 1) {
            // Tempo acabou!
            const settings = getTechniqueSettings(technique)
            if (!settings) return null
            
            if (phase === 'STUDYING') {
              const newCycles = completedCycles + 1
              setCompletedCycles(newCycles)
              onCycleComplete?.(newCycles)
              
              if (newCycles % settings.cyclesBeforeLong === 0) {
                setPhase('LONG_BREAK')
                onPhaseChange?.('LONG_BREAK')
                return settings.longBreak
              } else {
                setPhase('SHORT_BREAK')
                onPhaseChange?.('SHORT_BREAK')
                return settings.shortBreak
              }
            } else {
              // Fim do break -> Pausado esperando usuário clicar em iniciar o próximo ciclo
              setPhase('PAUSED')
              onPhaseChange?.('PAUSED')
              return settings.study // Prepara pro próximo
            }
          }
          return prev - 1
        })
      }, 1000)
    } else if (phase === 'PAUSED') {
      pausedIntervalRef.current = setInterval(() => {
        setPausedSeconds(s => s + 1)
      }, 1000)
    }

    return () => {
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current)
      if (pausedIntervalRef.current) clearInterval(pausedIntervalRef.current)
    }
  }, [phase, technique, completedCycles, getTechniqueSettings, onPhaseChange, onCycleComplete])

  // Mudar técnica limpa o countdown se estava rodando
  useEffect(() => {
    if (phase === 'IDLE') {
      const settings = getTechniqueSettings(technique)
      setTechniqueCountdown(settings ? settings.study : null)
    }
  }, [technique, phase, getTechniqueSettings])

  const focusPercentage = activeSeconds + pausedSeconds > 0 
    ? Math.round((activeSeconds / (activeSeconds + pausedSeconds)) * 100) 
    : 0

  return {
    phase,
    activeSeconds,
    pausedSeconds,
    techniqueCountdown,
    completedCycles,
    focusPercentage,
    startTimer,
    pauseTimer,
    resetTimer,
    setPhase
  }
}
