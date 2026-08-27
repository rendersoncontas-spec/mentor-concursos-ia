"use client"

import { useEffect, useState } from "react"

import {
  Briefcase,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Tag,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { getReplanInfoAction } from "@/application/study-plan/replan/adaptive-replan.actions"
import { type ReplanInfoPayload } from "@/application/study-plan/replan/adaptive-replan.service"
import {
  CUSTOM_SCALE_RE,
  LS_SHIFT_ANCHOR_DATE,
  type ScheduleMode,
} from "@/features/planejamento/lib/planning-form"
import {
  getSavedScaleConfig,
  getStudyPlanDay,
  isDutyShiftDate,
  WEEKDAY_KEYS,
  type SharedPlanConfig,
} from "@/features/planejamento/lib/study-plan-shared"
import { STUDY_SESSION_SAVED_EVENT } from "@/features/study-session/lib/study-session-events"

import { type StudyCycleBlock } from "./planning-view"

function getEventCardClass(isDone: boolean, isPastOrToday: boolean): string {
  if (isDone) return "bg-emerald-500/10 border-emerald-500/50 hover:border-emerald-600"
  if (isPastOrToday) return "bg-rose-500/10 border-rose-500/40 hover:border-rose-600"
  return "bg-muted/30 border-muted hover:border-[#2563EB]"
}

export interface WeeklyStudyEvent {
  id: string
  discipline: string
  time: string
  date: string
  repeat: string
  topic: string
  dayOfWeekIndex: number // 0 (Dom) a 6 (Sáb)
  completed?: boolean
  color?: string
}

export function WeeklyPlanningView({
  blocks = [],
  history = [],
  onReplan: _onReplan,
  onRemove: _onRemove,
}: {
  blocks?: StudyCycleBlock[]
  history?: { date: string; disciplineId: string; minutes: number }[]
  onReplan?: () => void
  onRemove?: () => void
}) {
  const [events, setEvents] = useState<WeeklyStudyEvent[]>([])
  const [completedTaskIds, setCompletedTaskIds] = useState<Record<string, boolean>>({})

  // Configuração unificada de escala e plantão
  const [scaleConfig, setScaleConfig] = useState<SharedPlanConfig>(() => getSavedScaleConfig())

  const { scheduleMode, firstShiftDay, anchorShiftDate, studyDays, customShiftDays } = scaleConfig

  const [firstDayOfWeek, setFirstDayOfWeek] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_first_day_of_week")
      if (saved) return saved
    }
    return "Domingo"
  })

  useEffect(() => {
    const handleUpdate = () => {
      setScaleConfig(getSavedScaleConfig())
      const savedFirstDay = localStorage.getItem("mentor_user_first_day_of_week")
      if (savedFirstDay) setFirstDayOfWeek(savedFirstDay)
    }
    window.addEventListener("mentor_scale_updated", handleUpdate)
    window.addEventListener("storage", handleUpdate)
    return () => {
      window.removeEventListener("mentor_scale_updated", handleUpdate)
      window.removeEventListener("storage", handleUpdate)
    }
  }, [])

  const [replanInfo, setReplanInfo] = useState<ReplanInfoPayload | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const cached = localStorage.getItem("mentor_replan_info_cache")
      return cached ? (JSON.parse(cached) as ReplanInfoPayload) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await getReplanInfoAction({
          studyDays: scaleConfig.studyDays,
          scheduleMode: scaleConfig.scheduleMode,
          firstShiftDay: scaleConfig.firstShiftDay,
          anchorShiftDate: scaleConfig.anchorShiftDate || undefined,
        })
        if (active && res.data) {
          setReplanInfo(res.data)
          try {
            localStorage.setItem("mentor_replan_info_cache", JSON.stringify(res.data))
          } catch {}
        }
      } catch {}
    }
    load()
    const handleSaved = () => {
      load()
    }
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, handleSaved)
    return () => {
      active = false
      window.removeEventListener(STUDY_SESSION_SAVED_EVENT, handleSaved)
    }
  }, [scaleConfig])

  const today = new Date()
  const todayDayIdx = today.getDay() // 0 a 6

  // Calcula os dias da semana atual respeitando firstDayOfWeek (Domingo = 0, Segunda = 1)
  const weekStartDay = firstDayOfWeek === "Segunda-feira" ? 1 : 0
  const diff = (today.getDay() - weekStartDay + 7) % 7
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - diff)

  const weekdayNames =
    weekStartDay === 1
      ? ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
      : ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

  const daysHeader = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    const dayOfWeekIndex = d.getDay()
    const padMonth = String(d.getMonth() + 1).padStart(2, "0")
    const padDay = String(d.getDate()).padStart(2, "0")
    const dateStr = `${d.getFullYear()}-${padMonth}-${padDay}`

    return {
      label: `${weekdayNames[i]}, ${d.getDate()}`,
      dayIdx: dayOfWeekIndex,
      dateNum: d.getDate(),
      dateStr,
      isToday:
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear(),
    }
  })

  const isShiftDay = (dateStr: string) => {
    return isDutyShiftDate(dateStr, scaleConfig)
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

  // Consulta exatamente a mesma fonte de dados do Calendário Mensal e Visão Diária
  const getEventsForDay = (dayIdx: number, dateStr: string) => {
    const custom = events.filter((e) => e.dayOfWeekIndex === dayIdx)
    if (custom.length > 0) {
      return custom.map((e) => ({
        ...e,
        completed: completedTaskIds[e.id] ?? !!e.completed,
      }))
    }

    const historyForDay = history.filter((h) => {
      const hDate = h.date.includes("T") ? h.date.split("T")[0] : h.date
      return hDate === dateStr
    })

    const dayInfo = getStudyPlanDay(dateStr, replanInfo, scaleConfig, blocks, historyForDay)

    if (dayInfo.isDutyShift || !dayInfo.isStudyDay || dayInfo.blocks.length === 0) {
      return []
    }

    return dayInfo.blocks.map((b, bIdx) => {
      const evtId = `server-${b.id || b.itemId}-${dateStr}-${bIdx}`
      return {
        id: evtId,
        discipline: b.disciplineName,
        disciplineId: b.disciplineId,
        time: `${b.durationMinutes} min`,
        date: `Dia ${dayIdx}`,
        repeat: "Semanal",
        topic:
          b.origin === "REAJUSTE" || b.origin === "CRITICO"
            ? "Reajuste Adaptativo"
            : "Revisão e Questões",
        dayOfWeekIndex: dayIdx,
        completed: completedTaskIds[evtId] ?? b.completed,
        color: b.color || "#2563EB",
      }
    })
  }

  const toggleEventCompleted = (evtId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCompletedTaskIds((prev) => {
      const current = !prev[evtId]
      toast.success(
        current
          ? "Estudo concluído! 🟢 Meta diária atualizada."
          : "Estudo marcado como pendente. 🔴",
      )
      return { ...prev, [evtId]: current }
    })
  }

  // Modal Agendar / Editar Evento (Screenshot 4)
  const [isEventModalOpen, setIsEventModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [formDiscipline, setFormDiscipline] = useState("")
  const [formTime, setFormTime] = useState("01:00")
  const [formDate, setFormDate] = useState("02/08/2026")
  const [formRepeat, setFormRepeat] = useState("Não se repete")
  const [formTopic, setFormTopic] = useState("")
  const [formDayIndex, setFormDayIndex] = useState(0)

  const handleOpenAddModal = (dayIdx: number) => {
    setEditingEventId(null)
    setFormDiscipline("")
    setFormTime("01:00")
    setFormDate(`0${dayIdx + 2}/08/2026`)
    setFormRepeat("Não se repete")
    setFormTopic("")
    setFormDayIndex(dayIdx)
    setIsEventModalOpen(true)
  }

  const handleOpenEditModal = (evt: WeeklyStudyEvent) => {
    setEditingEventId(evt.id)
    setFormDiscipline(evt.discipline)
    setFormTime(evt.time)
    setFormDate(evt.date)
    setFormRepeat(evt.repeat)
    setFormTopic(evt.topic)
    setFormDayIndex(evt.dayOfWeekIndex)
    setIsEventModalOpen(true)
  }

  const handleSaveEvent = () => {
    if (!formDiscipline.trim()) {
      toast.error("Informe o nome da disciplina")
      return
    }

    if (editingEventId) {
      setEvents(
        events.map((e) =>
          e.id === editingEventId
            ? {
                ...e,
                discipline: formDiscipline,
                time: formTime,
                date: formDate,
                repeat: formRepeat,
                topic: formTopic,
                dayOfWeekIndex: formDayIndex,
              }
            : e,
        ),
      )
      toast.success("Estudo atualizado na agenda!")
    } else {
      const newEvt: WeeklyStudyEvent = {
        id: `evt-${Date.now()}`,
        discipline: formDiscipline,
        time: formTime,
        date: formDate,
        repeat: formRepeat,
        topic: formTopic,
        dayOfWeekIndex: formDayIndex,
        completed: false,
      }
      setEvents([...events, newEvt])
      toast.success("Novo estudo agendado!")
    }

    setIsEventModalOpen(false)
  }

  const handleDeleteEvent = () => {
    if (!editingEventId) return
    setEvents(events.filter((e) => e.id !== editingEventId))
    toast.success("Estudo removido da agenda.")
    setIsEventModalOpen(false)
  }

  const [activeAgendas, setActiveAgendas] = useState({
    revisoes: true,
    historico: true,
    planejamento: true,
  })

  return (
    <div className="space-y-6">
      {/* Legenda de Status de Meta */}
      <div className="flex items-center justify-between bg-card border rounded-2xl p-4 shadow-xs text-xs font-semibold">
        <span className="text-muted-foreground">Status da Meta Diária de Estudo:</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            🟢 Meta Batida
          </span>
          <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            🔴 Meta Incompleta / Pendente
          </span>
        </div>
      </div>

      {scheduleMode !== "normal" && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{getScaleLabel(scheduleMode)}:</strong> Rotação contínua automática para todos os meses (estudos zerados nos plantões).
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <span className="text-[11px] font-bold">Plantão de referência:</span>
            <input
              type="date"
              value={
                anchorShiftDate ||
                `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(firstShiftDay).padStart(2, "0")}`
              }
              onChange={(e) => {
                const val = e.target.value
                if (val) {
                  setScaleConfig((prev) => ({ ...prev, anchorShiftDate: val }))
                  if (typeof window !== "undefined") {
                    localStorage.setItem(LS_SHIFT_ANCHOR_DATE, val)
                    window.dispatchEvent(new Event("mentor_scale_updated"))
                  }
                  toast.success("Data de referência do plantão atualizada!")
                }
              }}
              className="bg-card border rounded-lg px-2.5 py-1 text-xs font-bold text-foreground focus:outline-none cursor-pointer font-mono shadow-xs"
            />
          </div>
        </div>
      )}

      {/* Main Weekly Agenda Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Coluna Esquerda: Grade da Agenda Semanal (3 Colunas no Grid Layout) */}
        <div className="lg:col-span-3 rounded-2xl border bg-card p-5 shadow-xs space-y-4">
          {/* Header da Agenda com Mês/Ano + Navegação + Dropdown Semanal */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" className="p-1 hover:bg-muted rounded-md text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-[#2563EB]">
                {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </h2>
              <button type="button" className="p-1 hover:bg-muted rounded-md text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <Button
              variant="outline"
              className="border-purple-300 text-purple-700 font-bold text-xs h-8 gap-1.5 rounded-xl"
            >
              Semanal ▾
            </Button>
          </div>

          {/* Grade dos 7 Dias da Semana */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 min-w-[720px] border rounded-xl overflow-hidden min-h-[460px]">
              {daysHeader.map((d) => {
                const dayDateStr = d.dateStr
                const isDuty = scheduleMode !== "normal" && isShiftDay(dayDateStr)
                const isOffDay =
                  scheduleMode === "normal" && !studyDays.includes(WEEKDAY_KEYS[d.dayIdx] ?? "")
                const dayEvts = isDuty || isOffDay ? [] : getEventsForDay(d.dayIdx, dayDateStr)
                const hasEvts = dayEvts.length > 0
                const isAllCompleted = hasEvts && dayEvts.every((e) => e.completed)
                const isPastOrToday = d.dayIdx <= todayDayIdx

                // Header color rules: Green if goal met, Red if past/today & missed, Blue for today uncompleted, Muted for future
                let headerStyle = "bg-muted/40 text-foreground"
                let statusTag = null

                if (hasEvts) {
                  if (isAllCompleted) {
                    headerStyle = "bg-emerald-600 text-white font-black"
                    statusTag = "🟢 Meta Batida"
                  } else if (isPastOrToday) {
                    headerStyle = "bg-rose-600 text-white font-black"
                    statusTag = "🔴 Incompleta"
                  } else {
                    headerStyle = "bg-[#2563EB] text-white font-black"
                    statusTag = "📅 Programado"
                  }
                } else if (isDuty) {
                  headerStyle = "bg-rose-500/10 text-rose-500 font-black border-b-rose-500/20"
                  statusTag = "🚨 Plantão"
                }

                return (
                  <div key={d.label} className="border-r last:border-r-0 flex flex-col">
                    {/* Cabeçalho do Dia */}
                    <div
                      className={`py-2 px-1 text-center text-[11px] border-b flex flex-col items-center justify-center gap-0.5 ${headerStyle}`}
                    >
                      <span>{d.label}</span>
                      {statusTag && (
                        <span className="text-[9px] font-extrabold opacity-90 tracking-tight">
                          {statusTag}
                        </span>
                      )}
                    </div>

                    {/* Corpo do Dia com Botão + e Cards de Estudo */}
                    <div className="p-2 flex-1 space-y-2">
                      {isDuty && (
                        <div className="text-center py-8">
                          <p className="text-[10px] font-bold text-rose-500/80 bg-rose-500/10 p-2 rounded-md">
                            Sem estudos (Plantão)
                          </p>
                        </div>
                      )}
                      {isOffDay && (
                        <div className="text-center py-8">
                          <p className="text-[10px] font-bold text-muted-foreground bg-muted p-2 rounded-md">
                            Folga Programada
                          </p>
                        </div>
                      )}
                      {!isDuty && !isOffDay && (
                        <>
                          {/* Botão Escuro de Adicionar Evento no Dia (+ button) */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddModal(d.dayIdx)}
                            className="w-full py-1.5 bg-slate-500 hover:bg-slate-600 text-white rounded-md flex items-center justify-center transition-colors shadow-xs"
                          >
                            <Plus className="h-4 w-4" />
                          </button>

                            {/* Cards de Estudos Agendados no Dia */}
                            {dayEvts.map((evt) => {
                              const isDone = evt.completed

                              return (
                                <div
                                  key={evt.id}
                                  onClick={() => handleOpenEditModal(evt)}
                                  className={`p-2 rounded-lg border cursor-pointer transition-all space-y-1.5 text-left relative group ${getEventCardClass(isDone, isPastOrToday)}`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <h4
                                      className={`text-[11px] font-extrabold leading-tight truncate ${
                                        isDone
                                          ? "text-emerald-700 dark:text-emerald-300 opacity-80"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {evt.discipline}
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={(e) => toggleEventCompleted(evt.id, e)}
                                      className={`shrink-0 text-xs ${isDone ? "text-emerald-600" : "text-rose-500 hover:text-emerald-500"}`}
                                      title={
                                        isDone
                                          ? "Concluído (Clique para alternar)"
                                          : "Marcar como concluído"
                                      }
                                    >
                                      {isDone ? "🟢" : "⭕"}
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-between text-[10px]">
                                    <span
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold font-mono ${
                                        isDone
                                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                          : "bg-primary/10 text-primary"
                                      }`}
                                    >
                                      <Clock className="h-3 w-3" />
                                      {evt.time}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </>
                        )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Mini Calendário + Agendas (Screenshot 3) */}
        <div className="space-y-6">
          {/* Mini Calendário Mensal */}
          <div className="rounded-2xl border bg-card p-4 shadow-xs space-y-3 text-center">
            <div className="flex items-center justify-between text-xs font-extrabold text-foreground border-b pb-2">
              <span className="text-muted-foreground uppercase text-[10px]">AGO.</span>
              <div className="flex items-center gap-1 font-mono text-[11px] text-[#2563EB]">
                <ChevronLeft className="h-3.5 w-3.5 cursor-pointer" />
                <span>02/08 ~ 08/08</span>
                <ChevronRight className="h-3.5 w-3.5 cursor-pointer" />
              </div>
            </div>

            {/* Dias da Semana (D S T Q Q S S) */}
            <div className="grid grid-cols-7 text-[10px] font-bold text-muted-foreground gap-1">
              <span>D</span>
              <span>S</span>
              <span>T</span>
              <span>Q</span>
              <span>Q</span>
              <span>S</span>
              <span>S</span>
            </div>

            {/* Grade Numérica dos Dias do Mês */}
            <div className="grid grid-cols-7 text-[11px] font-semibold gap-1">
              <span className="text-muted-foreground/40">26</span>
              <span className="text-muted-foreground/40">27</span>
              <span className="text-muted-foreground/40">28</span>
              <span className="text-muted-foreground/40">29</span>
              <span className="text-muted-foreground/40">30</span>
              <span className="text-muted-foreground/40">31</span>
              <span>1</span>

              {/* Semana Ativa Destacada */}
              <span className="bg-[#dbeafe] text-[#2563EB] font-bold rounded-md py-0.5">2</span>
              <span className="bg-[#dbeafe] text-[#2563EB] font-bold rounded-md py-0.5">3</span>
              <span className="bg-[#dbeafe] text-[#2563EB] font-bold rounded-md py-0.5">4</span>
              <span className="bg-[#dbeafe] text-[#2563EB] font-bold rounded-md py-0.5">5</span>
              <span className="bg-[#2563EB] text-white font-bold rounded-md py-0.5 shadow-xs">
                6
              </span>
              <span className="bg-[#dbeafe] text-[#2563EB] font-bold rounded-md py-0.5">7</span>
              <span className="bg-[#dbeafe] text-[#2563EB] font-bold rounded-md py-0.5">8</span>

              <span>9</span>
              <span>10</span>
              <span>11</span>
              <span>12</span>
              <span>13</span>
              <span>14</span>
              <span>15</span>
              <span>16</span>
              <span>17</span>
              <span>18</span>
              <span>19</span>
              <span>20</span>
              <span>21</span>
              <span>22</span>
              <span>23</span>
              <span>24</span>
              <span>25</span>
              <span>26</span>
              <span>27</span>
              <span>28</span>
              <span>29</span>
              <span>30</span>
              <span>31</span>
            </div>
          </div>

          {/* Seção MINHAS AGENDAS */}
          <div className="rounded-2xl border bg-card p-4 shadow-xs space-y-3">
            <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider block border-b pb-2">
              MINHAS AGENDAS
            </span>

            <div className="space-y-2 text-xs font-bold">
              <label className="flex items-center gap-2 cursor-pointer text-foreground">
                <input
                  type="checkbox"
                  checked={activeAgendas.revisoes}
                  onChange={(e) =>
                    setActiveAgendas({ ...activeAgendas, revisoes: e.target.checked })
                  }
                  className="rounded text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>REVISÕES</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-foreground">
                <input
                  type="checkbox"
                  checked={activeAgendas.historico}
                  onChange={(e) =>
                    setActiveAgendas({ ...activeAgendas, historico: e.target.checked })
                  }
                  className="rounded text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>HISTÓRICO</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-foreground">
                <input
                  type="checkbox"
                  checked={activeAgendas.planejamento}
                  onChange={(e) =>
                    setActiveAgendas({ ...activeAgendas, planejamento: e.target.checked })
                  }
                  className="rounded text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>PLANEJAMENTO</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Agendar Estudo / Evento */}
      <Dialog open={isEventModalOpen} onOpenChange={setIsEventModalOpen}>
        <DialogContent className="sm:max-w-md p-6 rounded-2xl">
          <div className="space-y-5">
            {/* Header com Ícone de Lixeira no canto esquerdo e Fechar */}
            <div className="flex items-center justify-between border-b pb-3">
              {editingEventId ? (
                <button
                  type="button"
                  onClick={handleDeleteEvent}
                  className="text-emerald-400 hover:text-rose-500 transition-colors p-1"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              ) : (
                <div />
              )}
            </div>

            {/* Formulário com Ícones e Underline Verde-Água (Screenshot 4) */}
            <div className="space-y-4">
              {/* Campo 1: Disciplina */}
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full border-2 border-muted-foreground flex items-center justify-center shrink-0" />
                <Input
                  type="text"
                  placeholder="Disciplina"
                  value={formDiscipline}
                  onChange={(e) => setFormDiscipline(e.target.value)}
                  className="border-0 border-b border-[#2563EB] rounded-none shadow-none px-0 text-sm font-bold placeholder:text-muted-foreground/60 focus-visible:ring-0"
                />
              </div>

              {/* Campo 2: Horário / Duração */}
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  placeholder="00:00"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="border-0 border-b border-[#2563EB] rounded-none shadow-none px-0 text-sm font-bold font-mono focus-visible:ring-0"
                />
              </div>

              {/* Campo 3: Data com Calendário */}
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="border-0 border-b border-[#2563EB] rounded-none shadow-none px-0 text-sm font-bold font-mono focus-visible:ring-0"
                />
              </div>

              {/* Campo 4: Recorrência Dropdown */}
              <div className="flex items-center gap-3 pl-8">
                <select
                  value={formRepeat}
                  onChange={(e) => setFormRepeat(e.target.value)}
                  className="w-full border-0 border-b border-[#2563EB] bg-transparent text-xs font-bold text-foreground py-1 focus:outline-none cursor-pointer"
                >
                  <option value="Não se repete">Não se repete</option>
                  <option value="Todos os dias">Todos os dias</option>
                  <option value="Semanalmente">Semanalmente</option>
                </select>
              </div>

              {/* Campo 5: Tópico com Marcador */}
              <div className="flex items-center gap-3">
                <Tag className="h-5 w-5 text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  placeholder="Tópico"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  className="border-0 border-b border-[#2563EB] rounded-none shadow-none px-0 text-sm font-bold focus-visible:ring-0"
                />
              </div>
            </div>

            {/* Botão Salvar (Screenshot 4) */}
            <div className="pt-2">
              <Button
                type="button"
                onClick={handleSaveEvent}
                className="w-full bg-[#dbeafe] hover:bg-[#2563EB] text-[#2563EB] hover:text-white font-bold text-xs py-5 rounded-xl transition-all shadow-xs"
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
