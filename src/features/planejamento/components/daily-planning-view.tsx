"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useRouter } from "next/navigation"

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coffee,
  PlayCircle,
  RefreshCw,
  Undo2,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import {
  closeBlockManuallyAction,
  getPeriodGoalAction,
  getReplanInfoAction,
  pullPendingToTodayAction,
  runReplanningAction,
  setAutoReplanPreferenceAction,
  undoReplanningAction,
} from "@/application/study-plan/replan/adaptive-replan.actions"
import { type ReplanInfoPayload } from "@/application/study-plan/replan/adaptive-replan.service"
import { type PeriodGoalData } from "@/application/study-plan/replan/adaptive-replan.service"
import { pendingOf } from "@/application/study-plan/replan/replan-engine"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  isShiftDayForDate,
  isShiftDayForScale,
  LS_SHIFT_ANCHOR_DATE,
} from "@/features/planejamento/lib/planning-form"
import { STUDY_SESSION_SAVED_EVENT } from "@/features/study-session/lib/study-session-events"
import { cn } from "@/lib/utils"

import { type StudyCycleBlock } from "./planning-view"

interface DailyPlanningViewProps {
  blocks: StudyCycleBlock[]
  history?: { date: string; disciplineId: string; minutes: number; studyPlanItemId?: string | null }[]
  onReplan?: () => void
  onSwitchToCiclo?: () => void
  embedded?: boolean
  className?: string
}

interface DayTask {
  id: string
  itemId: string | null
  disciplineId: string
  disciplineName: string
  durationMinutes: number
  color: string
  origin: string
  timeSlot: string
  completed: boolean
  studiedMinutes: number
  manuallyClosed: boolean
  manualPendingMinutes: number
  hasPending: boolean
}

