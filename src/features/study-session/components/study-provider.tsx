"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import * as Sentry from "@sentry/nextjs"

import type { StudyTechnique } from "@/domain/study-history/study-history.types"
import {
  getClientUserId,
  migrateLegacyActiveSession,
  offlineStore,
  saveStudySessionWithOfflineSupport,
  syncPendingStudySessions,
} from "@/infrastructure/offline"

import { dispatchStudySessionQueued, type SavedStudySession } from "../lib/study-session-events"
import {
  createStudySessionSyncTriggersInstaller,
  createTriggerStudySessionSync,
} from "../lib/study-session-sync-bridge"

import { type FocusSoundId, useFocusSound } from "../hooks/use-focus-sound"
import { ResetTimerDialog } from "./reset-timer-dialog"

/**
 * Fase C, itens 7-8 — wiring de produção do worker de sincronização.
 * Fica AQUI (e não em `study-session-sync-bridge.ts`) porque
 * `syncPendingStudySessions` vem do barrel `@/infrastructure/offline`, que
 * importa a Server Action real `saveStudySessionAction` ("use server") — um
 * módulo que trava a suíte de testes fora do runtime do Next quando
 * importado estaticamente (ver comentário no topo de `study-session-sync-
 * bridge.ts`). Os testes da ponte usam só as fábricas `create*`, nunca este
 * módulo (StudyProvider), então nunca disparam esse import perigoso.
 */
const triggerStudySessionSync = createTriggerStudySessionSync(syncPendingStudySessions)
const initStudySessionSyncTriggers = createStudySessionSyncTriggersInstaller(triggerStudySessionSync)

type TimerPhase = "IDLE" | "STUDYING" | "PAUSED" | "SHORT_BREAK" | "LONG_BREAK"

const TECHNIQUE_DURATIONS: Record<StudyTechnique, number> = {
  LIVRE: 0,
  POMODORO_25_5: 25 * 60,
  POMODORO_50_10: 50 * 60,
  FLOWTIME: 0,
  DEEP_WORK: 90 * 60,
  PERSONALIZADO: 0,
} as const

const FLOATING_TIMER_PREF_KEY = "mentor-floating-timer-enabled"
const DEFAULT_TITLE = "Nomeia — Sua preparação rumo à nomeação"

/** Formato do título da guia: "MM:SS" e "H:MM:SS" acima de 1 hora. */
function formatTitleTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

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
  /** Vínculo com o bloco do planejamento (study_plan_items.id), quando a sessão veio do Cronograma. */
  planItemId: string | null
  /** Origem da sessão: "PLAN" (Cronograma), "CYCLE" (Ciclo) ou "FREE" (Central/Livre). */
  source: "PLAN" | "FREE" | "CYCLE" | null
  /** Vínculo com o ciclo de estudo ativo. */
  cycleId?: string | null | undefined
  cycleItemId?: string | null | undefined
}

interface StudyContextType {
  session: StudySessionState | null
  startSession: (data: {
    disciplineName: string
    disciplineId?: string | null
    topicName?: string | null
    studyType?: string
    technique?: StudyTechnique
    plannedSeconds?: number
    planItemId?: string | null
    source?: "PLAN" | "FREE" | "CYCLE" | null
    cycleId?: string | null
    cycleItemId?: string | null
    force?: boolean
  }) => { started: boolean; reason?: "active-session-exists" }
  /** Sessão ativa existente (para guarda anti-sobrescrita silenciosa). */
  hasActiveSession: boolean
  minimizeSession: () => void
  restoreSession: () => void
  unminimizeSession: () => void
  /** Zera APENAS a sessão atual ainda não salva. Não toca no Histórico. */
  resetSession: () => void
  pauseSession: () => void
  resumeSession: () => void
  endSession: () => void
  updateNotes: (notes: string) => void
  updatePlannedSeconds: (seconds: number) => void
  formatTime: (seconds: number) => string
  floatingTimerEnabled: boolean
  toggleFloatingTimer: () => void
  finalizeAndSaveSession: (formData?: Record<string, unknown>) => Promise<{
    success: boolean
    error?: string | undefined
    historyId?: string | undefined
    session?: Record<string, unknown> | undefined
    /** true quando o estudo foi salvo localmente e está aguardando conexão para sincronizar (Fase C). */
    pending?: true | undefined
  }>
  isCentralOpen: boolean
  setIsCentralOpen: (open: boolean) => void
  focusSound: FocusSoundId
  focusSoundVolume: number
  focusSoundIsPlaying: boolean
  focusSoundActiveLabel: string | null
  selectFocusSound: (sound: FocusSoundId) => void
  changeFocusSoundVolume: (vol: number) => void
}

