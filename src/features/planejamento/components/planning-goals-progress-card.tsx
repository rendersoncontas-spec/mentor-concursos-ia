"use client"

import { useEffect, useState } from "react"

import { ChevronLeft, ChevronRight, Play } from "lucide-react"
import { toast } from "sonner"

import { type PeriodGoalData } from "@/application/study-plan/replan/adaptive-replan.service"
import { type PeriodFilter as ServicePeriodFilter } from "@/application/study-plan/replan/adaptive-replan.service"
import { Button } from "@/components/ui/button"
import { usePlanningActionsRef } from "@/features/planejamento/planning-actions"

import { type StudyCycleBlock } from "./planning-view"

interface PlanningGoalsProgressCardProps {
  blocks: StudyCycleBlock[]
  onStartSession?: (disciplineId: string) => void
}

type PeriodFilter = "semana" | "mes" | "ano" | "total" | "custom"

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  semana: "Semana",
  mes: "Mês",
  ano: "Ano",
  total: "Total",
  custom: "Personalizado",
}

// V2.5: barra na cor da marca; a terracota marca só o que está atrasado
// (< 50%). Antes: verde com sombra / teal / âmbar em cada linha.
function getProgressBarClass(isCompleted: boolean, percentage: number): string {
  if (isCompleted || percentage >= 50) return "bg-primary"
  return "bg-accent"
}

