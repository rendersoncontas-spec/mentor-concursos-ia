"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  PlayCircle, 
  CheckCircle2, 
  Calendar as CalendarIcon,
  BookOpen,
  Coffee,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { type StudyCycleBlock } from "./estudei-planning-view"

interface DailyPlanningViewProps {
  blocks: StudyCycleBlock[]
  onReplan?: () => void
  onSwitchToCiclo?: () => void
}

export function DailyPlanningView({ blocks, onReplan, onSwitchToCiclo }: DailyPlanningViewProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  // Escala de Trabalho e Dias de Estudo salvos
  const [scheduleMode, setScheduleMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_work_scale")
      if (saved) return saved
    }
    return "normal"
  })

  const [firstShiftDay, setFirstShiftDay] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_first_shift_day")
      if (saved) return parseInt(saved)
    }
    return 2
  })

  const [studyDays, setStudyDays] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mentor_user_study_days")
      if (saved) return JSON.parse(saved)
    }
    return ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
  })

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

  // Formatting date
  const dateFormatted = selectedDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
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

  // Checa se o dia é de plantão na escala de trabalho
  const isShiftDay = (dayNum: number) => {
    const dayDiff = dayNum - firstShiftDay
    if (scheduleMode === "12x36") return dayDiff >= 0 && dayDiff % 2 === 0
    if (scheduleMode === "24x72") return dayDiff >= 0 && dayDiff % 4 === 0
    if (scheduleMode === "24x48") return dayDiff >= 0 && dayDiff % 3 === 0
    if (scheduleMode === "5x1") return dayDiff >= 0 && dayDiff % 6 === 0
    if (scheduleMode === "6x1") return dayDiff >= 0 && dayDiff % 7 === 0
    if (scheduleMode === "4x2") return dayDiff >= 0 && (dayDiff % 6 === 0 || (dayDiff - 1) % 6 === 0)
    return false
  }

  // Total cycle workload in minutes
  const totalCycleMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const activeDaysCount = Math.max(1, studyDays.length)
  const targetDailyMinutes = totalCycleMinutes > 0 
    ? Math.max(30, Math.round(totalCycleMinutes / activeDaysCount)) 
    : 180

  const dayOfWeek = selectedDate.getDay() // 0 = Dom, 1 = Seg...
  const dateNum = selectedDate.getDate()
  const daysMap = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]
  const currentDayId = daysMap[dayOfWeek] || "dom"

  const dayBlocks = (() => {
    if (blocks.length === 0) return []

    // Verificar escala de trabalho ou dia de estudos
    if (scheduleMode !== "normal" && isShiftDay(dateNum)) {
      return [] // Plantão de trabalho
    }

    if (!studyDays.includes(currentDayId)) {
      return [] // Dia de descanso não selecionado
    }

    const blocksPerDay = Math.max(1, Math.round(blocks.length / activeDaysCount))
    const dayOfYear = Math.floor((selectedDate.getTime() - new Date(selectedDate.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
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

  // Distribution of day-specific blocks across hours for the daily schedule
  const scheduledTasks = dayBlocks.map((block, idx) => {
    const hourStart = 8 + idx * 2
    const startStr = `${hourStart.toString().padStart(2, "0")}:00`
    const endStr = `${(hourStart + Math.max(1, Math.round(block.durationMinutes / 60))).toString().padStart(2, "0")}:00`

    return {
      ...block,
      timeSlot: `${startStr} - ${endStr}`,
      status: block.completed ? "CONCLUIDO" : idx === 0 ? "EM_ANDAMENTO" : "PENDENTE"
    }
  })

  const totalMinutes = dayBlocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const completedMinutes = dayBlocks.filter(b => b.completed).reduce((acc, b) => acc + b.durationMinutes, 0)
  const tasksRemaining = scheduledTasks.filter(t => !t.completed).length

  return (
    <div className="bg-card border rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
      {/* Linha 1: Controles de Data e Navegação */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0">
            <CalendarIcon className="w-5 h-5" />
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
                ? `${scheduledTasks.length} matérias programadas hoje • Total de ${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}min`
                : "Nenhum planejamento ativo para esta data"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button variant="outline" size="icon" onClick={handlePrevDay} className="h-8 w-8 rounded-lg">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={handleGoToday} className="h-8 px-3 rounded-lg text-xs font-bold text-[#2563EB] border-[#2563EB]/30">
              Ir para Hoje
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleNextDay} className="h-8 w-8 rounded-lg">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Linha 2: Pílulas de Métricas Otimizadas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 border-b pb-4">
        <div className="bg-muted/40 rounded-xl p-2.5 px-3.5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">Carga do Dia</span>
          <span className="text-xs sm:text-sm font-black text-foreground font-mono">
            {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min
          </span>
        </div>

        <div className="bg-emerald-500/10 rounded-xl p-2.5 px-3.5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-emerald-600 tracking-wider">Estudado Hoje</span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 font-mono">
            {Math.floor(completedMinutes / 60)}h {completedMinutes % 60}min
          </span>
        </div>

        <div className="bg-[#2563EB]/10 rounded-xl p-2.5 px-3.5 flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-[#2563EB] tracking-wider">Sessões Restantes</span>
          <span className="text-xs sm:text-sm font-black text-[#2563EB] font-mono">
            {scheduledTasks.length > 0 ? `${tasksRemaining} de ${scheduledTasks.length}` : "Dia Livre"}
          </span>
        </div>
      </div>

      {/* Linha 3: Seção Cronograma do Dia (No MESMO BALÃO!) */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Cronograma do Dia
          </h3>
          <span className="text-xs font-bold text-[#2563EB]">
            {scheduledTasks.length} matéria{scheduledTasks.length !== 1 ? "s" : ""} programada{scheduledTasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        {scheduledTasks.length === 0 ? (
          blocks.length > 0 ? (
            /* O usuário TEM planejamento criado, mas este dia específico é folga ou domingo livre */
            <div className="py-12 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                <Coffee className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-base font-extrabold text-foreground">🎉 Dia de Descanso Programado</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  De acordo com seu planejamento, você não tem matérias agendadas para este dia. Aproveite para descansar ou fazer revisões livres!
                </p>
              </div>
              {onSwitchToCiclo && (
                <Button onClick={onSwitchToCiclo} variant="outline" size="sm" className="font-bold text-xs gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/5 cursor-pointer">
                  <Sparkles className="w-3.5 h-3.5" /> Ver Sequência do Ciclo
                </Button>
              )}
            </div>
          ) : (
            /* O usuário NÃO TEM NENHUM planejamento criado */
            <div className="py-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm font-semibold text-muted-foreground">Nenhum planejamento criado ainda.</p>
              {onReplan && (
                <Button onClick={onReplan} size="sm" className="font-bold text-xs bg-[#2563EB] text-white hover:bg-[#1D4ED8] rounded-xl cursor-pointer">
                  Gerar Planejamento com IA
                </Button>
              )}
            </div>
          )
        ) : (
          <div className="space-y-4">
            {scheduledTasks.map((task) => (
              <div 
                key={task.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-xl hover:border-primary/40 transition-all bg-muted/20"
              >
                <div className="flex items-start gap-4">
                  <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: task.color }} />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {task.timeSlot}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                        {task.durationMinutes} min
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-foreground">{task.disciplineName}</h4>
                    <p className="text-xs text-muted-foreground">
                      Foco do Dia: Resolução de questões e revisão teórica
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {task.completed ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" />
                      Concluído
                    </span>
                  ) : (
                    <Button 
                      onClick={() => {
                        toast.success(`Iniciando estudo de ${task.disciplineName}`)
                        router.push(`/dashboard/study-session?planId=${task.id}`)
                      }}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 rounded-xl shadow-xs cursor-pointer"
                    >
                      <PlayCircle className="w-4 h-4 mr-1.5" />
                      Iniciar Estudo
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