/**
 * StudyContextType é mantido como a "view" combinada, devolvida por
 * useGlobalStudy() para 100% de compatibilidade com o código existente.
 * Internamente, o estado é dividido em dois contextos (Fase 2 — otimização
 * de re-renders do StudyContext):
 *  - StudyLiveContext: só o que muda a cada segundo (session, formatTime).
 *  - StudyActionsContext: ações e flags estáveis + um resumo memoizado da
 *    sessão (sessionSummary), que só troca de referência quando algo
 *    relevante muda de fato (início/pausa/fim/minimizar/restaurar/trocar
 *    disciplina ou ciclo) — nunca a cada tick do cronômetro.
 * Componentes que só precisam de ações/flags (ex.: FloatingActionButton,
 * os widgets de ciclo) devem usar useStudyActions() em
 * vez de useGlobalStudy(), para não re-renderizar a cada segundo durante
 * uma sessão ativa.
 */
export interface StudySessionSummary {
  isActive: boolean
  isMinimized: boolean
  phase: TimerPhase
  disciplineName: string
  disciplineId: string | undefined
  source: "PLAN" | "FREE" | "CYCLE" | null
  planItemId: string | null
  cycleId?: string | null | undefined
  cycleItemId?: string | null | undefined
}

interface StudyLiveContextType {
  session: StudySessionState | null
  formatTime: (seconds: number) => string
}

export interface StudyActionsContextType {
  hasActiveSession: boolean
  sessionSummary: StudySessionSummary | null
  startSession: StudyContextType["startSession"]
  minimizeSession: () => void
  restoreSession: () => void
  unminimizeSession: () => void
  resetSession: () => void
  pauseSession: () => void
  resumeSession: () => void
  endSession: () => void
  updateNotes: (notes: string) => void
  updatePlannedSeconds: (seconds: number) => void
  floatingTimerEnabled: boolean
  toggleFloatingTimer: () => void
  finalizeAndSaveSession: StudyContextType["finalizeAndSaveSession"]
  isCentralOpen: boolean
  setIsCentralOpen: (open: boolean) => void
  focusSound: FocusSoundId
  focusSoundVolume: number
  focusSoundIsPlaying: boolean
  focusSoundActiveLabel: string | null
  selectFocusSound: (sound: FocusSoundId) => void
  changeFocusSoundVolume: (vol: number) => void
}

const StudyLiveContext = createContext<StudyLiveContextType | null>(null)
const StudyActionsContext = createContext<StudyActionsContextType | null>(null)

/** Campos de tempo usados pelos cálculos — comuns à sessão em memória e ao snapshot do IndexedDB. */
type SessionTiming = Pick<StudySessionState, "startTime" | "totalPausedMs" | "lastPauseStartTime">

function totalPausedMsAt(state: SessionTiming, now: number): number {
  let pausedMs = state.totalPausedMs
  if (state.lastPauseStartTime !== null) {
    pausedMs += now - state.lastPauseStartTime
  }
  return pausedMs
}

/**
 * FONTE ÚNICA DE VERDADE do tempo ativo da sessão (em segundos).
 * Usado pelo cronômetro visual, widget flutuante, título da guia e salvamento.
 * Calculado sempre a partir de timestamps reais (Date.now()):
 *   elapsed = now - startTime - totalPaused - pausaAtual
 * Nunca incrementa por +1.
 */
export function getActiveElapsedSeconds(state: StudySessionState): number {
  if (!state.startTime) return 0
  const now = Date.now()
  const pausedMs = totalPausedMsAt(state, now)
  return Math.max(0, Math.floor((now - state.startTime - pausedMs) / 1000))
}

