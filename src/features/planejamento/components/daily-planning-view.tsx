"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  PlayCircle, 
  CheckCircle2, 
  Calendar as CalendarIcon,
  BookOpen
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { type StudyCycleBlock } from "./estudei-planning-view"

interface DailyPlanningViewProps {
  blocks: StudyCycleBlock[]
  onReplan?: () => void
}

export function DailyPlanningView({ blocks, onReplan }: DailyPlanningViewProps) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

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

  // Total cycle workload in minutes
  const totalCycleMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const studyDaysPerWeek = 6 // 6 dias de estudo por semana (Seg-Sáb)
  const targetDailyMinutes = totalCycleMinutes > 0 
    ? Math.max(30, Math.round(totalCycleMinutes / studyDaysPerWeek)) 
    : 180

  // Calculate day-specific blocks until the daily target workload is reached
  const dayOfWeek = selectedDate.getDay() // 0 = Dom
  const dayOfYear = Math.floor((selectedDate.getTime() - new Date(selectedDate.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))

  const dayBlocks = (() => {
    if (blocks.length === 0) return []
    if (dayOfWeek === 0) return [] // Domingo livre por padrão

    const blocksPerDay = Math.max(1, Math.round(blocks.length / studyDaysPerWeek))
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

  return (
    <div className="space-y-6">
      {/* Date Control Header */}
      <div className="bg-card border rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-foreground capitalize">{dateFormatted}</h2>
              {isToday && (
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-600 rounded-full">
                  Hoje
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {blocks.length} sessões agendadas • Total de {Math.floor(totalMinutes / 60)}h{totalMinutes % 60}min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevDay} className="h-9 w-9 rounded-xl">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="outline" size="sm" onClick={handleGoToday} className="h-9 rounded-xl text-xs font-bold">
              Ir para Hoje
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleNextDay} className="h-9 w-9 rounded-xl">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Daily Progress summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Carga Horária</span>
          <div className="text-xl font-black text-foreground mt-1">
            {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Estudado Hoje</span>
          <div className="text-xl font-black text-emerald-500 mt-1">
            {Math.floor(completedMinutes / 60)}h {completedMinutes % 60}min
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Sessões Restantes</span>
          <div className="text-xl font-black text-primary mt-1">
            {blocks.filter(b => !b.completed).length} de {blocks.length}
          </div>
        </div>
      </div>

      {/* Timeline Schedule */}
      <div className="bg-card border rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
            Cronograma do Dia
          </h3>
          <span className="text-xs font-bold text-primary">
            {scheduledTasks.length} matérias programadas
          </span>
        </div>

        {scheduledTasks.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground">Nenhuma matéria agendada para este dia.</p>
            {onReplan && (
              <Button onClick={onReplan} size="sm" className="font-bold text-xs">
                Gerar Cronograma
              </Button>
            )}
          </div>
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
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 rounded-xl shadow-xs"
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
