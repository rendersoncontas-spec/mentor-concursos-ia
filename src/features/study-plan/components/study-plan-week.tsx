import { Clock, BookOpen, CalendarDays, Play, Brain } from "lucide-react"
import Link from "next/link"

import { type StudyPlanWeek, type StudyPlanDisciplineSummary } from "@/domain/study-plan/study-plan.types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// --- Grade Semanal ---
export function StudyPlanWeekView({ week }: { week: StudyPlanWeek }) {
  const today = new Date().getDay()

  return (
    <TooltipProvider>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {week.days.map((day) => {
          const isToday = day.dayOfWeek === today

          return (
            <Card
              key={day.dayOfWeek}
              className={isToday ? "border-primary shadow-md ring-1 ring-primary/30" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                    {day.label}
                    {isToday && (
                      <Badge className="ml-2 text-xs bg-primary/15 text-primary border-0">Hoje</Badge>
                    )}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {formatMinutes(day.totalMinutes)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {day.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 border border-border/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium truncate">{item.discipline.name}</span>
                        <Tooltip>
                          <TooltipTrigger>
                            <Brain className="h-3 w-3 text-primary/50 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Sessão otimizada com base no seu histórico.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatMinutes(item.duration_minutes)}
                      </div>
                    </div>
                    
                    {isToday && (
                      <Button variant="secondary" size="sm" className="w-full text-xs h-7 gap-1 font-semibold hover:bg-primary hover:text-primary-foreground transition-colors" asChild>
                        <Link href={`/dashboard/study-session?planId=${item.id}`}>
                          <Play className="h-3 w-3" /> Iniciar
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

// --- Resumo Semanal por Disciplina ---
export function StudyPlanDisciplineSummaryView({
  summaries,
  totalWeeklyMinutes,
}: {
  summaries: StudyPlanDisciplineSummary[]
  totalWeeklyMinutes: number
}) {
  return (
    <div className="space-y-3">
      {summaries.map((s) => {
        const pct = totalWeeklyMinutes > 0 ? Math.round((s.totalWeeklyMinutes / totalWeeklyMinutes) * 100) : 0

        return (
          <div key={s.disciplineId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{s.disciplineName}</span>
                {s.disciplineArea && (
                  <Badge variant="secondary" className="text-xs h-4 px-1.5">{s.disciplineArea}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="text-xs">{s.daysCount}×/sem</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatMinutes(s.totalWeeklyMinutes)}
                </span>
              </div>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )
      })}
    </div>
  )
}

// --- Card de Estado Vazio ---
export function StudyPlanEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 text-center gap-4">
      <CalendarDays className="h-14 w-14 text-muted-foreground/30" />
      <div>
        <p className="font-semibold text-foreground">Nenhum cronograma gerado ainda</p>
        <p className="text-sm text-muted-foreground mt-1">
          Clique em &quot;Gerar Cronograma&quot; para criar seu plano de estudos personalizado.
        </p>
      </div>
    </div>
  )
}