function calculateTimes(state: SessionTiming): {
  activeSeconds: number
  pausedSeconds: number
} {
  if (!state.startTime) return { activeSeconds: 0, pausedSeconds: 0 }
  const now = Date.now()
  const pausedMs = totalPausedMsAt(state, now)
  const activeMs = Math.max(0, now - state.startTime - pausedMs)
  return {
    activeSeconds: Math.floor(activeMs / 1000),
    pausedSeconds: Math.floor(pausedMs / 1000),
  }
}

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StudySessionState | null>(null)
  const [floatingTimerEnabled, setFloatingTimerEnabled] = useState(true)
  const [isCentralOpen, setIsCentralOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fase B (offline-first): userId do cliente, usado para namespacear a
  // sessão ativa no IndexedDB (nunca via rede — ver getClientUserId). `userId`
  // (estado) dispara o efeito de inscrição entre abas quando resolve;
  // `userIdRef` dá leitura síncrona dentro de callbacks (mesmo padrão de
  // `sessionRef` logo abaixo).
  const [userId, setUserId] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const focusSound = useFocusSound()

  // Restaurar sessão e preferências do localStorage SOMENTE após a hidratação,
  // para o servidor e o cliente renderizarem o mesmo HTML (evita hydration mismatch).
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resolvedUserId = await getClientUserId()
          if (cancelled) return
          setUserId(resolvedUserId)
          if (resolvedUserId) {
            // Migração única do snapshot legado (localStorage -> IndexedDB).
            // Se não houver nada a migrar (caso comum), é um no-op barato.
            await migrateLegacyActiveSession(resolvedUserId)
            const stored = await offlineStore.session.get(resolvedUserId)
            if (!cancelled && stored?.isActive && stored.startTime) {
              const { activeSeconds, pausedSeconds } = calculateTimes(stored)
              setSession({
                isActive: stored.isActive,
                isMinimized: true,
                phase: stored.phase,
                disciplineName: stored.disciplineName,
                disciplineId: stored.disciplineId,
                topicName: stored.topicName,
                studyType: stored.studyType,
                technique: stored.technique as StudyTechnique,
                notes: stored.notes,
                startTime: stored.startTime,
                totalPausedMs: stored.totalPausedMs,
                lastPauseStartTime: stored.lastPauseStartTime,
                plannedSeconds: stored.plannedSeconds,
                activeSeconds,
                pausedSeconds,
                planItemId: stored.planItemId,
                source: stored.source,
                cycleId: stored.cycleId,
                cycleItemId: stored.cycleItemId,
              })
            }
          }
        } catch (error) {
          console.error("[STUDY_PROVIDER] Falha ao restaurar sessão do IndexedDB:", error)
        }

        if (!cancelled) {
          const savedPref = localStorage.getItem(FLOATING_TIMER_PREF_KEY)
          setFloatingTimerEnabled(savedPref === null ? true : (JSON.parse(savedPref) as boolean))
        }
      })()
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

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
    if (!session || !session.isActive || session.phase === "IDLE") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setSession((prev) => {
        if (!prev || !prev.isActive) return prev
        const { activeSeconds, pausedSeconds } = calculateTimes(prev)
        if (prev.activeSeconds === activeSeconds && prev.pausedSeconds === pausedSeconds)
          return prev
        return { ...prev, activeSeconds, pausedSeconds }
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

  useEffect(() => {
    const currentUserId = userIdRef.current
    if (!currentUserId) return
    if (session && session.isActive) {
      const { activeSeconds, pausedSeconds, ...rest } = session
      void activeSeconds
      void pausedSeconds
      void offlineStore.session
        .set(currentUserId, { ...rest, activeSeconds: 0, pausedSeconds: 0 })
        .catch((error) => {
          console.error("[STUDY_PROVIDER] Falha ao persistir sessão no IndexedDB:", error)
        })
    } else {
      void offlineStore.session.clear(currentUserId).catch(() => {})
    }
  }, [session, userId])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return
      setSession((prev) => {
        if (!prev || !prev.isActive) return prev
        const { activeSeconds, pausedSeconds } = calculateTimes(prev)
        if (prev.activeSeconds === activeSeconds && prev.pausedSeconds === pausedSeconds)
          return prev
        return { ...prev, activeSeconds, pausedSeconds }
      })
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  // ═══════════════════════════════════════════════════════════════════════
  // TÍTULO DA GUIA — representação do cronômetro REAL (timestamp), nunca um
  // contador independente. Recalculado a cada tick e imediatamente quando o
  // navegador retoma a execução (visibilitychange → visible, focus, pageshow)
  // ou quando o Next/metadata altera o title durante a navegação.
  // ═══════════════════════════════════════════════════════════════════════
  const sessionRef = useRef<StudySessionState | null>(null)
  // Trava de reentrancia: garante uma unica gravacao por sessao mesmo que
  // finalizeAndSaveSession seja chamado duas vezes quase ao mesmo tempo
  // (duplo clique antes do botao desabilitar re-renderizar, duas abas
  // chamando a mesma acao, etc). E' a fonte da verdade da sessao; nao deve
  // depender apenas do `disabled` de cada tela consumidora.
  const isFinalizingRef = useRef(false)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Fase C (offline-first): instala os gatilhos de sincronização (evento
  // `online`, app voltar ao foreground) uma única vez — StudyProvider é o
  // ponto central de integração desta fase (item 1 do pedido).
  useEffect(() => initStudySessionSyncTriggers(), [])

  useEffect(() => {
    let wasTimerTitle = false

    const applyTitle = () => {
      try {
        const state = sessionRef.current
        if (state && state.isActive) {
          const seconds = getActiveElapsedSeconds(state)
          const title = `${formatTitleTime(seconds)} — ${state.disciplineName || "Estudo"}`
          wasTimerTitle = true
          if (document.title !== title) document.title = title
        } else if (wasTimerTitle && document.title !== DEFAULT_TITLE) {
          wasTimerTitle = false
          document.title = DEFAULT_TITLE
        }
      } catch (error) {
        Sentry.captureException(error, {
          extra: { feature: "cronometro", step: "update_document_title" },
        })
      }
    }

    applyTitle()
    const intervalId = setInterval(applyTitle, 1000)

    const handleVisibility = () => {
      if (document.visibilityState === "visible") applyTitle()
    }
    const handleFocus = () => applyTitle()
    const handlePageShow = () => applyTitle()

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("pageshow", handlePageShow)

    // Navegação entre rotas faz o Next sobrescrever o título via metadata —
    // enquanto houver sessão ativa, o cronômetro mantém a prioridade.
    const observer = new MutationObserver(applyTitle)
    const titleElement = document.querySelector("title")
    if (titleElement)
      observer.observe(titleElement, { childList: true, characterData: true, subtree: true })

    return () => {
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("pageshow", handlePageShow)
      observer.disconnect()
    }
  }, [])

  // Aviso ao fechar/recarregar o navegador com uma sessão em andamento
  useEffect(() => {
    if (!session || !session.isActive) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = "Você tem um estudo em andamento."
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.isActive])

  const startSession = useCallback(
    (data: {
      disciplineName: string
      disciplineId?: string | null
      topicName?: string | null
      studyType?: string
      technique?: StudyTechnique
      plannedSeconds?: number
      planItemId?: string | null
      source?: "PLAN" | "FREE" | "CYCLE" | null
      cycleId?: string | null
      cycleItemId?: string | null
      force?: boolean
    }): { started: boolean; reason?: "active-session-exists" } => {
      // ONE ACTIVE SESSION: nunca sobrescrever silenciosamente.
      // Callers devem tratar { started: false } pedindo resume/save/discard.
      const current = sessionRef.current
      if (current && current.isActive && !data.force) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("study-session-conflict"))
        }
        return { started: false, reason: "active-session-exists" }
      }
      const technique = data.technique || "LIVRE"
      const now = Date.now()
      setSession({
        isActive: true,
        isMinimized: false,
        phase: "STUDYING",
        disciplineName: data.disciplineName,
        disciplineId: data.disciplineId ?? undefined,
        topicName: data.topicName || "",
        studyType: data.studyType || "TEORIA",
        technique,
        notes: "",
        startTime: now,
        totalPausedMs: 0,
        lastPauseStartTime: null,
        plannedSeconds: data.plannedSeconds ?? (TECHNIQUE_DURATIONS[technique] || 0),
        activeSeconds: 0,
        pausedSeconds: 0,
        planItemId: data.planItemId || null,
        source: data.source || null,
        cycleId: data.cycleId || null,
        cycleItemId: data.cycleItemId || null,
      })
      if (focusSound.selectedSound !== "off") {
        void focusSound.startSound(focusSound.selectedSound)
      }
      return { started: true }
    },
    [focusSound],
  )

  const minimizeSession = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, isMinimized: true } : null))
  }, [])

  const unminimizeSession = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, isMinimized: false } : null))
  }, [])

  const restoreSession = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, isMinimized: false } : null))
    // Dispara evento para reabrir a Central Inteligente
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("restore-study-session"))
    }
  }, [])

  const pauseSession = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.phase !== "STUDYING") return prev
      return { ...prev, phase: "PAUSED", lastPauseStartTime: Date.now() }
    })
    focusSound.pauseSound()
  }, [focusSound])

  const resumeSession = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.phase !== "PAUSED") return prev
      const pauseDuration =
        prev.lastPauseStartTime !== null ? Date.now() - prev.lastPauseStartTime : 0
      return {
        ...prev,
        phase: "STUDYING",
        totalPausedMs: prev.totalPausedMs + pauseDuration,
        lastPauseStartTime: null,
      }
    })
    if (focusSound.selectedSound !== "off") {
      void focusSound.resumeSound()
    }
  }, [focusSound])

  const endSession = useCallback(() => {
    setSession(null)
    if (userIdRef.current) void offlineStore.session.clear(userIdRef.current).catch(() => {})
    focusSound.stopSound()
  }, [focusSound])

  // Reset: abre a confirmação apenas se houver tempo acumulado na sessão atual.
  // Nunca apaga Histórico/estatísticas — apenas zera a sessão ainda não salva.
  const resetSession = useCallback(() => {
    if (!session || !session.isActive) return
    const hasTime = session.activeSeconds + session.pausedSeconds > 0
    if (!hasTime) return
    setResetDialogOpen(true)
  }, [session])

  const confirmReset = useCallback(() => {
    setResetDialogOpen(false)
    setSession(null)
    if (userIdRef.current) void offlineStore.session.clear(userIdRef.current).catch(() => {})
    focusSound.stopSound()
  }, [focusSound])

  const updateNotes = useCallback((notes: string) => {
    setSession((prev) => (prev ? { ...prev, notes } : null))
  }, [])

  const updatePlannedSeconds = useCallback((seconds: number) => {
    setSession((prev) => (prev ? { ...prev, plannedSeconds: seconds } : null))
  }, [])

  const finalizeAndSaveSession = useCallback(
    async (formData?: Record<string, unknown>) => {
      if (!session) return { success: false, error: "Nenhuma sessão ativa" }
      if (isFinalizingRef.current) {
        return { success: false, error: "Já existe um salvamento em andamento para esta sessão." }
      }
      isFinalizingRef.current = true
      try {
        // Capturar snapshot ANTES de qualquer alteração
        const snapshot = {
          // Timestamps para cálculo server-side
          sessionStartTime: session.startTime,
          sessionTotalPausedMs: session.totalPausedMs,
          sessionLastPauseStartTime: session.lastPauseStartTime,
          is_manual_mode: false,
          // Dados que o saveStudySessionAction espera
          // Prefere a seleção atual do formulário (pode ter sido escolhida após o início)
          discipline_id: (formData?.["discipline_id"] as string) || session.disciplineId,
          discipline_name: (formData?.["discipline_name"] as string) || session.disciplineName,
          topic_name: (formData?.["topic_name"] as string) || session.topicName,
          studyType: (formData?.["studyType"] as string) || session.studyType,
          technique: (formData?.["technique"] as StudyTechnique) || session.technique,
          notes: (formData?.["notes"] as string) ?? session.notes,
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
          // Focus sound
          focus_sound: focusSound.selectedSound !== "off" ? focusSound.selectedSound : null,
          focus_sound_volume: focusSound.selectedSound !== "off" ? focusSound.volume : null,
          // Vínculo com o planejamento (quando a sessão veio do Cronograma)
          study_plan_item_id: session.planItemId || null,
          planned_minutes:
            session.plannedSeconds > 0 ? Math.round(session.plannedSeconds / 60) : null,
          study_source: session.source || null,
          // Avaliação (Cronograma)
          energy_level: (formData?.["energy_level"] as number) ?? null,
          interrupted: Boolean(formData?.["interrupted"]),
          reviews_completed: (formData?.["reviews_completed"] as number) || 0,
          // Tempo calculado
          activeSeconds: session.activeSeconds,
          pausedSeconds: session.pausedSeconds,
          activeMinutes: Math.floor(session.activeSeconds / 60),
          pausedMinutes: Math.floor(session.pausedSeconds / 60),
          focusPercentage:
            session.activeSeconds + session.pausedSeconds > 0
              ? Math.round(
                  (session.activeSeconds / (session.activeSeconds + session.pausedSeconds)) * 100,
                )
              : null,
          completedCycles: 0,
          // Vínculo com o ciclo de estudo
          cycle_id: session.cycleId || null,
          cycle_item_id: session.cycleItemId || null,
        }

        if (!snapshot.discipline_id) {
          return {
            success: false,
            error: "Selecione uma disciplina existente na lista antes de salvar a sessão.",
          }
        }

        const res = await saveStudySessionWithOfflineSupport(snapshot)

        if (!res.success) {
          console.error("[FINALIZE] Falha ao salvar:", res.error)
          return { success: false, error: res.error || "Erro ao salvar sessão" }
        }

        // Parar o som e limpar sessão: o estudo do usuário terminou aqui dos
        // dois jeitos (salvo no servidor OU enfileirado localmente) — item 4
        // do pedido de Fase C: o cronômetro sempre encerra, mesmo offline.
        focusSound.stopSound()
        setSession(null)
        if (userIdRef.current) void offlineStore.session.clear(userIdRef.current).catch(() => {})

        if (res.pending) {
          if (res.pendingSession) {
            dispatchStudySessionQueued(
              res.pendingSession as SavedStudySession & { _offlinePending: true; _operationId: string },
            )
          }
          return { success: true, pending: true as const }
        }

        return {
          success: true,
          historyId: res.historyId ?? undefined,
          session: res.session as Record<string, unknown> | undefined,
        }
      } finally {
        isFinalizingRef.current = false
      }
    },
    [session, focusSound],
  )

  const toggleFloatingTimer = useCallback(() => {
    setFloatingTimerEnabled((prev) => {
      const next = !prev
      localStorage.setItem(FLOATING_TIMER_PREF_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const formatTime = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }, [])

  // Sync entre abas: quando outra aba salva/encerra a sessão no IndexedDB,
  // recarrega o estado local para não ressuscitar sessão obsoleta. Antes
  // (localStorage) isso vinha de graça pelo evento nativo `storage`;
  // IndexedDB não tem equivalente, então usamos o BroadcastChannel exposto
  // por offlineStore.session.subscribe (ver src/infrastructure/offline/session-store.ts).
  useEffect(() => {
    if (!userId) return
    const unsubscribe = offlineStore.session.subscribe(userId, () => {
      void offlineStore.session.get(userId).then((stored) => {
        if (!stored || !stored.isActive || !stored.startTime) {
          setSession(null)
          return
        }
        const { activeSeconds, pausedSeconds } = calculateTimes(stored)
        setSession({
          isActive: stored.isActive,
          isMinimized: stored.isMinimized,
          phase: stored.phase,
          disciplineName: stored.disciplineName,
          disciplineId: stored.disciplineId,
          topicName: stored.topicName,
          studyType: stored.studyType,
          technique: stored.technique as StudyTechnique,
          notes: stored.notes,
          startTime: stored.startTime,
          totalPausedMs: stored.totalPausedMs,
          lastPauseStartTime: stored.lastPauseStartTime,
          plannedSeconds: stored.plannedSeconds,
          activeSeconds,
          pausedSeconds,
          planItemId: stored.planItemId,
          source: stored.source,
          cycleId: stored.cycleId,
          cycleItemId: stored.cycleItemId,
        })
      })
    })
    return unsubscribe
  }, [userId])

  // Resumo estável da sessão: só muda de referência quando um campo que NÃO
  // é atualizado a cada segundo realmente muda (início, pausa, fim,
  // minimizar/restaurar, troca de disciplina/ciclo). Os campos que tickam a
  // cada segundo (activeSeconds, pausedSeconds, startTime, etc.) ficam de
  // fora de propósito — quem precisa deles usa useGlobalStudy(), não
  // useStudyActions().
  const sessionSummary = useMemo<StudySessionSummary | null>(() => {
    if (!session) return null
    return {
      isActive: session.isActive,
      isMinimized: session.isMinimized,
      phase: session.phase,
      disciplineName: session.disciplineName,
      disciplineId: session.disciplineId,
      source: session.source,
      planItemId: session.planItemId,
      cycleId: session.cycleId,
      cycleItemId: session.cycleItemId,
    }
    // Proposital: NÃO depender do objeto `session` inteiro (ele muda de
    // referência a cada segundo por causa do cronômetro), apenas dos campos
    // estáveis abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session?.isActive,
    session?.isMinimized,
    session?.phase,
    session?.disciplineName,
    session?.disciplineId,
    session?.source,
    session?.planItemId,
    session?.cycleId,
    session?.cycleItemId,
  ])

  const hasActiveSession = Boolean(sessionSummary?.isActive)

  // Valor do contexto de ações/flags estáveis: memoizado para NÃO trocar de
  // referência a cada tick do cronômetro (que só afeta `session`/`formatTime`,
  // expostos pelo StudyLiveContext). Isso evita que consumidores que só
  // precisam de ações/flags (ex.: FloatingActionButton, os widgets de ciclo)
  // re-renderizem a cada segundo durante uma sessão ativa.
  const actionsValue = useMemo<StudyActionsContextType>(
    () => ({
      hasActiveSession,
      sessionSummary,
      startSession,
      minimizeSession,
      restoreSession,
      unminimizeSession,
      resetSession,
      pauseSession,
      resumeSession,
      endSession,
      updateNotes,
      updatePlannedSeconds,
      floatingTimerEnabled,
      toggleFloatingTimer,
      finalizeAndSaveSession,
      isCentralOpen,
      setIsCentralOpen,
      focusSound: focusSound.selectedSound,
      focusSoundVolume: focusSound.volume,
      focusSoundIsPlaying: focusSound.isPlaying,
      focusSoundActiveLabel: focusSound.activeSoundLabel,
      selectFocusSound: focusSound.selectSound,
      changeFocusSoundVolume: focusSound.changeVolume,
    }),
    [
      hasActiveSession,
      sessionSummary,
      startSession,
      minimizeSession,
      restoreSession,
      unminimizeSession,
      resetSession,
      pauseSession,
      resumeSession,
      endSession,
      updateNotes,
      updatePlannedSeconds,
      floatingTimerEnabled,
      toggleFloatingTimer,
      finalizeAndSaveSession,
      isCentralOpen,
      setIsCentralOpen,
      focusSound.selectedSound,
      focusSound.volume,
      focusSound.isPlaying,
      focusSound.activeSoundLabel,
      focusSound.selectSound,
      focusSound.changeVolume,
    ],
  )

  const liveValue = useMemo<StudyLiveContextType>(
    () => ({ session, formatTime }),
    [session, formatTime],
  )

  return (
    <StudyActionsContext.Provider value={actionsValue}>
      <StudyLiveContext.Provider value={liveValue}>
        {children}
        <ResetTimerDialog
          open={resetDialogOpen}
          onOpenChange={setResetDialogOpen}
          onConfirm={confirmReset}
        />
      </StudyLiveContext.Provider>
    </StudyActionsContext.Provider>
  )
}

export function useGlobalStudy(): StudyContextType {
  const live = useContext(StudyLiveContext)
  const actions = useContext(StudyActionsContext)
  if (!live || !actions) throw new Error("useGlobalStudy must be used within StudyProvider")
  return {
    session: live.session,
    formatTime: live.formatTime,
    hasActiveSession: actions.hasActiveSession,
    startSession: actions.startSession,
    minimizeSession: actions.minimizeSession,
    restoreSession: actions.restoreSession,
    unminimizeSession: actions.unminimizeSession,
    resetSession: actions.resetSession,
    pauseSession: actions.pauseSession,
    resumeSession: actions.resumeSession,
    endSession: actions.endSession,
    updateNotes: actions.updateNotes,
    updatePlannedSeconds: actions.updatePlannedSeconds,
    floatingTimerEnabled: actions.floatingTimerEnabled,
    toggleFloatingTimer: actions.toggleFloatingTimer,
    finalizeAndSaveSession: actions.finalizeAndSaveSession,
    isCentralOpen: actions.isCentralOpen,
    setIsCentralOpen: actions.setIsCentralOpen,
    focusSound: actions.focusSound,
    focusSoundVolume: actions.focusSoundVolume,
    focusSoundIsPlaying: actions.focusSoundIsPlaying,
    focusSoundActiveLabel: actions.focusSoundActiveLabel,
    selectFocusSound: actions.selectFocusSound,
    changeFocusSoundVolume: actions.changeFocusSoundVolume,
  }
}

/**
 * Hook enxuto para consumidores que só precisam de ações e flags estáveis
 * (não do cronômetro ao vivo). Evita re-render a cada segundo durante uma
 * sessão ativa. Use `sessionSummary` para os campos estáveis da sessão
 * (isActive, isMinimized, disciplineId, cycleId, etc.) em vez de `session`.
 */
export function useStudyActions(): StudyActionsContextType {
  const actions = useContext(StudyActionsContext)
  if (!actions) throw new Error("useStudyActions must be used within StudyProvider")
  return actions
}