type PlannedBlockForView = StudyCycleBlock & {
  itemId?: string | null
  origin?: string
  manuallyClosed?: boolean
  manualPendingMinutes?: number
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m}min`
}

export function DailyPlanningView({
  blocks,
  history = [],
  onReplan,
  onSwitchToCiclo,
  embedded = false,
  className,
}: DailyPlanningViewProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  // Escala de Trabalho e Dias de Estudo salvos
  const [scheduleMode, setScheduleMode] = useState<string>("normal")
  const [firstShiftDay, setFirstShiftDay] = useState<number>(2)
  const [anchorShiftDate, setAnchorShiftDate] = useState<string>("")
  const [studyDays, setStudyDays] = useState<string[]>([
    "seg",
    "ter",
    "qua",
    "qui",
    "sex",
    "sab",
    "dom",
  ])

  useEffect(() => {
    const timer = setTimeout(() => {
      const savedScale = localStorage.getItem("mentor_user_work_scale")
      if (savedScale) setScheduleMode(savedScale)
      const savedFirstDay = localStorage.getItem("mentor_user_first_shift_day")
      if (savedFirstDay) setFirstShiftDay(parseInt(savedFirstDay, 10))
      const savedAnchor = localStorage.getItem(LS_SHIFT_ANCHOR_DATE)
      if (savedAnchor) setAnchorShiftDate(savedAnchor)
      const savedStudyDays = localStorage.getItem("mentor_user_study_days")
      if (savedStudyDays) setStudyDays(JSON.parse(savedStudyDays) as string[])
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      const savedScale = localStorage.getItem("mentor_user_work_scale")
      if (savedScale) setScheduleMode(savedScale)
      const savedFirstDay = localStorage.getItem("mentor_user_first_shift_day")
      if (savedFirstDay) setFirstShiftDay(parseInt(savedFirstDay))
      const savedAnchor = localStorage.getItem(LS_SHIFT_ANCHOR_DATE)
      if (savedAnchor) setAnchorShiftDate(savedAnchor)
      const savedStudyDays = localStorage.getItem("mentor_user_study_days")
      if (savedStudyDays) setStudyDays(JSON.parse(savedStudyDays))
    }
    window.addEventListener("mentor_scale_updated", handleUpdate)
    return () => window.removeEventListener("mentor_scale_updated", handleUpdate)
  }, [])

  // ───────────────────────────────────────────────────────────────────────
  // REPLANEJAMENTO ADAPTATIVO: informações da janela ajustada + pendências (com SWR cache)
  // ───────────────────────────────────────────────────────────────────────
  const [replanInfo, setReplanInfo] = useState<ReplanInfoPayload | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const cached = localStorage.getItem("mentor_replan_info_cache")
      return cached ? (JSON.parse(cached) as ReplanInfoPayload) : null
    } catch {
      return null
    }
  })
  const [loadingReplan, setLoadingReplan] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    try {
      return !localStorage.getItem("mentor_replan_info_cache")
    } catch {
      return true
    }
  })
  const [showPendencies, setShowPendencies] = useState(false)
  const [busy, setBusy] = useState(false)

  // Dados de meta de estudo (buscados do banco de dados)
  const [periodGoal, setPeriodGoal] = useState<PeriodGoalData | null>(null)
  const [loadingGoal, setLoadingGoal] = useState(true)

  // Conclusão manual do dia ("Marcar como concluído hoje")
  const [blockToClose, setBlockToClose] = useState<DayTask | null>(null)
  const [closingBlock, setClosingBlock] = useState(false)
  const [closedBlockKeys, setClosedBlockKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("mentor_closed_block_keys")
      return saved ? (JSON.parse(saved) as string[]) : []
    } catch {
      return []
    }
  })

  // Puxar pendência para hoje
  const [pendingToPull, setPendingToPull] = useState<{
    disciplineId: string
    disciplineName: string
    pendingMinutes: number
  } | null>(null)
  const [pullingPending, setPullingPending] = useState(false)

  // Fase F.1: chamadas simultâneas com a mesma disponibilidade compartilham a
  // mesma busca. Ex.: ao concluir um bloco, o componente dispara
  // STUDY_SESSION_SAVED_EVENT (cujo listener abaixo chama loadReplanInfo) e
  // logo em seguida faz `await loadReplanInfo()` — eram 2 execuções idênticas
  // de getReplanInfoAction em fila. Uma chamada feita DEPOIS que a anterior
  // terminou continua buscando de novo normalmente.
  const replanInFlightRef = useRef<{ key: string; token: object; promise: Promise<void> } | null>(null)
  const loadReplanInfo = useCallback(async () => {
    const availability = {
      studyDays,
      scheduleMode,
      firstShiftDay,
      anchorShiftDate: anchorShiftDate || undefined,
    }
    const key = JSON.stringify(availability)
    const inFlight = replanInFlightRef.current
    if (inFlight && inFlight.key === key) return inFlight.promise

    const token = {}
    const promise = (async () => {
      try {
        const res = await getReplanInfoAction(availability)
        if (res.data) {
          setReplanInfo(res.data)
          try {
            localStorage.setItem("mentor_replan_info_cache", JSON.stringify(res.data))
          } catch {
            /* noop */
          }
        }
      } finally {
        setLoadingReplan(false)
        if (replanInFlightRef.current?.token === token) replanInFlightRef.current = null
      }
    })()
    replanInFlightRef.current = { key, token, promise }
    return promise
  }, [studyDays, scheduleMode, firstShiftDay, anchorShiftDate])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReplanInfo()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadReplanInfo])

  useEffect(() => {
    const handler = () => {
      void loadReplanInfo()
    }
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, handler)
    return () => window.removeEventListener(STUDY_SESSION_SAVED_EVENT, handler)
  }, [loadReplanInfo])

  // Carregar dados de meta de estudo do período
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await getPeriodGoalAction("semana")
        if (res.data) {
          setPeriodGoal(res.data)
        }
      } finally {
        setLoadingGoal(false)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // Recarregar meta quando uma sessão é salva
  useEffect(() => {
    const handler = async () => {
      try {
        const res = await getPeriodGoalAction("semana")
        if (res.data) {
          setPeriodGoal(res.data)
        }
      } catch {
        /* noop */
      }
    }
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, handler)
    return () => window.removeEventListener(STUDY_SESSION_SAVED_EVENT, handler)
  }, [])

  const handleManualReplan = async () => {
    setBusy(true)
    try {
      const res = await runReplanningAction({ studyDays, scheduleMode, firstShiftDay })
      if (res.error) {
        toast.error(res.error)
      } else if (res.data?.ran) {
        toast.success(res.data.message)
        setShowPendencies(false)
        await loadReplanInfo()
      } else if (res.data?.reason === "maintenance_paused") {
        toast.info(res.data.message)
        await loadReplanInfo()
      } else {
        toast.info("Nenhuma pendência identificada. Cronograma já está em dia!")
        await loadReplanInfo()
      }
    } catch {
      toast.error("Erro de conexão ao recalcular o cronograma.")
    } finally {
      setBusy(false)
    }
  }

  const handleUndo = async (eventId: string) => {
    setBusy(true)
    try {
      const res = await undoReplanningAction(eventId)
      if (res.ok) {
        toast.success("Reajuste desfeito.")
        await loadReplanInfo()
      } else {
        toast.error(res.error || "Não foi possível desfazer.")
      }
    } catch {
      toast.error("Erro de conexão ao desfazer.")
    } finally {
      setBusy(false)
    }
  }

  const handleToggleAuto = async (enabled: boolean) => {
    const res = await setAutoReplanPreferenceAction(enabled)
    if (!res.ok) {
      toast.error(res.error || "Erro ao salvar preferência.")
      return
    }
    toast.success(enabled ? "Reajuste automático ativado." : "Reajuste automático desativado.")
    if (enabled) {
      await handleManualReplan()
    } else {
      await loadReplanInfo()
    }
  }

  // Reverte a marcação otimista de "bloco fechado" quando closeBlockManuallyAction
  // falha (ver handleConfirmCloseBlock) — usa a forma funcional para não gravar
  // no localStorage um valor "stale" capturado antes da atualização otimista.
  const revertOptimisticClose = (keysToRemove: string[]) => {
    setClosedBlockKeys((prev) => {
      const reverted = prev.filter((k) => !keysToRemove.includes(k))
      try {
        localStorage.setItem("mentor_closed_block_keys", JSON.stringify(reverted))
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
      return reverted
    })
  }

  const handleConfirmCloseBlock = async () => {
    if (!blockToClose) return
    const key1 = blockToClose.id
    const key2 = blockToClose.itemId || ""
    const key3 = `${selectedDateStr}_${blockToClose.disciplineId}`
    const key4 = `${selectedDateStr}_${blockToClose.id}`
    const newKeys = [key1, key2, key3, key4].filter(Boolean)

    setClosedBlockKeys((prev) => {
      const updated = Array.from(new Set([...prev, ...newKeys]))
      try {
        localStorage.setItem("mentor_closed_block_keys", JSON.stringify(updated))
      } catch { /* localStorage indisponível (modo privado/cota cheia): segue sem o cache local */ }
      return updated
    })

    setClosingBlock(true)
    try {
      const result = await closeBlockManuallyAction(
        blockToClose.id,
        blockToClose.durationMinutes,
        blockToClose.studiedMinutes,
      )
      if (!result.ok) {
        // Antes o retorno não era verificado: mesmo com result.ok === false a UI
        // já tinha marcado o bloco como fechado no localStorage (acima) e mostrava
        // toast de sucesso — o bloco sumia da lista permanentemente sem nada ter
        // sido persistido no servidor. Agora desfazemos a marcação otimista e
        // avisamos o usuário do erro real.
        revertOptimisticClose(newKeys)
        toast.error(result.error || "Erro ao concluir o bloco.")
        return
      }
      toast.success("Bloco concluído. Os minutos restantes não serão reprogramados.")
      setBlockToClose(null)
      window.dispatchEvent(new CustomEvent(STUDY_SESSION_SAVED_EVENT))
      await loadReplanInfo()
    } catch {
      revertOptimisticClose(newKeys)
      toast.error("Erro ao concluir o bloco.")
    } finally {
      setClosingBlock(false)
    }
  }

  const handleConfirmPullPending = async () => {
    if (!pendingToPull) return
    setPullingPending(true)
    try {
      const availability = {
        studyDays,
        scheduleMode,
        firstShiftDay,
        anchorShiftDate: anchorShiftDate || undefined,
      }
      const res = await pullPendingToTodayAction(pendingToPull.disciplineId, availability)
      if (res.ok) {
        toast.success(res.message || "Pendência adicionada ao dia de hoje!")
        setPendingToPull(null)
        window.dispatchEvent(new CustomEvent(STUDY_SESSION_SAVED_EVENT))
        await loadReplanInfo()
      } else {
        toast.error(res.error || "Erro ao puxar pendência.")
      }
    } catch {
      toast.error("Erro de conexão ao antecipar pendência.")
    } finally {
      setPullingPending(false)
    }
  }

  const handleKeepInPlan = (p: { disciplineName: string }) => {
    toast.info(`${p.disciplineName} mantida no cronograma com distribuição automática.`)
  }

  if (!mounted) {
    return null
  }

  // Formatting date
  const dateFormatted = selectedDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const isToday = new Date().toDateString() === selectedDate.toDateString()

  const handlePrevDay = () => {
    const prev = new Date(selectedDate)
    prev.setDate(prev.getDate() - 1)
    setSelectedDate(prev)
  }

  const handleNextDay = () => {
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + 1)
    setSelectedDate(next)
  }

  const handleGoToday = () => {
    setSelectedDate(new Date())
  }

  // Build date string for history filtering (YYYY-MM-DD)
  const selectedDateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`

  const isShiftDay = (dayNum: number) => {
    if (anchorShiftDate) {
      return isShiftDayForDate(selectedDateStr, anchorShiftDate, scheduleMode)
    }
    return isShiftDayForScale(dayNum, firstShiftDay, scheduleMode)
  }

  // Filter history for the selected date ONLY (respeitando timezone local do estudante)
  const historyForDay = history.filter((h) => {
    if (!h.date) return false
    let hDateStr = h.date
    if (h.date.includes("T") || h.date.includes("Z")) {
      const d = new Date(h.date)
      if (!isNaN(d.getTime())) {
        hDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      }
    }
    return hDateStr === selectedDateStr
  })

  const dayOfWeek = selectedDate.getDay()
  const dateNum = selectedDate.getDate()
  const daysMap = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]
  const currentDayId = daysMap[dayOfWeek] || "dom"

  // Cores fixas por disciplina (do bloco do ciclo)
  const colorByDiscipline = new Map<string, string>()
  blocks.forEach((b) => {
    if (!colorByDiscipline.has(b.disciplineId))
      colorByDiscipline.set(b.disciplineId, b.color || "#2563EB")
  })

  // Seleciona os blocos do dia: prioriza a janela persistida (replanejada)
  // pelo servidor; cai na seleção local quando não houver janela.
  const dayBlocks: PlannedBlockForView[] = (() => {
    if (blocks.length === 0 && !replanInfo?.hasPlan) return []

    if (scheduleMode !== "normal" && isShiftDay(dateNum)) {
      return []
    }

    if (!studyDays.includes(currentDayId)) {
      return []
    }

    const serverBlocks = replanInfo?.dailyBlocks[selectedDateStr]
    if (serverBlocks && serverBlocks.length > 0) {
      return serverBlocks.map((b) => ({
        id: b.id,
        itemId: b.itemId,
        disciplineId: b.disciplineId,
        disciplineName: b.disciplineName,
        durationMinutes: b.durationMinutes,
        studiedMinutes: 0,
        color: colorByDiscipline.get(b.disciplineId) || "#2563EB",
        completed: false,
        origin: b.origin,
        manuallyClosed: b.manuallyClosed,
        manualPendingMinutes: b.manualPendingMinutes,
      }))
    }

    return []
  })()

  // Calculate minutes studied per block on the selected day
  // Distributes session minutes across blocks, never duplicating.
  // Priority: 1) direct link via studyPlanItemId, 2) same discipline in order.
  const studiedMinutesByBlock = (() => {
    const result = new Map<string, number>()

    // Pass 1: Direct link via studyPlanItemId (highest priority)
    const consumed = new Map<number, number>() // session index → minutes already consumed
    historyForDay.forEach((h, sessionIdx) => {
      if (!h.studyPlanItemId) return
      const targetBlock = dayBlocks.find((b) => b.itemId === h.studyPlanItemId)
      if (!targetBlock) return

      const alreadyUsed = consumed.get(sessionIdx) ?? 0
      const remaining = Math.max(0, h.minutes - alreadyUsed)
      if (remaining <= 0) return

      const current = result.get(targetBlock.id) ?? 0
      const room = Math.max(0, targetBlock.durationMinutes - current)
      const share = Math.min(remaining, room)
      result.set(targetBlock.id, current + share)
      consumed.set(sessionIdx, alreadyUsed + share)
    })

    // Pass 2: Same discipline fallback (distribute remaining to blocks in order)
    const sessionsByDiscipline = new Map<number, { minutes: number; remaining: number }>()
    historyForDay.forEach((h, sessionIdx) => {
      const used = consumed.get(sessionIdx) ?? 0
      const remaining = Math.max(0, h.minutes - used)
      if (remaining <= 0) return
      const current = sessionsByDiscipline.get(sessionIdx) ?? { minutes: h.minutes, remaining: 0 }
      sessionsByDiscipline.set(sessionIdx, { ...current, remaining })
    })

    // Group blocks by discipline
    const blocksByDiscipline = new Map<string, PlannedBlockForView[]>()
    for (const block of dayBlocks) {
      const list = blocksByDiscipline.get(block.disciplineId) ?? []
      list.push(block)
      blocksByDiscipline.set(block.disciplineId, list)
    }

    // Distribute remaining sessions to blocks of the same discipline
    for (const [sessionIdx, session] of sessionsByDiscipline) {
      const h = historyForDay[sessionIdx]
      if (!h || session.remaining <= 0) continue

      const disciplineBlocks = (blocksByDiscipline.get(h.disciplineId) ?? [])
        .sort((a, b) => dayBlocks.indexOf(a) - dayBlocks.indexOf(b))

      let remaining = session.remaining
      for (const block of disciplineBlocks) {
        if (remaining <= 0) break
        const current = result.get(block.id) ?? 0
        const room = Math.max(0, block.durationMinutes - current)
        const share = Math.min(remaining, room)
        result.set(block.id, current + share)
        remaining -= share
      }
    }

    return result
  })()

  // Map blocks to scheduled tasks, marking completed based on REAL history for this date
  const getTaskStatus = (completed: boolean, studiedMinutes: number, hasPending: boolean) => {
    if (completed) return "CONCLUIDO"
    if (studiedMinutes > 0) return "EM_ANDAMENTO"
    if (hasPending) return "PENDENCIA"
    return "PENDENTE"
  }

  const getTaskProgressText = (
    completed: boolean,
    studied: number,
    duration: number,
    _manuallyClosed: boolean,
    _manualPendingMinutes: number,
  ) => {
    if (completed) return `${studied || 0} min estudados`
    if (studied > 0) return `${studied} de ${duration} min estudados`
    return `${duration} min planejados`
  }

  const scheduledTasks: DayTask[] = dayBlocks.map((block, idx) => {
    const hourStart = 8 + idx * 2
    const startStr = `${hourStart.toString().padStart(2, "0")}:00`
    const endStr = `${(hourStart + Math.max(1, Math.round(block.durationMinutes / 60))).toString().padStart(2, "0")}:00`

    const studiedMins = studiedMinutesByBlock.get(block.id) || 0
    const isCompletedByHistory = studiedMins >= block.durationMinutes && studiedMins > 0
    const isManuallyClosed =
      (block.manuallyClosed ?? false) ||
      closedBlockKeys.includes(block.id) ||
      (Boolean(block.itemId) && closedBlockKeys.includes(block.itemId!)) ||
      closedBlockKeys.includes(`${selectedDateStr}_${block.disciplineId}`) ||
      closedBlockKeys.includes(`${selectedDateStr}_${block.id}`)
    const isCompleted = isManuallyClosed || isCompletedByHistory
    const blockHasPending = !isCompleted && (block.origin ?? "BASE") !== "BASE"

    return {
      id: block.id,
      itemId: block.itemId ?? null,
      disciplineId: block.disciplineId,
      disciplineName: block.disciplineName,
      durationMinutes: block.durationMinutes,
      color: block.color || "#2563EB",
      origin: block.origin ?? "BASE",
      timeSlot: `${startStr} - ${endStr}`,
      completed: isCompleted,
      studiedMinutes: studiedMins,
      manuallyClosed: isManuallyClosed,
      manualPendingMinutes: block.manualPendingMinutes ?? 0,
      hasPending: blockHasPending,
      status: getTaskStatus(isCompleted, studiedMins, blockHasPending),
    }
  })

  const totalMinutes = dayBlocks.reduce((acc, b) => acc + b.durationMinutes, 0)

  const pendingLabel = (() => {
    if (!replanInfo) return "—"
    if (replanInfo.sanityInvalid) return "em análise"
    return formatMinutes(replanInfo.totalPendingMinutes)
  })()

  const hasAdjustments = scheduledTasks.some((t) => t.origin !== "BASE")
  const lastEvent = replanInfo?.lastEvent
  const showBanner =
    lastEvent && !lastEvent.revertedAt && !replanInfo?.replanPaused && !replanInfo?.sanityInvalid
  const showPendencyPanel =
    (replanInfo?.totalPendingMinutes ?? 0) > 0 &&
    showPendencies &&
    !replanInfo?.sanityInvalid

  const renderEmptyState = () => {
    if (blocks.length > 0) {
      return (
        <div className="py-12 text-center space-y-4">
          <Coffee aria-hidden className="w-5 h-5 mx-auto text-muted-foreground/70" />
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="text-sm font-medium text-foreground">Dia de descanso programado</h4>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Seu planejamento não tem matérias agendadas para este dia.
              Use o tempo para descansar ou fazer revisões livres.
            </p>
          </div>
          {onSwitchToCiclo && (
            <Button
              onClick={onSwitchToCiclo}
              variant="outline"
              size="sm"
            >
              Ver sequência do ciclo
            </Button>
          )}
        </div>
      )
    }
    return (
      <div className="py-12 text-center space-y-2">
        <BookOpen aria-hidden className="w-5 h-5 mx-auto text-muted-foreground/70" />
        <p className="text-sm font-medium text-foreground">
          Nenhum planejamento criado
        </p>
        <p className="text-[13px] text-muted-foreground">
          Gere um cronograma a partir do seu ciclo e da sua disponibilidade.
        </p>
        {onReplan && (
          <Button
            onClick={onReplan}
            size="sm"
            className="mt-1"
          >
            Gerar planejamento
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "p-4 space-y-3.5 w-full",
        !embedded && "bg-card border border-border rounded-lg",
        className,
      )}
    >
      {/* Linha 1: Controles de Data e Navegação */}
      <div className="flex items-start justify-between gap-3 border-b pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-semibold text-foreground capitalize leading-tight">
                {dateFormatted}
              </h2>
              {isToday && (
                <span className="px-1.5 py-0.5 text-[11px] font-medium bg-primary/10 text-primary rounded-sm">
                  Hoje
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {scheduledTasks.length > 0
                ? `${scheduledTasks.length} matéria${scheduledTasks.length !== 1 ? "s" : ""} programada${scheduledTasks.length !== 1 ? "s" : ""} • Total de ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}min`
                : "Nenhum planejamento ativo para esta data"}
            </p>
            {hasAdjustments && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Ajustado devido às pendências de ontem
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevDay}
            className="h-9 w-9"
            aria-label="Dia anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToday}
              className="h-9 hidden sm:flex"
            >
              Hoje
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextDay}
            className="h-9 w-9"
            aria-label="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* REGRA 0 — Aviso de manutenção (replanejamento pausado) */}
      {replanInfo?.replanPaused && (
        <div className="flex items-start sm:items-center gap-2 border-l-2 border-info bg-info/5 px-3 py-2">
          <Wrench className="w-3.5 h-3.5 shrink-0 mt-0.5 sm:mt-0 text-info" />
          <p className="text-[13px] leading-snug">
            <span className="font-medium text-foreground">Replanejamento pausado temporariamente.</span>{" "}
            <span className="text-muted-foreground">Nenhum novo reajuste será gerado.</span>
          </p>
        </div>
      )}

      {/* Aviso de reajuste automático */}
      {showBanner && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-2 border-primary bg-primary/5 px-3 py-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            Cronograma reajustado — {lastEvent.message}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPendencies((v) => !v)}
              className="h-7 px-2.5 text-[11px] font-semibold text-primary rounded-lg cursor-pointer"
            >
              {showPendencies ? "Ocultar alterações" : "Ver alterações"}
            </Button>
            {!lastEvent.critical && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUndo(lastEvent.id)}
                disabled={busy}
                className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground rounded-lg cursor-pointer"
              >
                <Undo2 className="w-3 h-3 mr-1" /> Desfazer
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Painel de pendências */}
      {showPendencyPanel && (
        <div className="border-l-2 border-warning bg-warning/5 px-3 py-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Pendências de estudos anteriores
            </h4>
            <span className="text-xs font-semibold text-amber-700 tabular-nums">
              Total: {formatMinutes(replanInfo?.totalPendingMinutes ?? 0)}
            </span>
          </div>

          <div className="space-y-2">
            {(replanInfo?.pendingByDiscipline ?? []).map((p) => (
              <div
                key={p.disciplineId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-card border border-border rounded-md p-2.5"
              >
                <div className="flex items-center justify-between sm:justify-start gap-3">
                  <span className="text-xs font-semibold text-foreground">{p.disciplineName}</span>
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums bg-amber-500/10 px-2 py-0.5 rounded-md">
                    {formatMinutes(p.pendingMinutes)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleKeepInPlan(p)}
                    className="h-7 px-2 text-[11px] font-semibold text-muted-foreground border-border/60 hover:bg-muted/50 rounded-lg cursor-pointer"
                  >
                    Manter no planejamento
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setPendingToPull(p)}
                    disabled={pullingPending}
                    className="h-7 px-2.5 text-xs cursor-pointer"
                  >
                    Puxar para hoje
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={replanInfo?.enabled ?? true}
                onChange={(e) => void handleToggleAuto(e.target.checked)}
                className="w-3.5 h-3.5 accent-primary cursor-pointer"
              />
              Reajustar automaticamente meu cronograma
            </label>
            {!replanInfo?.enabled && (
              <Button
                size="sm"
                onClick={() => void handleManualReplan()}
                disabled={busy || replanInfo?.replanPaused}
                className="h-8 px-3 text-[11px] rounded-lg cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${busy ? "animate-spin" : ""}`} />
                {replanInfo?.replanPaused ? "Pausado" : "Recalcular cronograma"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Linha 2: métricas em uma única faixa com divisórias (Redesign 2.0 —
          antes eram 5 "pílulas" coloridas, uma cor por métrica). */}
      <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-border border-y border-border [&>*]:border-border max-sm:[&>*:nth-child(4)]:border-l-0 max-sm:[&>*:nth-child(n+4)]:border-t">
        {/* Meta (semanal) */}
        <div className="px-3 py-2 flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            Meta
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums truncate mt-0.5">
            {periodGoal
              ? `${Math.floor(periodGoal.goalMinutes / 60)}h${periodGoal.goalMinutes % 60 > 0 ? `${periodGoal.goalMinutes % 60}min` : ""}`
              : "—"}
          </span>
        </div>

        {/* Estudado (período) */}
        <div className="px-3 py-2 flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            Estudado
          </span>
          <span className="text-sm font-semibold text-primary tabular-nums truncate mt-0.5">
            {periodGoal
              ? `${Math.floor(periodGoal.studiedMinutes / 60)}h${periodGoal.studiedMinutes % 60 > 0 ? `${periodGoal.studiedMinutes % 60}min` : ""}`
              : loadingGoal
                ? "..."
                : "—"}
          </span>
        </div>

        {/* Falta (meta - estudado) */}
        <div className="px-3 py-2 flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            Falta
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums truncate mt-0.5">
            {periodGoal
              ? periodGoal.remainingMinutes <= 0
                ? "Meta cumprida"
                : `${Math.floor(periodGoal.remainingMinutes / 60)}h${periodGoal.remainingMinutes % 60 > 0 ? `${periodGoal.remainingMinutes % 60}min` : ""}`
              : loadingGoal
                ? "..."
                : "—"}
          </span>
        </div>

        {/* Planejado para hoje */}
        <div className="px-3 py-2 flex flex-col min-w-0">
          <span className="text-xs text-muted-foreground truncate">
            Hoje
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums truncate mt-0.5">
            {Math.floor(totalMinutes / 60)}h{totalMinutes % 60 > 0 ? `${totalMinutes % 60}min` : ""}
          </span>
        </div>

        {/* Pendências */}
        <div
          role={(replanInfo?.totalPendingMinutes ?? 0) > 0 ? "button" : undefined}
          onClick={() => {
            if ((replanInfo?.totalPendingMinutes ?? 0) > 0) {
              setShowPendencies((v) => !v)
            }
          }}
          className={cn(
            "px-3 py-2 flex flex-col min-w-0 transition-colors",
            (replanInfo?.totalPendingMinutes ?? 0) > 0 &&
              "cursor-pointer hover:bg-muted/60",
          )}
          title={
            (replanInfo?.totalPendingMinutes ?? 0) > 0
              ? showPendencies
                ? "Clique para ocultar detalhes"
                : "Clique para ver detalhes das pendências"
              : undefined
          }
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-muted-foreground truncate">
              Pendências
            </span>
            {(replanInfo?.totalPendingMinutes ?? 0) > 0 && (
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            )}
          </div>
          <span className={cn(
            "text-sm font-semibold tabular-nums truncate mt-0.5",
            (replanInfo?.totalPendingMinutes ?? 0) > 0 ? "text-destructive" : "text-foreground",
          )}>
            {pendingLabel}
          </span>
        </div>
      </div>

      {/* Linha 3: Cronograma do Dia */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-[13px] font-semibold text-foreground">
            Cronograma do dia
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {scheduledTasks.length} matéria{scheduledTasks.length !== 1 ? "s" : ""} programada
            {scheduledTasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loadingReplan && !replanInfo ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-skeleton" />
            ))}
          </div>
        ) : scheduledTasks.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {scheduledTasks.map((task) => {
              const progressPct = task.completed
                ? 100
                : task.durationMinutes > 0
                  ? Math.min(100, Math.round((task.studiedMinutes / task.durationMinutes) * 100))
                  : 0
              const remaining = Math.max(0, task.durationMinutes - task.studiedMinutes)
              const status = task.completed
                ? "CONCLUIDO"
                : task.studiedMinutes > 0
                  ? "EM_ANDAMENTO"
                  : task.hasPending
                    ? "PENDENCIA"
                    : "PENDENTE"

              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 py-3 px-1 hover:bg-muted/30 transition-colors"
                >
                  {/* Header: color bar + discipline + time slot + badges */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: task.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Line 1: time slot + duration + status badge + pending badge */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {task.timeSlot}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              · {task.durationMinutes} min
                            </span>
                            {status === "CONCLUIDO" && (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-sm bg-success/10 text-success flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Concluído
                              </span>
                            )}
                            {status === "EM_ANDAMENTO" && (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary flex items-center gap-1">
                                Em andamento
                              </span>
                            )}
                            {status === "PENDENCIA" && (
                              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-sm bg-warning/15 text-foreground">
                                Pendência
                              </span>
                            )}
                            {status === "PENDENTE" && (
                              <span className="text-[11px] font-medium text-muted-foreground">
                                Pendente
                              </span>
                            )}
                          </div>

                          {/* Line 2: discipline name */}
                          <h4 className="text-sm font-semibold text-foreground truncate">{task.disciplineName}</h4>

                          {/* Line 3: progress text */}
                          <p className="text-xs text-muted-foreground">
                            {getTaskProgressText(
                              task.completed,
                              task.studiedMinutes,
                              task.durationMinutes,
                              task.manuallyClosed,
                              task.manualPendingMinutes,
                            )}
                          </p>

                          {/* Line 4: remaining time (only for in-progress) */}
                          {status === "EM_ANDAMENTO" && remaining > 0 && (
                            <p className="text-[11px] font-medium text-muted-foreground/70">
                              Faltam {remaining} min
                            </p>
                          )}

                          {/* Line 5: progress bar (for in-progress and completed) */}
                          {(status === "EM_ANDAMENTO" || status === "CONCLUIDO") && (
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${progressPct}%`,
                                  backgroundColor:
                                    status === "CONCLUIDO" ? "#10b981" : task.color || "#2563EB",
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Buttons — inline with content */}
                        {!task.completed && (
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            {!task.manuallyClosed && task.studiedMinutes > 0 && isToday && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setBlockToClose(task)}
                                className="h-8 w-[110px] px-0 text-xs cursor-pointer justify-center"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Concluir
                              </Button>
                            )}
                            <Button
                              onClick={() => {
                                toast.success(`Iniciando estudo de ${task.disciplineName}`)
                                const targetDuration =
                                  task.durationMinutes > 0
                                    ? Math.max(1, task.durationMinutes - task.studiedMinutes)
                                    : task.durationMinutes
                                router.push(
                                  `/dashboard/study-session?planId=${task.itemId ?? task.id}&duration=${targetDuration}`,
                                )
                              }}
                              size="sm"
                              className="h-8 w-[110px] px-0 text-xs cursor-pointer justify-center"
                            >
                              <PlayCircle className="w-3.5 h-3.5 mr-1" />
                              {task.studiedMinutes > 0 ? "Continuar" : "Iniciar"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Diálogo de confirmação — "Marcar como concluído hoje" */}
      <Dialog
        open={blockToClose !== null}
        onOpenChange={(open) => {
          if (!open) setBlockToClose(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como concluído hoje?</DialogTitle>
            <DialogDescription>
              {(() => {
                const pending =
                  blockToClose && blockToClose.studiedMinutes > 0
                    ? pendingOf(blockToClose.durationMinutes, blockToClose.studiedMinutes)
                    : 0
                return pending > 0
                  ? `Você estudou ${blockToClose?.studiedMinutes} de ${blockToClose?.durationMinutes} minutos. Os ${pending} minutos restantes não serão reprogramados para o futuro.`
                  : `Você estudou ${blockToClose?.studiedMinutes} de ${blockToClose?.durationMinutes} minutos. Este bloco será marcado como concluído.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBlockToClose(null)}
              className="rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleConfirmCloseBlock()}
              disabled={closingBlock}
              className="bg-primary hover:bg-primary/90 rounded-xl cursor-pointer"
            >
              {closingBlock ? "Concluindo..." : "Concluir hoje"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmação — "Puxar para hoje" */}
      <Dialog
        open={pendingToPull !== null}
        onOpenChange={(open) => {
          if (!open) setPendingToPull(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-semibold text-foreground">
              Puxar pendência para hoje?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              Ao puxar esta pendência de{" "}
              <strong className="text-foreground font-semibold">
                {pendingToPull?.disciplineName} ({formatMinutes(pendingToPull?.pendingMinutes ?? 0)})
              </strong>{" "}
              para hoje, o cronograma dos próximos dias será recalculado respeitando a sua capacidade diária e o saldo restante da meta semanal. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingToPull(null)}
              disabled={pullingPending}
              className="text-xs font-semibold rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleConfirmPullPending()}
              disabled={pullingPending}
              className="cursor-pointer"
            >
              {pullingPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Recalculando...
                </>
              ) : (
                "Sim, puxar para hoje"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
