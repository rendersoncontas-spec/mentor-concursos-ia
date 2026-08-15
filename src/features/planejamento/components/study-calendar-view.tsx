"use client"

import { useEffect, useState } from "react"

import { useRouter } from "next/navigation"

import {
  BookOpen,
  Briefcase,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  PlayCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getStudyDaysCount, isShiftDayForScale } from "@/features/planejamento/lib/planning-form"

import { type StudyCycleBlock } from "./planning-view"

type ScheduleMode = "normal" | "12x36" | "24x72" | "24x48" | "5x1" | "6x1" | "4x2"

const SCHEDULE_MODES: readonly ScheduleMode[] = [
  "normal",
  "12x36",
  "24x72",
  "24x48",
  "5x1",
  "6x1",
  "4x2",
]
const WEEKDAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const

const CUSTOM_SCALE_RE = /^custom_(\d+)x(\d+)$/

/** Aceita as escalas fixas e também o formato custom_XxY salvo pelo wizard. */
function isScheduleMode(value: string | null): value is ScheduleMode {
  return (
    value !== null &&
    (SCHEDULE_MODES.includes(value as ScheduleMode) || CUSTOM_SCALE_RE.test(value))
  )
}

function getDayCellClass(isToday: boolean, onShift: boolean): string {
  if (isToday) return "border-primary bg-primary/5 shadow-xs"
  if (onShift) return "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60"
  return "bg-card border-border hover:border-primary/50 hover:shadow-xs"
}

function getDayNumberClass(isToday: boolean, onShift: boolean): string {
  if (isToday) return "bg-primary text-primary-foreground"
  if (onShift) return "bg-rose-500 text-white"
  return "text-foreground group-hover:text-primary"
}

function getDaySummary(
  onShift: boolean,
  scheduleMode: ScheduleMode,
  disciplinesCount: number,
): string {
  if (onShift && scheduleMode !== "normal") return "Escala 24h"
  if (disciplinesCount > 0) return `${disciplinesCount} matérias`
  return "Folga"
}

interface StudyCalendarViewProps {
  blocks: StudyCycleBlock[]
  onReplan?: () => void
}

