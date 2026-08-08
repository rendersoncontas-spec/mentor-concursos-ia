"use client"

import { useState } from "react"
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Target, 
  Clock, 
  CheckCircle2,
  Calendar,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { type StudyCycleBlock } from "./estudei-planning-view"

interface PlanningGoalsProgressCardProps {
  blocks: StudyCycleBlock[]
  onStartSession?: (disciplineId: string) => void
}

type PeriodFilter = "semana" | "mes" | "ano" | "total" | "custom"

export function PlanningGoalsProgressCard({ blocks, onStartSession }: PlanningGoalsProgressCardProps) {
  const [period, setPeriod] = useState<PeriodFilter>("semana")
  const [currentOffset, setCurrentOffset] = useState(0) // offset for period navigation

  // Dates calculation based on filter & offset
  const today = new Date()

  const getDateRangeLabel = () => {
    if (period === "semana") {
      const start = new Date(today)
      start.setDate(today.getDate() - today.getDay() + currentOffset * 7)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}`
    }

    if (period === "mes") {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + currentOffset, 1)
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      return `${monthDate.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}`
    }

    if (period === "ano") {
      const year = today.getFullYear() + currentOffset
      return `01/01/${year} a 31/12/${year}`
    }

    if (period === "total") {
      return "Todo o Histórico do Plano"
    }

    return "Período Personalizado"
  }

  // Multiplier factor based on period (semana = 1, mes = 4.3, ano = 52, total = 12)
  const getMultiplier = () => {
    switch (period) {
      case "semana": return 1
      case "mes": return 4.3
      case "ano": return 52
      case "total": return 12
      default: return 1
    }
  }

  const multiplier = getMultiplier()

  // Aggregate total duration and studied minutes per discipline
  const disciplineMap = new Map<string, {
    id: string;
    name: string;
    color: string;
    totalDuration: number;
    totalStudied: number;
  }>();
  blocks.forEach(b => {
    const existing = disciplineMap.get(b.disciplineId);
    if (existing) {
      existing.totalDuration += b.durationMinutes;
      existing.totalStudied += b.studiedMinutes || 0;
    } else {
      disciplineMap.set(b.disciplineId, {
        id: b.id,
        name: b.disciplineName,
        color: b.color || "#2563EB",
        totalDuration: b.durationMinutes,
        totalStudied: b.studiedMinutes || 0,
      });
    }
  });
  const disciplineGoals = Array.from(disciplineMap.values()).map(d => {
    const targetMinutes = Math.round(d.totalDuration * multiplier);
    const studiedMinutes = Math.min(targetMinutes, Math.round(d.totalStudied * multiplier));
    const missingMinutes = Math.max(0, targetMinutes - studiedMinutes);
    const percentage = targetMinutes > 0 ? Math.min(100, Math.round((studiedMinutes / targetMinutes) * 100)) : 0;
    return {
      id: d.id,
      name: d.name,
      color: d.color,
      targetMinutes,
      studiedMinutes,
      missingMinutes,
      percentage,
    };
  });

  // Group total calculation based on all blocks (full weekly goal)
  const totalTargetMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const totalStudiedMinutes = blocks.reduce((acc, b) => acc + b.studiedMinutes, 0)
  const totalMissingMinutes = Math.max(0, totalTargetMinutes - totalStudiedMinutes)
  const totalPercentage = totalTargetMinutes > 0
    ? parseFloat(((totalStudiedMinutes / totalTargetMinutes) * 100).toFixed(1))
    : 0

  const formatHoursMinutesShort = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-xs space-y-6">
      {/* Top Header: Period Selector & Date Range */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-foreground">Metas & Progresso do Planejamento</h3>
            <p className="text-xs text-muted-foreground font-medium">
              Acompanhamento de horas definidas vs estudadas por disciplina
            </p>
          </div>
        </div>

        {/* Right Controls: Filters and Date Navigator */}
        <div className="flex flex-col sm:items-end gap-3">
          {/* Period Filter Buttons (Semana, Mês, Ano, Total) */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border">
            {(["semana", "mes", "ano", "total"] as PeriodFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setPeriod(f)
                  setCurrentOffset(0)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  period === f 
                    ? "bg-[#2563EB] text-white shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "semana" ? "Semana" : f === "mes" ? "Mês" : f === "ano" ? "Ano" : "Total"}
              </button>
            ))}
          </div>

          {/* Date Navigator Controls */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setCurrentOffset(prev => prev - 1)}
              className="p-2 border rounded-xl hover:bg-muted text-muted-foreground transition-colors bg-background shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-extrabold text-foreground px-3 py-2 bg-muted rounded-xl border flex-1 text-center min-w-[200px]">
              {getDateRangeLabel()}
            </span>

            <button
              onClick={() => setCurrentOffset(prev => prev + 1)}
              className="p-2 border rounded-xl hover:bg-muted text-muted-foreground transition-colors bg-background shadow-xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Disciplines Goal List */}
      <div className="space-y-4">
        {disciplineGoals.map((d) => {
          const isCompleted = d.percentage >= 100
          
          return (
            <div 
              key={d.id} 
              className="p-4 rounded-xl border bg-muted/20 hover:border-primary/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              {/* Discipline Info & Missing/Target Labels */}
              <div className="space-y-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <h4 className="text-sm font-black text-foreground">{d.name}</h4>
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className={isCompleted ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400"}>
                    {isCompleted ? "🟢 Meta Batida!" : `Falta: ${formatHoursMinutesShort(d.missingMinutes)}`}
                  </span>
                  <span className="text-muted-foreground">
                    Meta definida: <strong>{formatHoursMinutesShort(d.targetMinutes)}</strong>
                  </span>
                </div>
              </div>

              {/* Progress Bar & Percentage */}
              <div className="flex-1 w-full md:max-w-md flex items-center gap-3">
                <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden border">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      isCompleted 
                        ? "bg-emerald-500 shadow-sm" 
                        : d.percentage >= 50 
                        ? "bg-[#2563EB]" 
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${d.percentage}%` }}
                  />
                </div>

                <span className={`text-xs font-black min-w-[48px] text-right ${
                  isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                }`}>
                  {d.percentage}%
                </span>
              </div>

              {/* Start Session Action Button */}
              <Button
                size="sm"
                onClick={() => {
                  if (onStartSession) onStartSession(d.id)
                  else toast.info(`Iniciando estudo de ${d.name}...`)
                }}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-9 px-4 rounded-xl gap-1.5 shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Iniciar
              </Button>
            </div>
          )
        })}
      </div>

      {/* Overall Period Progress Footer */}
      <div className="border-t pt-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div>
            <div className="text-2xl font-black text-foreground">{totalPercentage}%</div>
            <p className="text-xs text-muted-foreground font-medium">
              Tempo total cumprido em {getDateRangeLabel()}
            </p>
          </div>

          <div className="text-xs font-semibold space-y-0.5 text-right">
            <div className="text-amber-600 dark:text-amber-400 font-bold">
              Falta: {formatHoursMinutesShort(totalMissingMinutes)}
            </div>
            <div className="text-muted-foreground">
              Meta definida: <strong>{formatHoursMinutesShort(totalTargetMinutes)}</strong>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-muted rounded-full h-4 overflow-hidden border">
          <div
            className="h-full bg-gradient-to-r from-[#2563EB] to-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${totalPercentage}%` }}
          />
        </div>


      </div>
    </div>
  )
}
