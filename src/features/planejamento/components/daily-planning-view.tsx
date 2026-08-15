"use client"

import { useCallback, useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import {
  AlertTriangle,
  BookOpen,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Undo2,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import {
  closeBlockManuallyAction,
  getReplanInfoAction,
  runReplanningAction,
  setAutoReplanPreferenceAction,
  undoReplanningAction,
} from "@/application/study-plan/replan/adaptive-replan.actions"
import { type ReplanInfoPayload } from "@/application/study-plan/replan/adaptive-replan.service"
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
import { isShiftDayForScale } from "@/features/planejamento/lib/planning-form"
import { STUDY_SESSION_SAVED_EVENT } from "@/features/study-session/lib/study-session-events"

import { type StudyCycleBlock } from "./planning-view"

interface DailyPlanningViewProps {
  blocks: StudyCycleBlock[]
  history?: { date: string; disciplineId: string; minutes: number }[]
  onReplan?: () => void
  onSwitchToCiclo?: () => void
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
      const savedStudyDays = localStorage.getItem("mentor_user_study_days")
      if (savedStudyDays) setStudyDays(JSON.parse(savedStudyDays))
    }
    window.addEventListener("mentor_scale_updated", handleUpdate)
    return () => window.removeEventListener("mentor_scale_updated", handleUpdate)
  }, [])

  // ───────────────────────────────────────────────────────────────────────
  // REPLANEJAMENTO ADAPTATIVO: informações da janela ajustada + pendências
  // ───────────────────────────────────────────────────────────────────────
  const [replanInfo, setReplanInfo] = useState<ReplanInfoPayload | null>(null)
  const [showPendencies, setShowPendencies] = useState(false)
  const [busy, setBusy] = useState(false)

  // Conclusão manual do dia ("Marcar como concluído hoje")
  const [blockToClose, setBlockToClose] = useState<DayTask | null>(null)
  const [closingBlock, setClosingBlock] = useState(false)

  const loadReplanInfo = useCallback(async () => {
    const availability = {
      studyDays,
      scheduleMode,
      firstShiftDay,
    }
    const res = await getReplanInfoAction(availability)
    if (res.data) setReplanInfo(res.data)
  }, [studyDays, scheduleMode, firstShiftDay])

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

  const handleConfirmCloseBlock = async () => {
    if (!blockToClose) return
    setClosingBlock(true)
    try {
      const res = await closeBlockManuallyAction(
        blockToClose.id,
        blockToClose.durationMinutes,
        blockToClose.studiedMinutes,
      )
      if (res.ok) {
        toast.success("Bloco concluído. Os minutos restantes não serão reprogramados.")
        setBlockToClose(null)
        await loadReplanInfo()
      } else {
        toast.error(res.error || "Não foi possível concluir o bloco.")
      }
    } catch {
      toast.error("Erro de conexão ao concluir o bloco.")
    } finally {
      setClosingBlock(false)
    }
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

  const isShiftDay = (dayNum: number) => {
    return isShiftDayForScale(dayNum, firstShiftDay, scheduleMode)
  }

  // Build date string for history filtering (YYYY-MM-DD)
  const selectedDateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`

  // Filter history for the selected date ONLY
  const historyForDay = history.filter((h) => {
    const hDate = h.date.includes("T") ? h.date.split("T")[0] : h.date
    return hDate === selectedDateStr
  })

  // Calculate minutes studied per discipline on the selected day
  const studiedMinutesByDiscipline = new Map<string, number>()
  historyForDay.forEach((h) => {
    const current = studiedMinutesByDiscipline.get(h.disciplineId) || 0
    studiedMinutesByDiscipline.set(h.disciplineId, current + h.minutes)
  })

  // Total studied minutes on the selected day
  const completedMinutes = historyForDay.reduce((sum, h) => sum + h.minutes, 0)

  // Total cycle workload in minutes
  const totalCycleMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const activeDaysCount = Math.max(1, studyDays.length)
  const targetDailyMinutes =
    totalCycleMinutes > 0 ? Math.max(30, Math.round(totalCycleMinutes / activeDaysCount)) : 180

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

    if (blocks.length === 0) return []

    const blocksPerDay = Math.max(1, Math.round(blocks.length / activeDaysCount))
    const dayOfYear = Math.floor(
      (selectedDate.getTime() - new Date(selectedDate.getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24),
    )
    const startIndex = (dayOfYear * blocksPerDay) % blocks.length

    const selectedList: StudyCycleBlock[] = []
    let accumulatedMins = 0
    let idx = 0

    while (accumulatedMins < targetDailyMinutes && idx < blocks.length) {
      const block = blocks[(startIndex + idx) % blocks.length]
      if (block) {
        selectedList.push(block)
        accumulatedMins += block.durationMinutes
      }
      idx++
    }

    return selectedList
  })()

  // Map blocks to scheduled tasks, marking completed based on REAL history for this date
  const getTaskStatus = (completed: boolean, index: number) => {
    if (completed) return "CONCLUIDO"
    if (index === 0) return "EM_ANDAMENTO"
    return "PENDENTE"
  }

  const getTaskProgressText = (
    completed: boolean,
    studied: number,
    duration: number,
    manuallyClosed: boolean,
    manualPendingMinutes: number,
  ) => {
    if (manuallyClosed) {
      return manualPendingMinutes > 0
        ? `Concluído com ${manualPendingMinutes} min pendentes`
        : "Concluído manualmente"
    }
    if (completed) return `Concluído — ${studied || 0} min estudados`
    if (studied) return `Em andamento — ${studied} de ${duration} min`
    return "Aguardando início"
  }

  const scheduledTasks: DayTask[] = dayBlocks.map((block, idx) => {
    const hourStart = 8 + idx * 2
    const startStr = `${hourStart.toString().padStart(2, "0")}:00`
    const endStr = `${(hourStart + Math.max(1, Math.round(block.durationMinutes / 60))).toString().padStart(2, "0")}:00`

    const studiedMins = studiedMinutesByDiscipline.get(block.disciplineId) || 0
    const isCompletedByHistory = studiedMins >= block.durationMinutes && studiedMins > 0
    const manuallyClosed = block.manuallyClosed ?? false
    const isCompleted = manuallyClosed || isCompletedByHistory

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
      manuallyClosed,
      manualPendingMinutes: block.manualPendingMinutes ?? 0,
      status: getTaskStatus(isCompleted, idx),
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
    (showPendencies || !replanInfo?.enabled) &&
    !replanInfo?.sanityInvalid

  const renderEmptyState = () => {
    if (blocks.length > 0) {
      return (
        <div className="py-12 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
            <Coffee className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="text-base font-extrabold text-foreground">Dia de Descanso Programado</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              De acordo com seu planejamento, você não tem matérias agendadas para este dia.
              Aproveite para descansar ou fazer revisões livres!
            </p>
          </div>
          {onSwitchToCiclo && (
            <Button
              onClick={onSwitchToCiclo}
              variant="outline"
              size="sm"
              className="font-bold text-xs gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Ver Sequência do Ciclo
            </Button>
          )}
        </div>
      )
    }
    return (
      <div className="py-12 text-center space-y-3">
        <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/50" />
        <p className="text-sm font-semibold text-muted-foreground">
          Nenhum planejamento criado ainda.
        </p>
        {onReplan && (
          <Button
            onClick={onReplan}
            size="sm"
            className="font-bold text-xs bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl cursor-pointer"
          >
            Gerar Planejamento com IA
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card border rounded-xl p-3.5 sm:p-4.5 shadow-2xs space-y-3.5">
      {/* Linha 1: Controles de Data e Navegação */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-foreground capitalize leading-tight">
                {dateFormatted}
              </h2>
              {isToday && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-600 rounded-full">
                  Hoje
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {scheduledTasks.length > 0
                ? `${scheduledTasks.length} matéria${scheduledTasks.length !== 1 ? "s" : ""} programada${scheduledTasks.length !== 1 ? "s" : ""} • Total de ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}min`
                : "Nenhum planejamento ativo para esta data"}
            </p>
            {hasAdjustments && (
              <p className="text-[11px] font-bold text-[#2563EB] mt-0.5 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Ajustado devido às pendências de ontem
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevDay}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToday}
              className="h-8 px-3 rounded-lg text-xs font-bold text-[#2563EB] border-[#2563EB]/30"
            >
              Ir para Hoje
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextDay}
            className="h-8 w-8 rounded-lg"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* REGRA 0 — Aviso de manutenção (replanejamento pausado) */}
      {replanInfo?.replanPaused && (
        <div className="flex items-start sm:items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-lg px-2.5 py-2">
          <Wrench className="w-3.5 h-3.5 shrink-0 mt-0.5 sm:mt-0 text-sky-600" />
          <p className="text-[12px] leading-snug">
            <span className="font-bold text-sky-600">Replanejamento pausado temporariamente.</span>{" "}
            <span className="text-sky-600/80">Nenhum novo reajuste será gerado.</span>
          </p>
        </div>
      )}

      {/* Aviso de reajuste automático */}
      {showBanner && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#2563EB]/10 border border-[#2563EB]/20 rounded-xl px-3.5 py-2.5">
          <p className="text-xs font-bold text-[#2563EB] flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            🔄 Cronograma reajustado — {lastEvent.message}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPendencies((v) => !v)}
              className="h-7 px-2.5 text-[11px] font-bold text-[#2563EB] rounded-lg cursor-pointer"
            >
              {showPendencies ? "Ocultar alterações" : "Ver alterações"}
            </Button>
            {!lastEvent.critical && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUndo(lastEvent.id)}
                disabled={busy}
                className="h-7 px-2.5 text-[11px] font-bold text-muted-foreground rounded-lg cursor-pointer"
              >
                <Undo2 className="w-3 h-3 mr-1" /> Desfazer
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Painel de pendências */}
      {showPendencyPanel && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Pendências de estudos anteriores
            </h4>
            <span className="text-xs font-black text-amber-700 font-mono">
              Total: {formatMinutes(replanInfo?.totalPendingMinutes ?? 0)}
            </span>
          </div>

          <div className="space-y-1.5">
            {(replanInfo?.pendingByDiscipline ?? []).map((p) => (
              <div
                key={p.disciplineId}
                className="flex items-center justify-between bg-background/60 rounded-lg px-2.5 py-1.5"
              >
                <span className="text-xs font-semibold text-foreground">{p.disciplineName}</span>
                <span className="text-xs font-bold text-amber-700 font-mono">
                  {formatMinutes(p.pendingMinutes)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={replanInfo?.enabled ?? true}
                onChange={(e) => void handleToggleAuto(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#2563EB] cursor-pointer"
              />
              Reajustar automaticamente meu cronograma
            </label>
            {!replanInfo?.enabled && (
              <Button
                size="sm"
                onClick={() => void handleManualReplan()}
                disabled={busy || replanInfo?.replanPaused}
                className="h-8 px-3 text-[11px] font-bold bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-lg cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${busy ? "animate-spin" : ""}`} />
                {replanInfo?.replanPaused ? "Pausado" : "Recalcular cronograma"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Linha 2: Pílulas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 border-b pb-4">
        <div className="bg-muted/40 rounded-xl p-2.5 px-3.5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">
            Carga do Dia
          </span>
          <span className="text-xs sm:text-sm font-black text-foreground font-mono">
            {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min
          </span>
        </div>

        <div className="bg-emerald-500/10 rounded-xl p-2.5 px-3.5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-emerald-600 tracking-wider">
            Estudado
          </span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 font-mono">
            {Math.floor(completedMinutes / 60)}h {completedMinutes % 60}min
          </span>
        </div>

        <div className="bg-amber-500/10 rounded-xl p-2.5 px-3.5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-amber-600 tracking-wider">
            Pendente
          </span>
          <span className="text-xs sm:text-sm font-black text-amber-700 font-mono">
            {pendingLabel}
          </span>
        </div>
      </div>

      {/* Linha 3: Cronograma do Dia */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Cronograma do Dia
          </h3>
          <span className="text-xs font-bold text-[#2563EB]">
            {scheduledTasks.length} matéria{scheduledTasks.length !== 1 ? "s" : ""} programada
            {scheduledTasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        {scheduledTasks.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="space-y-2.5">
            {scheduledTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 border rounded-xl hover:border-primary/40 transition-all bg-muted/20"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-1.5 self-stretch rounded-full"
                    style={{ backgroundColor: task.color }}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {task.timeSlot}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                        {task.durationMinutes} min
                      </span>
                      {task.origin !== "BASE" && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#2563EB]/10 text-[#2563EB]">
                          Pendência
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-foreground">{task.disciplineName}</h4>
                    <p className="text-xs text-muted-foreground">
                      {getTaskProgressText(
                        task.completed,
                        task.studiedMinutes,
                        task.durationMinutes,
                        task.manuallyClosed,
                        task.manualPendingMinutes,
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {task.completed ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" />
                      {task.manuallyClosed ? "Concluído hoje" : "Concluído"}
                    </span>
                  ) : (
                    <>
                      {!task.manuallyClosed && task.studiedMinutes > 0 && isToday && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBlockToClose(task)}
                          className="h-9 px-3 text-xs font-bold rounded-xl cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          Marcar como concluído hoje
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          toast.success(`Iniciando estudo de ${task.disciplineName}`)
                          router.push(`/dashboard/study-session?planId=${task.itemId ?? task.id}`)
                        }}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 rounded-xl shadow-xs cursor-pointer"
                      >
                        <PlayCircle className="w-4 h-4 mr-1.5" />
                        Iniciar Estudo
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
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
    </div>
  )
}