export function StudyCalendarView({ blocks, onReplan: _onReplan }: StudyCalendarViewProps) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dayNum: number
    fullDate: Date
  } | null>(null)

  // Escala de Trabalho (Normal | 12x36 | 24x72 | 24x48 | 5x1 | 6x1 | 4x2)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_work_scale")
      if (isScheduleMode(saved)) return saved
    }
    return "24x72"
  })

  const [firstShiftDay, setFirstShiftDay] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_first_shift_day")
      if (saved) return parseInt(saved)
    }
    return 2
  }) // Primeiro plantão padrão dia 2
  const [customShiftDays, setCustomShiftDays] = useState<
    Record<string, "PLANTAO" | "FOLGA_ESTUDO" | "FOLGA_TOTAL">
  >({})

  const [studyDays, setStudyDays] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_study_days")
      if (saved) return JSON.parse(saved)
    }
    return ["seg", "ter", "qua", "qui", "sex", "sab"] // Padrão
  })

  useEffect(() => {
    const handleUpdate = () => {
      const savedScale = localStorage.getItem("mentor_user_work_scale")
      if (isScheduleMode(savedScale)) setScheduleMode(savedScale)
      const savedFirstDay = localStorage.getItem("mentor_user_first_shift_day")
      if (savedFirstDay) setFirstShiftDay(parseInt(savedFirstDay))
      const savedStudyDays = localStorage.getItem("mentor_user_study_days")
      if (savedStudyDays) setStudyDays(JSON.parse(savedStudyDays))
    }
    window.addEventListener("mentor_scale_updated", handleUpdate)
    return () => window.removeEventListener("mentor_scale_updated", handleUpdate)
  }, [])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthName = currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const handleGoToday = () => {
    setCurrentDate(new Date())
  }

  const handleSelectScale = (mode: ScheduleMode) => {
    setScheduleMode(mode)
    if (typeof window !== "undefined") {
      localStorage.setItem("mentor_user_work_scale", mode)
      window.dispatchEvent(new Event("mentor_scale_updated"))
    }
    toast.success(`Escala alterada para: ${mode}`)
  }

  const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

  // Build grid items
  const calendarCells = []
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarCells.push({ isPadding: true, dayNum: 0, key: `pad-${i}` })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({ isPadding: false, dayNum: d, key: `day-${d}` })
  }

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  // Helper to format hours cleanly (e.g. 1.716666h -> 1h43m or 1.7h)
  const formatHoursClean = (minutes: number) => {
    const hrs = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    if (hrs === 0) return `${mins}m`
    if (mins === 0) return `${hrs}h`
    return `${hrs}h${mins.toString().padStart(2, "0")}m`
  }

  // Verifica se determinado dia é Plantão / Trabalho
  const isShiftDay = (dayNum: number) => {
    const key = `${year}-${month}-${dayNum}`
    if (customShiftDays[key] === "PLANTAO") return true
    if (customShiftDays[key] === "FOLGA_ESTUDO") return false

    return isShiftDayForScale(dayNum, firstShiftDay, scheduleMode)
  }

  // Helper para buscar disciplinas agendadas no dia
  const getDisciplinesForDay = (dayNum: number) => {
    if (blocks.length === 0) return []

    const onShift = isShiftDay(dayNum)

    // Se estiver de Plantão, folga total de estudos nesse dia
    if (onShift && scheduleMode !== "normal") return []

    // No modo normal, usamos os dias selecionados pelo usuário
    if (scheduleMode === "normal") {
      const dayOfWeek = new Date(year, month, dayNum).getDay()
      if (!studyDays.includes(WEEKDAY_KEYS[dayOfWeek] ?? "")) return []
    }

    // Dias de estudo ativos na semana conforme a escala
    const studyDaysCount = getStudyDaysCount(scheduleMode, studyDays)
    const totalCycleMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
    const targetDailyMinutes = Math.max(30, Math.round(totalCycleMinutes / studyDaysCount))

    const blocksPerDay = Math.max(1, Math.round(blocks.length / studyDaysCount))
    const startIndex = (dayNum * blocksPerDay) % blocks.length

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
  }

  // Alterna o status do dia selecionado entre Plantão, Estudo e Folga
  const toggleDayStatus = (dayNum: number, status: "PLANTAO" | "FOLGA_ESTUDO") => {
    const key = `${year}-${month}-${dayNum}`
    setCustomShiftDays((prev) => ({
      ...prev,
      [key]: prev[key] === status ? "FOLGA_ESTUDO" : status,
    }))
    toast.success(
      `Dia ${dayNum} atualizado para ${status === "PLANTAO" ? "Plantão 🚨" : "Estudo 📚"}`,
    )
  }

  const getScaleLabel = (mode: string) => {
    const custom = CUSTOM_SCALE_RE.exec(mode)
    if (custom) return `Escala personalizada (Trabalha ${custom[1]}d / Folga ${custom[2]}d)`
    switch (mode) {
      case "12x36":
        return "Escala 12x36 (Plantão 12h / Folga 36h)"
      case "24x72":
        return "Escala 24x72 (Plantão 24h / Folga 72h)"
      case "24x48":
        return "Escala 24x48 (Plantão 24h / Folga 48h)"
      case "5x1":
        return "Escala 5x1 (Trabalha 5d / Folga 1d)"
      case "6x1":
        return "Escala 6x1 (Trabalha 6d / Folga 1d)"
      case "4x2":
        return "Escala 4x2 (Trabalha 4d / Folga 2d)"
      default:
        return "Padrão (Folga aos Domingos)"
    }
  }

  return (
    <div className="space-y-6">
      {/* Calendar Top Controls */}
      <div className="bg-card border rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-foreground capitalize">{monthName}</h2>
            <p className="text-xs text-muted-foreground font-medium">
              Cronograma com Escala de Trabalho & Plantões
            </p>
          </div>
        </div>

        {/* Controles de Escala (Select com todas as escalas) */}
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-xl border">
            <Briefcase className="w-4 h-4 text-primary shrink-0" />
            <select
              value={scheduleMode}
              onChange={(e) => {
                if (isScheduleMode(e.target.value)) handleSelectScale(e.target.value)
              }}
              className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="24x72">🚨 Escala 24x72 (Plantão 24h)</option>
              <option value="12x36">🚨 Escala 12x36 (Plantão 12h)</option>
              <option value="24x48">🚨 Escala 24x48 (Plantão 24h)</option>
              <option value="5x1">📅 Escala 5x1</option>
              <option value="6x1">📅 Escala 6x1</option>
              <option value="4x2">📅 Escala 4x2</option>
              <option value="normal">☀️ Padrão (Seg-Sáb)</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevMonth}
              className="h-9 w-9 rounded-xl"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToday}
              className="h-9 rounded-xl text-xs font-bold"
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              className="h-9 w-9 rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Informação da Escala Selecionada */}
      {scheduleMode !== "normal" && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{getScaleLabel(scheduleMode)}:</strong> Os estudos são zerados nos dias de
              plantão/trabalho e concentrados nas folgas!
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px]">Primeiro plantão do mês:</span>
            <select
              value={firstShiftDay}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1
                setFirstShiftDay(val)
                if (typeof window !== "undefined") {
                  localStorage.setItem("mentor_user_first_shift_day", val.toString())
                  window.dispatchEvent(new Event("mentor_scale_updated"))
                }
              }}
              className="bg-card border rounded-lg px-2 py-1 text-xs font-bold text-foreground focus:outline-none"
            >
              {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Dia {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Grid View */}
      <div className="bg-card border rounded-2xl p-4 shadow-xs">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 mb-2 text-center">
          {daysOfWeek.map((day, idx) => (
            <div
              key={day}
              className={`py-2 text-xs font-extrabold uppercase tracking-wider ${
                idx === 0 ? "text-rose-500" : "text-muted-foreground"
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Cells */}
        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((cell) => {
            if (cell.isPadding) {
              return (
                <div
                  key={cell.key}
                  className="h-28 rounded-xl bg-muted/10 border border-transparent"
                />
              )
            }

            const dayNum = cell.dayNum
            const isToday = isCurrentMonth && today.getDate() === dayNum
            const onShift = isShiftDay(dayNum)
            const dayDisciplines = getDisciplinesForDay(dayNum)
            const totalMinutes = dayDisciplines.reduce(
              (acc, b) => acc + (b?.durationMinutes || 0),
              0,
            )
            const isScheduledBreak =
              scheduleMode === "normal" &&
              !studyDays.includes(WEEKDAY_KEYS[new Date(year, month, dayNum).getDay()] ?? "")
            let dayBadge = (
              <span className="text-[9px] font-semibold text-muted-foreground">Folga</span>
            )
            if (totalMinutes > 0) {
              dayBadge = (
                <span className="text-[10px] font-extrabold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                  {formatHoursClean(totalMinutes)}
                </span>
              )
            }
            if (onShift && scheduleMode !== "normal") {
              dayBadge = (
                <span className="text-[9px] font-extrabold text-rose-500 bg-rose-500/15 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  🚨 Plantão
                </span>
              )
            }

            return (
              <div
                key={cell.key}
                onClick={() =>
                  setSelectedDayDetail({ dayNum, fullDate: new Date(year, month, dayNum) })
                }
                className={`h-28 rounded-xl p-2 border transition-all cursor-pointer flex flex-col justify-between group ${getDayCellClass(isToday, onShift)}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${getDayNumberClass(isToday, onShift)}`}
                  >
                    {dayNum}
                  </span>

                  {dayBadge}
                </div>

                <div className="space-y-1 overflow-hidden my-1">
                  {onShift && scheduleMode !== "normal" && (
                    <div className="text-[10px] font-bold text-rose-500/80 bg-rose-500/10 p-1 rounded-md text-center">
                      Sem estudos (Plantão 24h)
                    </div>
                  )}
                  {!onShift && isScheduledBreak && (
                    <div className="text-[10px] font-bold text-muted-foreground bg-muted p-1 rounded-md text-center">
                      Folga Programada
                    </div>
                  )}
                  {(!onShift || scheduleMode === "normal") && !isScheduledBreak && (
                    <>
                      {dayDisciplines.slice(0, 2).map((disc, idx) => (
                        <div
                          key={`${disc.id}-${idx}`}
                          className="text-[10px] font-semibold truncate px-1.5 py-0.5 rounded-md text-white flex items-center gap-1 shadow-2xs"
                          style={{ backgroundColor: disc.color || "#2563EB" }}
                        >
                          <span className="w-1 h-1 rounded-full bg-white shrink-0" />
                          <span className="truncate">{disc.disciplineName}</span>
                        </div>
                      ))}
                      {dayDisciplines.length > 2 && (
                        <span className="text-[9px] text-muted-foreground font-bold">
                          +{dayDisciplines.length - 2} mais
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="text-[9px] text-muted-foreground font-medium flex items-center justify-between">
                  <span>{getDaySummary(onShift, scheduleMode, dayDisciplines.length)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day Detail Modal */}
      <Dialog open={Boolean(selectedDayDetail)} onOpenChange={() => setSelectedDayDetail(null)}>
        <DialogContent className="sm:max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground capitalize flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {selectedDayDetail?.fullDate.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {selectedDayDetail && (
              <>
                {/* Botões de Alteração Rápida de Plantão / Folga */}
                <div className="flex items-center gap-2 bg-muted p-2 rounded-xl">
                  <span className="text-xs font-bold text-muted-foreground flex-1">
                    Status deste Dia:
                  </span>
                  <Button
                    size="sm"
                    variant={isShiftDay(selectedDayDetail.dayNum) ? "destructive" : "outline"}
                    onClick={() => toggleDayStatus(selectedDayDetail.dayNum, "PLANTAO")}
                    className="text-xs font-bold rounded-lg h-8"
                  >
                    🚨 Plantão (24h)
                  </Button>
                  <Button
                    size="sm"
                    variant={!isShiftDay(selectedDayDetail.dayNum) ? "secondary" : "outline"}
                    onClick={() => toggleDayStatus(selectedDayDetail.dayNum, "FOLGA_ESTUDO")}
                    className="text-xs font-bold rounded-lg h-8"
                  >
                    📚 Dia de Estudo
                  </Button>
                </div>

                {isShiftDay(selectedDayDetail.dayNum) && (
                  <div className="py-8 text-center space-y-2 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                    <Briefcase className="w-8 h-8 text-rose-500 mx-auto" />
                    <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
                      Dia de Plantão de 24 horas
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Suas matérias de estudo foram remanejadas para os seus dias de folga da
                      escala.
                    </p>
                  </div>
                )}
                {!isShiftDay(selectedDayDetail.dayNum) &&
                  getDisciplinesForDay(selectedDayDetail.dayNum).length === 0 && (
                    <div className="py-8 text-center space-y-2">
                      <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                      <p className="text-sm font-bold text-muted-foreground">
                        Dia livre de estudos agendados!
                      </p>
                    </div>
                  )}
                {!isShiftDay(selectedDayDetail.dayNum) &&
                  getDisciplinesForDay(selectedDayDetail.dayNum).length > 0 && (
                    <div className="space-y-3">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Disciplinas Programadas
                      </span>
                      {getDisciplinesForDay(selectedDayDetail.dayNum).map((disc) => (
                        <div
                          key={disc.id}
                          className="p-3 border rounded-xl flex items-center justify-between bg-muted/20"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-2.5 h-8 rounded-full"
                              style={{ backgroundColor: disc.color }}
                            />
                            <div>
                              <h4 className="font-bold text-sm text-foreground">
                                {disc.disciplineName}
                              </h4>
                              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {disc.durationMinutes} minutos (
                                {formatHoursClean(disc.durationMinutes)})
                              </span>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedDayDetail(null)
                              toast.success(`Iniciando ${disc.disciplineName}`)
                              router.push(`/dashboard/study-session?planId=${disc.id}`)
                            }}
                            className="font-bold text-xs rounded-xl"
                          >
                            <PlayCircle className="w-4 h-4 mr-1" />
                            Estudar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