export function PlanningGoalsProgressCard({
  blocks,
  onStartSession,
}: PlanningGoalsProgressCardProps) {
  const planningRef = usePlanningActionsRef()
  const [period, setPeriod] = useState<PeriodFilter>("semana")
  const [currentOffset, setCurrentOffset] = useState(0) // offset for period navigation

  // Dados reais de meta do período (buscados do banco)
  const [periodGoal, setPeriodGoal] = useState<PeriodGoalData | null>(null)
  const [, setLoadingGoal] = useState(true)

  // Buscar dados reais de meta quando período ou offset mudam
  useEffect(() => {
    let cancelled = false
    const fetchGoal = async () => {
      setLoadingGoal(true)
      try {
        // Mapear "custom" para "semana" (service não suporta custom)
        const servicePeriod: ServicePeriodFilter = period === "custom" ? "semana" : period
        const res = await planningRef.current.getPeriodGoalAction(servicePeriod, currentOffset)
        if (!cancelled && res.data) {
          setPeriodGoal(res.data)
        }
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setLoadingGoal(false)
      }
    }
    void fetchGoal()
    return () => { cancelled = true }
  }, [period, currentOffset, planningRef])

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

  // Aggregate total duration and studied minutes per discipline
  const disciplineMap = new Map<
    string,
    {
      id: string
      name: string
      color: string
      totalDuration: number
      totalStudied: number
    }
  >()
  blocks.forEach((b) => {
    const existing = disciplineMap.get(b.disciplineId)
    if (existing) {
      existing.totalDuration += b.durationMinutes
      existing.totalStudied += b.studiedMinutes || 0
    } else {
      disciplineMap.set(b.disciplineId, {
        id: b.id,
        name: b.disciplineName,
        color: b.color || "#2563EB",
        totalDuration: b.durationMinutes,
        totalStudied: b.studiedMinutes || 0,
      })
    }
  })
  const totalCycleMinutes = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const disciplineGoals = Array.from(disciplineMap.values()).map((d) => {
    // Usar dados reais do período quando disponíveis
    const targetMinutes = periodGoal
      ? Math.round((d.totalDuration / Math.max(1, totalCycleMinutes)) * periodGoal.goalMinutes)
      : d.totalDuration
    const studiedMinutes = periodGoal
      ? Math.round((d.totalStudied / Math.max(1, totalCycleMinutes)) * periodGoal.studiedMinutes)
      : d.totalStudied
    const missingMinutes = Math.max(0, targetMinutes - studiedMinutes)
    const percentage =
      targetMinutes > 0 ? Math.min(100, Math.round((studiedMinutes / targetMinutes) * 100)) : 0
    return {
      id: d.id,
      name: d.name,
      color: d.color,
      targetMinutes,
      studiedMinutes,
      missingMinutes,
      percentage,
    }
  })

  // Usar dados REAIS do banco quando disponíveis, fallback para cálculo local
  const totalTargetMinutes = periodGoal?.goalMinutes
    ?? blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
  const totalStudiedMinutes = periodGoal?.studiedMinutes
    ?? blocks.reduce((acc, b) => acc + b.studiedMinutes, 0)
  const totalMissingMinutes = periodGoal?.remainingMinutes
    ?? Math.max(0, totalTargetMinutes - totalStudiedMinutes)
  const totalPercentage =
    totalTargetMinutes > 0
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
    <div className="bg-card border rounded-lg p-5 sm:p-6 space-y-5">
      {/* Top Header: Period Selector & Date Range */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3 self-start">
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
              Metas e progresso
            </h3>
            <p className="text-xs text-muted-foreground font-medium">
              {periodGoal
                ? `${periodGoal.goalSource === "suggested" ? "Meta sugerida" : "Meta"}: ${formatHoursMinutesShort(periodGoal.goalMinutes)} • Estudado: ${formatHoursMinutesShort(periodGoal.studiedMinutes)} • Falta: ${formatHoursMinutesShort(periodGoal.remainingMinutes)}`
                : "Acompanhamento de horas definidas vs estudadas por disciplina"}
            </p>
          </div>
        </div>

        {/* Right Controls: Filters and Date Navigator */}
        <div className="flex flex-col sm:items-end gap-3">
          {/* Period Filter Buttons (Semana, Mês, Ano, Total) */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
            {(["semana", "mes", "ano", "total"] as PeriodFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setPeriod(f)
                  setCurrentOffset(0)
                }}
                aria-pressed={period === f}
                className={`font-medium px-3 py-1.5 rounded-sm text-xs transition-colors ${
                  period === f
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Date Navigator Controls */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              aria-label="Período anterior"
              onClick={() => setCurrentOffset((prev) => prev - 1)}
              className="p-2 border rounded-md hover:bg-muted text-muted-foreground transition-colors bg-background"
            >
              <ChevronLeft aria-hidden className="w-4 h-4" />
            </button>

            <span className="text-xs font-medium tabular-nums text-foreground px-3 py-2 rounded-md border flex-1 text-center min-w-0">
              {getDateRangeLabel()}
            </span>

            <button
              type="button"
              aria-label="Próximo período"
              onClick={() => setCurrentOffset((prev) => prev + 1)}
              className="p-2 border rounded-md hover:bg-muted text-muted-foreground transition-colors bg-background shrink-0"
            >
              <ChevronRight aria-hidden className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Overall Period Progress Overview (Parte Superior) */}
      <div className="space-y-3 border-b pb-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div>
            <div className="metric-value text-2xl sm:text-3xl text-foreground">{totalPercentage}%</div>
            <p className="text-xs text-muted-foreground font-medium">
              Tempo total cumprido em {periodGoal?.periodLabel || getDateRangeLabel()}
            </p>
          </div>

          <div className="text-xs font-semibold space-y-0.5 sm:text-right">
            <div
              className={
                totalPercentage >= 100
                  ? "text-primary font-semibold"
                  : "text-foreground font-semibold"
              }
            >
              {totalPercentage >= 100
                ? "Meta cumprida"
                : `Falta: ${formatHoursMinutesShort(totalMissingMinutes)}`}
            </div>
            <div className="text-muted-foreground">
              {periodGoal?.goalSource === "suggested" ? "Meta sugerida" : "Meta definida"}: <strong>{formatHoursMinutesShort(totalTargetMinutes)}</strong>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${Math.min(totalPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Disciplines Goal List */}
      <div className="divide-y divide-border">
        {disciplineGoals.map((d) => {
          const isCompleted = d.percentage >= 100

          return (
            <div
              key={d.id}
              className="py-3.5 first:pt-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4"
            >
              {/* Discipline Info & Missing/Target Labels */}
              <div className="space-y-1 w-full md:w-auto md:min-w-[240px] min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <h4 className="text-sm font-semibold text-foreground">{d.name}</h4>
                </div>

                <div className="flex items-center gap-3 text-xs font-medium">
                  <span
                    className={
                      isCompleted
                        ? "text-primary font-semibold"
                        : "text-foreground"
                    }
                  >
                    {isCompleted
                      ? "Meta cumprida"
                      : `Falta: ${formatHoursMinutesShort(d.missingMinutes)}`}
                  </span>
                  <span className="text-muted-foreground">
                    Meta definida: <strong>{formatHoursMinutesShort(d.targetMinutes)}</strong>
                  </span>
                </div>
              </div>

              {/* Progress Bar & Percentage */}
              <div className="flex-1 w-full md:max-w-md flex items-center gap-3">
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getProgressBarClass(isCompleted, d.percentage)}`}
                    style={{ width: `${d.percentage}%` }}
                  />
                </div>

                <span
                  className="text-xs font-semibold tabular-nums min-w-[48px] text-right text-foreground"
                >
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
                variant="outline"
                className="font-medium text-xs h-9 px-4 gap-1.5 shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Iniciar
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
