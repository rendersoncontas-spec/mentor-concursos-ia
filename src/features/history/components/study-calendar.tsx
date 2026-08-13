"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Clock, Trash2, Edit2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { StudyHistory } from "@/domain/study-history/study-history.types"
import { originDisplayName } from "@/features/importacao/lib/origin"

type HistorySession = StudyHistory & { disciplines?: { name?: string } | null }

interface StudyCalendarProps {
  sessions: HistorySession[]
  currentYear: number
  currentMonth: number
  onNavigate: (year: number, month: number) => void
  onEditSession: (session: HistorySession) => void
  onDeleteSession: (sessionId: string) => void
  isLoading?: boolean
}

// Retorna YYYY-MM-DD no fuso de São Paulo
function getDayInSaoPaulo(isoString: string | null | undefined): string {
  if (!isoString) return ""
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ""
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(date)
}

function formatTime(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return `${h}h${m < 10 ? "0" : ""}${m}m`
}

function formatTimeFull(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h < 10 ? "0" + h : h}:${m < 10 ? "0" + m : m}:00`
}

function getIntensityClass(minutes: number) {
  if (minutes === 0) return "bg-card hover:bg-muted/40"
  if (minutes <= 60) return "bg-[#dcfce7]/70 hover:bg-[#dcfce7] text-emerald-950 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-100"
  if (minutes <= 180) return "bg-[#bbf7d0]/80 hover:bg-[#bbf7d0] text-emerald-950 dark:bg-emerald-900/50 dark:hover:bg-emerald-900/70 dark:text-emerald-100"
  if (minutes <= 300) return "bg-[#86efac]/80 hover:bg-[#86efac] text-emerald-950 dark:bg-emerald-800/60 dark:hover:bg-emerald-800/80 dark:text-emerald-50"
  return "bg-[#4ade80]/80 hover:bg-[#4ade80] text-emerald-950 dark:bg-emerald-700/70 dark:hover:bg-emerald-700/90 dark:text-white"
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function StudyCalendar({
  sessions,
  currentYear,
  currentMonth,
  onNavigate,
  onEditSession,
  onDeleteSession,
  isLoading
}: StudyCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Calcular dias do mês
  const { days, blanksBefore } = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay()
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
    
    return {
      days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      blanksBefore: Array.from({ length: firstDay }, (_, i) => i)
    }
  }, [currentYear, currentMonth])

  // Agrupar sessões por dia
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, HistorySession[]>()
    sessions.forEach(session => {
      const dayStr = getDayInSaoPaulo(session.started_at)
      if (!dayStr) return
      if (!map.has(dayStr)) map.set(dayStr, [])
      map.get(dayStr)!.push(session)
    })
    return map
  }, [sessions])

  const handlePrev = () => {
    if (currentMonth === 1) onNavigate(currentYear - 1, 12)
    else onNavigate(currentYear, currentMonth - 1)
  }

  const handleNext = () => {
    if (currentMonth === 12) onNavigate(currentYear + 1, 1)
    else onNavigate(currentYear, currentMonth + 1)
  }

  const handleToday = () => {
    const today = new Date()
    onNavigate(today.getFullYear(), today.getMonth() + 1)
  }

  const todayStr = getDayInSaoPaulo(new Date().toISOString())

  const selectedDaySessions = selectedDate ? (sessionsByDay.get(selectedDate) || []) : []

  // Metrics for selected day
  const dayTotalMinutes = selectedDaySessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  const dayTotalQuestions = selectedDaySessions.reduce((acc, s) => acc + Number(s.metadata?.["questions_answered"] || 0), 0)
  const dayTotalCorrect = selectedDaySessions.reduce((acc, s) => acc + Number(s.metadata?.["questions_correct"] || 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm">
        <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1 h-9 font-bold text-xs shadow-xs" disabled={isLoading}>
          <ChevronLeft className="h-4 w-4" />
          <span>Anterior</span>
        </Button>
        
        <div className="text-center">
          <h2 className="text-lg sm:text-2xl font-black text-foreground">
            {MONTH_NAMES[currentMonth - 1]} de {currentYear}
          </h2>
          {isLoading && <span className="text-[10px] font-bold text-[#2563EB] animate-pulse">CARREGANDO...</span>}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday} className="h-9 font-bold text-xs shadow-xs" disabled={isLoading}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={handleNext} className="gap-1 h-9 font-bold text-xs shadow-xs" disabled={isLoading}>
            <span>Próximo</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Days of week */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEK_DAYS.map(day => (
            <div key={day} className="py-2.5 text-center text-xs font-black text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 auto-rows-fr">
          {blanksBefore.map(b => (
            <div key={`blank-${b}`} className="min-h-[105px] sm:min-h-[125px] border-r border-b p-2 bg-muted/5 last:border-r-0" />
          ))}

          {days.map(day => {
            const paddedDay = String(day).padStart(2, '0')
            const paddedMonth = String(currentMonth).padStart(2, '0')
            const dayStr = `${currentYear}-${paddedMonth}-${paddedDay}`
            const daySessions = sessionsByDay.get(dayStr) || []
            const isToday = dayStr === todayStr

            const totalMinutes = daySessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
            const totalQuestions = daySessions.reduce((acc, s) => acc + Number(s.metadata?.["questions_answered"] || 0), 0)
            const totalCorrect = daySessions.reduce((acc, s) => acc + Number(s.metadata?.["questions_correct"] || 0), 0)
            
            const hasData = daySessions.length > 0
            const intensityClass = getIntensityClass(totalMinutes)

            return (
              <button
                key={dayStr}
                onClick={() => hasData && setSelectedDate(dayStr)}
                disabled={!hasData}
                className={`
                  min-h-[105px] sm:min-h-[125px] flex flex-col items-start justify-start p-2.5 border-r border-b last:border-r-0 
                  transition-all relative text-left w-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2563EB]
                  ${intensityClass}
                  ${isToday ? 'ring-2 ring-inset ring-[#2563EB] z-10' : ''}
                  ${!hasData ? 'cursor-default opacity-85' : 'cursor-pointer'}
                `}
                aria-label={`${day} de ${MONTH_NAMES[currentMonth - 1]} de ${currentYear}. ${hasData ? `${formatTime(totalMinutes)} estudados em ${daySessions.length} sessões.` : "Nenhum estudo."}`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className={`text-xs sm:text-sm font-black ${isToday ? 'text-[#2563EB]' : 'text-foreground/80'}`}>
                    {day}
                  </span>
                </div>

                {hasData && (
                  <div className="mt-auto w-full space-y-1">
                    <div className="text-[11px] font-extrabold text-foreground flex items-center gap-1 truncate">
                      <span>📖</span> {daySessions.length} Ativ.
                    </div>
                    <div className="text-[11px] font-black text-foreground flex items-center gap-1 truncate">
                      <span>⏱</span> {formatTime(totalMinutes)}
                    </div>
                    {totalQuestions > 0 && (
                      <div className="text-[10px] font-bold text-foreground/80 truncate">
                        <span>📝</span> {totalQuestions} qst {totalCorrect > 0 ? `(${totalCorrect} ✓)` : ''}
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Modal de Detalhes do Dia */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              Estudos do dia {selectedDate ? selectedDate.split("-").reverse().join("/") : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 shrink-0">
            <div className="bg-muted/30 rounded-lg p-3 text-center border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Tempo Total</div>
              <div className="text-lg font-black">{formatTime(dayTotalMinutes)}</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Sessões</div>
              <div className="text-lg font-black">{selectedDaySessions.length}</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Questões</div>
              <div className="text-lg font-black">{dayTotalQuestions}</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Acertos</div>
              <div className="text-lg font-black text-emerald-600">{dayTotalCorrect}</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {selectedDaySessions.map(session => (
              <div key={session.id} className="rounded-xl border bg-card p-3 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <h4 className="font-extrabold text-xs text-foreground truncate">
                    {session.disciplines?.name || "Estudo Livre"}
                  </h4>
                  {session.origin_source && (
                    <span className="inline-flex items-center rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#2563EB]">
                      Importado · {originDisplayName(session.origin_source, session.origin_source_name)}
                    </span>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {session.study_type || "Geral"}
                  </p>
                </div>
                
                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span className="text-xs font-mono font-bold">
                    {formatTimeFull(session.duration_minutes || 0)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setSelectedDate(null); onEditSession(session); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-500" onClick={() => {
                      onDeleteSession(session.id);
                      if (selectedDaySessions.length === 1) {
                        setSelectedDate(null);
                      }
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
