"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import {
  Activity,
  Award,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  HelpCircle,
  MapPin,
  RotateCcw,
  Sparkles,
  SquarePen,
  Target,
  Trophy,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { formatDurationMinutes } from "@/lib/format-duration"

import {
  type RecentHistoryEntry,
  getRecentStudyHistoryAction,
} from "@/application/study-analytics/study-analytics.actions"
import { Button } from "@/components/ui/button"
import { type DashboardSnapshot, type PerformancePeriod } from "@/domain/dashboard/dashboard.types"
import { RemindersWidget } from "@/features/dashboard/components/reminders-widget"
import { ManualStudyTimeModal } from "@/features/dashboard/components/manual-study-time-modal"
import { DayDetailModal } from "@/features/dashboard/components/day-detail-modal"
import { DailyPlanningView } from "@/features/planejamento/components/daily-planning-view"
import { type StudyCycleBlock } from "@/features/planejamento/components/planning-view"
import { STUDY_SESSION_SAVED_EVENT } from "@/features/study-session/lib/study-session-events"

import { getDailyMessage } from "./daily-message-banner"
import { useCachedServerAction } from "@/hooks/use-cached-server-action"

import { IntelligentCycleWidget } from "@/features/study-cycle/components/intelligent-cycle-widget"

export interface DashboardWidgetProps {
  snapshot: DashboardSnapshot
  colSpan: 1 | 2 | 3
  cycleBlocks: StudyCycleBlock[]
  onOpenGoalsModal?: () => void
  onOpenExamModal?: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WIDGET: Tempo de Estudo
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetTempoEstudo({ snapshot, colSpan }: DashboardWidgetProps) {
  const weeklyMins =
    snapshot?.analytics?.stats?.weeklyMinutes ?? snapshot?.stats?.weeklyMinutes ?? 0
  const dailyMins = snapshot?.analytics?.stats?.dailyMinutes ?? snapshot?.stats?.dailyMinutes ?? 0
  const weeklyHours = snapshot?.user?.weekly_study_hours
  const targetMins = weeklyHours ? weeklyHours * 60 : null

  const pct = targetMins ? Math.min(100, Math.round((weeklyMins / targetMins) * 100)) : null

  if (colSpan === 1) {
    return (
      <div className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2.5">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" /> TEMPO DE ESTUDO
          </span>
          <span className="text-[10px] sm:text-[11px] font-black text-primary font-mono">
            {pct === null ? "—" : `${pct}%`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 my-auto">
          <div>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold uppercase block mb-0.5">Hoje</span>
            <span className="text-sm sm:text-base font-black text-foreground font-mono leading-tight">
              {formatDurationMinutes(dailyMins)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold uppercase block mb-0.5">
              Semana
            </span>
            <span className="text-sm sm:text-base font-black text-primary font-mono leading-tight">
              {formatDurationMinutes(weeklyMins)}
            </span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>
    )
  }

  if (colSpan === 2) {
    return (
      <div className="p-5 flex flex-col justify-between h-full space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" /> TEMPO DE ESTUDO SEMANAL
          </span>
          <span className="text-xs font-black text-primary font-mono">
            {pct === null ? "—" : `${pct}% Concluído`}
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border rounded-xl border bg-card my-auto">
          <div className="p-2.5">
            <span className="text-[10px] text-muted-foreground font-bold uppercase block">
              Hoje
            </span>
            <span className="text-base font-black text-foreground font-mono">
              {formatDurationMinutes(dailyMins)}
            </span>
          </div>
          <div className="p-2.5">
            <span className="text-[10px] text-muted-foreground font-bold uppercase block">
              Esta Semana
            </span>
            <span className="text-base font-black text-primary font-mono">
              {formatDurationMinutes(weeklyMins)}
            </span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>
    )
  }

  // Large (colSpan === 3)
  return (
    <div className="p-6 flex flex-col justify-between h-full space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-primary" /> PAINEL GERAL DE TEMPO DE ESTUDO
        </span>
        <span className="text-xs font-black text-primary font-mono">
          Meta Semanal: {targetMins === null ? "Não definida" : formatDurationMinutes(targetMins)}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border bg-card">
        <div className="p-3.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Hoje
          </span>
          <span className="text-xl font-black text-foreground font-mono">
            {formatDurationMinutes(dailyMins)}
          </span>
        </div>
        <div className="p-3.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Esta Semana
          </span>
          <span className="text-xl font-black text-primary font-mono">
            {formatDurationMinutes(weeklyMins)}
          </span>
        </div>
        <div className="p-3.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Progresso
          </span>
          <span className="text-xl font-black text-foreground font-mono">{pct}%</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            DISTRIBUIÇÃO DIÁRIA
          </span>
          <div className="flex gap-2">
            {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day, idx) => {
              const ev = snapshot?.analytics?.evolution?.[idx]
              const mins = ev?.value ?? 0
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <div className="w-2 bg-muted rounded-full h-12 relative flex items-end">
                    <div
                      className="bg-primary w-full rounded-full transition-all"
                      style={{ height: `${Math.min(100, (mins / 120) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-bold text-muted-foreground">{day}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. WIDGET: Desempenho Geral com Seletor de Período
// ─────────────────────────────────────────────────────────────────────────────

const PERFORMANCE_PERIOD_OPTIONS: { key: PerformancePeriod; label: string }[] = [
  { key: "HOJE", label: "Hoje" },
  { key: "SEMANA", label: "Semana" },
  { key: "MES", label: "Mês" },
  { key: "ANO", label: "Ano" },
  { key: "TOTAL", label: "Total" },
]

function PerformancePeriodSelector({
  value,
  onChange,
  className,
}: {
  value: PerformancePeriod
  onChange: (period: PerformancePeriod) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 bg-muted/60 rounded-lg text-[9px] sm:text-[10px] font-bold border border-border/40",
        className,
      )}
    >
      {PERFORMANCE_PERIOD_OPTIONS.map((opt) => {
        const isActive = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(opt.key)
            }}
            className={cn(
              "px-1.5 sm:px-2 py-0.5 rounded-md transition-all duration-150 cursor-pointer select-none",
              isActive
                ? "bg-background text-foreground shadow-xs font-black"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function WidgetDesempenho({ snapshot, colSpan }: DashboardWidgetProps) {
  const [selectedPeriod, setSelectedPeriod] = React.useState<PerformancePeriod>("SEMANA")

  // Obter dados do período selecionado
  const defaultPeriodData = {
    totalQuestions: snapshot?.stats?.totalQuestions ?? 0,
    correctQuestions: snapshot?.stats?.correctQuestions ?? 0,
    wrongQuestions: snapshot?.stats?.wrongQuestions ?? 0,
    accuracyPercentage: snapshot?.stats?.accuracyPercentage ?? 0,
  }

  const periodStats =
    snapshot?.stats?.performanceByPeriod?.[selectedPeriod] ?? defaultPeriodData

  const accuracy = periodStats.accuracyPercentage
  const total = periodStats.totalQuestions
  const correct = periodStats.correctQuestions
  const wrong = periodStats.wrongQuestions
  const disciplineRanking = snapshot?.analytics?.rankings?.disciplines || []
  const periodLabel =
    PERFORMANCE_PERIOD_OPTIONS.find((o) => o.key === selectedPeriod)?.label || "Semana"

  if (colSpan === 1) {
    return (
      <div className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> DESEMPENHO
          </span>
          <span className="text-[10px] sm:text-[11px] font-black text-emerald-600 font-mono">
            {accuracy}%
          </span>
        </div>

        {/* Seletor de Período Compacto */}
        <div className="flex justify-center w-full">
          <PerformancePeriodSelector
            value={selectedPeriod}
            onChange={setSelectedPeriod}
            className="w-full justify-between"
          />
        </div>

        <div className="flex items-center justify-between gap-2 my-auto">
          <div className="text-xl sm:text-2xl font-black text-foreground font-mono leading-tight">
            {accuracy}%
          </div>
          <div className="text-right text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-tight">
            <div>
              <strong className="text-emerald-600 font-bold">{correct}</strong> acertos
            </div>
            <div>
              <strong className="text-rose-500 font-bold">{wrong}</strong> erros
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-muted-foreground border-t pt-1.5">
          <span>Total ({periodLabel})</span>
          <span className="font-mono text-foreground font-extrabold">{total} questões</span>
        </div>
      </div>
    )
  }

  if (colSpan === 2) {
    return (
      <div className="p-5 flex flex-col justify-between h-full space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-600" /> DESEMPENHO GERAL
          </span>
          <div className="flex items-center gap-2">
            <PerformancePeriodSelector
              value={selectedPeriod}
              onChange={setSelectedPeriod}
            />
            <span className="text-xs font-black text-emerald-600 font-mono">
              {accuracy}% Acurácia
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 my-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-foreground font-mono">{accuracy}%</span>
            <div className="text-xs text-muted-foreground font-medium">
              <div>
                <strong className="text-emerald-600">{correct}</strong> acertos
              </div>
              <div>
                <strong className="text-rose-500">{wrong}</strong> erros
              </div>
            </div>
          </div>
          <div className="text-right text-xs font-bold text-muted-foreground">
            Total ({periodLabel}):{" "}
            <span className="font-mono text-foreground font-extrabold">{total}</span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${accuracy}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col justify-between h-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-emerald-600" /> DESEMPENHO & TAXA DE ACERTO
        </span>
        <div className="flex items-center gap-2">
          <PerformancePeriodSelector
            value={selectedPeriod}
            onChange={setSelectedPeriod}
          />
          <span className="text-xs font-black text-emerald-600 font-mono">
            Aproveitamento: {accuracy}%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border rounded-xl border bg-card">
        <div className="p-3 text-center">
          <span className="text-[10px] text-muted-foreground font-bold uppercase block">
            Total ({periodLabel})
          </span>
          <span className="text-lg font-black text-foreground font-mono">{total}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[10px] text-emerald-600 font-bold uppercase block">Acertos</span>
          <span className="text-lg font-black text-emerald-600 font-mono">{correct}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[10px] text-rose-500 font-bold uppercase block">Erros</span>
          <span className="text-lg font-black text-rose-500 font-mono">{wrong}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[10px] text-primary font-bold uppercase block">Precisão</span>
          <span className="text-lg font-black text-primary font-mono">{accuracy}%</span>
        </div>
      </div>

      {disciplineRanking.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            MELHORES DESEMPENHOS POR MATÉRIA
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {disciplineRanking.slice(0, 4).map(
              (
                item: {
                  name?: string
                  disciplineName?: string
                  accuracy?: number
                  percentage?: number
                },
                idx: number,
              ) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-[11px] font-bold"
                >
                  <span className="truncate pr-2">{item.name || item.disciplineName}</span>
                  <span className="text-emerald-600 font-mono">
                    {item.accuracy || item.percentage || 0}%
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WIDGET: Progresso no Edital
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetProgressoEdital({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const progress = snapshot?.stats?.editalProgress ?? 0
  const completed = snapshot?.stats?.completedTopics ?? 0
  const total = snapshot?.disciplinesStats?.total ?? 0

  if (colSpan === 1) {
    return (
      <div
        className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => router.push("/edital")}
      >
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" /> PROGRESSO NO EDITAL
          </span>
          <span className="text-[10px] font-black text-primary font-mono">
            {progress}%
          </span>
        </div>
        <div className="my-auto flex items-baseline justify-between">
          <span className="text-xl sm:text-2xl font-black text-foreground font-mono leading-tight">
            {completed} <span className="text-xs text-muted-foreground font-bold">/ {total}</span>
          </span>
          <span className="text-[10px] text-muted-foreground font-bold">matérias</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={() => router.push("/edital")}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-primary" /> PROGRESSO NO EDITAL
        </span>
        <span className="text-xs font-black text-primary font-mono">
          {progress}% Concluído
        </span>
      </div>
      <div className="space-y-2 my-auto">
        <div className="flex justify-between text-xs font-bold text-muted-foreground">
          <span>Cobertura do Conteúdo</span>
          <span className="text-foreground font-mono font-bold">
            {completed} / {total} matérias
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WIDGET: Constância nos Estudos
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetConstancia({ snapshot, colSpan }: DashboardWidgetProps) {
  const streak =
    snapshot?.analytics?.stats?.consecutiveStreak ?? snapshot?.stats?.consecutiveStreak ?? 0
  const longest =
    snapshot?.analytics?.stats?.longestStreak ?? snapshot?.stats?.longestStreak ?? streak
  const heatmap = snapshot?.analytics?.heatmap || []

  if (colSpan === 1) {
    return (
      <div className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2.5">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-500" /> CONSTÂNCIA
          </span>
          <span className="text-[10px] sm:text-[11px] font-black text-orange-500 font-mono">
            {streak}d
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 my-auto">
          <div>
            <span className="text-xl sm:text-2xl font-black text-foreground font-mono leading-tight">
              {streak}
            </span>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold ml-1">dias seguidos</span>
          </div>
          <div className="text-right text-[10px] sm:text-[11px] text-muted-foreground font-bold leading-tight">
            Recorde: <span className="text-orange-500 font-extrabold">{longest}d</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border/50">
          <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Registro diário
          </span>
          <div className="flex items-center gap-1">
            {(heatmap.length > 0
              ? heatmap.slice(-7)
              : Array.from({ length: 7 }, () => ({ minutes: 0, date: "" }))
            ).map((day, idx) => {
              const studied = (day?.minutes ?? 0) > 0 || idx < streak
              return (
                <div
                  key={idx}
                  className={`w-2.5 h-2.5 rounded-xs transition-all ${
                    studied ? "bg-emerald-500" : "bg-muted-foreground/20"
                  }`}
                  title={
                    day?.date ? `${day.date}: ${studied ? `${day.minutes} min` : "Sem estudo"}` : ""
                  }
                />
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-orange-500" /> CONSTÂNCIA E SEQUÊNCIA ATIVA
        </span>
        <span className="text-xs font-black text-orange-500 font-mono">
          {streak} dias consecutivos
        </span>
      </div>
      <div className="flex items-center justify-between my-auto">
        <div>
          <span className="text-3xl font-black text-foreground font-mono">{streak}</span>
          <span className="text-xs text-muted-foreground font-bold ml-1">dias seguidos</span>
        </div>
        <div className="text-right text-xs text-muted-foreground font-bold">
          Maior Sequência: <span className="text-orange-500 font-black">{longest} dias</span>
        </div>
      </div>

      {heatmap.length > 0 && (
        <div className="pt-2 border-t">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">
            REGISTRO DIÁRIO
          </div>
          <div className="flex flex-wrap gap-1.5">
            {heatmap
              .slice(-14)
              .map((day: { date?: string; minutes?: number; count?: number }, idx: number) => {
                const studied = (day.minutes ?? 0) > 0 || (day.count ?? 0) > 0
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-md transition-all ${
                      studied ? "bg-emerald-500" : "bg-rose-500/80"
                    }`}
                    title={`${day.date}: ${studied ? `${day.minutes} min` : "Sem estudo"}`}
                  />
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WIDGET: Estudos de Hoje (Visão Diária do Ciclo)
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetEstudosHoje({ cycleBlocks }: DashboardWidgetProps) {
  const { data: history, refresh } = useCachedServerAction<RecentHistoryEntry[]>(
    "recentStudyHistory:14",
    () => getRecentStudyHistoryAction(14).then((res) => res.data ?? []),
    5 * 60 * 1000,
  )

  React.useEffect(() => {
    const load = () => { void refresh() }
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, load)
    return () => window.removeEventListener(STUDY_SESSION_SAVED_EVENT, load)
  }, [refresh])

  return (
    <div className="w-full">
      <DailyPlanningView blocks={cycleBlocks} history={history ?? []} embedded={true} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WIDGET: Questões
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetQuestoes({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const total = snapshot?.stats?.totalQuestions ?? 0
  const target = snapshot?.analytics?.goals?.questions?.target ?? null
  const achieved = snapshot?.analytics?.goals?.questions?.achieved ?? total

  // Porcentagem REAL (sem travar em 100%, ex: 90 / 50 = 180%)
  const realPct = target && target > 0 ? Math.round((achieved / target) * 100) : null
  const progressWidth = Math.min(100, realPct ?? 0)

  // Diferença em relação à meta
  const diff = target !== null ? achieved - target : null

  // Acertos, Erros e Aproveitamento
  let correct = snapshot?.stats?.correctQuestions ?? 0
  let wrong = snapshot?.stats?.wrongQuestions ?? 0
  let accuracy = snapshot?.stats?.accuracyPercentage ?? null

  if (
    correct === 0 &&
    wrong === 0 &&
    snapshot?.rawDisciplines &&
    snapshot.rawDisciplines.length > 0
  ) {
    correct = snapshot.rawDisciplines.reduce((acc, d) => acc + (d.correctCount || 0), 0)
    wrong = snapshot.rawDisciplines.reduce((acc, d) => acc + (d.wrongCount || 0), 0)
  }

  const answeredSum = correct + wrong
  if (accuracy === null && answeredSum > 0) {
    accuracy = Math.round((correct / answeredSum) * 100)
  }

  if (colSpan === 1) {
    return (
      <div
        className="p-3.5 sm:p-4 flex flex-col justify-between h-full space-y-2.5 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => router.push("/estatisticas")}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-primary" /> QUESTÕES
          </span>
          {realPct !== null ? (
            <span
              className={cn(
                "text-[10px] sm:text-[11px] font-black font-mono transition-colors",
                realPct >= 100 ? "text-emerald-600" : "text-primary",
              )}
            >
              {realPct}% da meta
            </span>
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground">
              Livre
            </span>
          )}
        </div>

        {/* Destaque das Questões Realizadas + Comparativo */}
        <div className="space-y-1.5 my-auto">
          <div className="flex items-baseline justify-between gap-1.5">
            <div>
              <span className="text-2xl sm:text-3xl font-black text-foreground font-mono leading-none tracking-tight">
                {achieved}
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold ml-1.5">
                resolvidas esta semana
              </span>
            </div>
            {diff !== null && (
              <span
                className={cn(
                  "text-[10px] sm:text-[11px] font-extrabold font-mono shrink-0",
                  diff >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                {diff >= 0 ? `+${diff} acima` : `${diff} da meta`}
              </span>
            )}
          </div>

          {/* Barra de Progresso com Preenchimento Dinâmico */}
          <div className="space-y-1">
            <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  realPct !== null && realPct >= 100
                    ? "bg-emerald-500"
                    : "bg-primary"
                )}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
              <span>Meta semanal: {target !== null ? target : "—"}</span>
              <span>
                {achieved} de {target !== null ? target : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé: Acertos, Erros e Aproveitamento */}
        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border/50 text-[10px] font-bold">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              <Check className="w-3 h-3 stroke-[2.5]" /> {correct} acertos
            </span>
            <span className="text-rose-500 flex items-center gap-0.5">
              <X className="w-3 h-3 stroke-[2.5]" /> {wrong} erros
            </span>
          </div>
          <div className="text-muted-foreground">
            Aprov:{" "}
            <span className="font-mono text-foreground font-black">
              {accuracy !== null ? `${accuracy}%` : "—"}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={() => router.push("/estatisticas")}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-primary" /> META DE QUESTÕES SEMANAL
        </span>
        {realPct !== null ? (
          <span
            className={cn(
              "text-xs font-black font-mono",
              realPct >= 100 ? "text-emerald-600" : "text-primary",
            )}
          >
            {realPct}% da Meta
          </span>
        ) : (
          <span className="text-xs font-black text-primary font-mono">
            {achieved} resolvidas
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border rounded-xl border bg-card my-auto">
        <div className="p-3 space-y-0.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Realizadas
          </span>
          <span className="text-2xl font-black font-mono text-foreground">{achieved}</span>
          <span className="text-[10px] text-muted-foreground font-medium block">
            esta semana
          </span>
        </div>

        <div className="p-3 space-y-0.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Meta Semanal
          </span>
          <span className="text-2xl font-black font-mono text-foreground">
            {target ?? "—"}
          </span>
          <span
            className={cn(
              "text-[10px] font-bold block",
              diff !== null && diff >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600"
            )}
          >
            {diff !== null
              ? diff >= 0
                ? `+${diff} acima`
                : `${diff} para meta`
              : "Sem meta"}
          </span>
        </div>

        <div className="p-3 space-y-0.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Acertos / Erros
          </span>
          <div className="flex items-baseline gap-1 text-2xl font-black font-mono">
            <span className="text-emerald-600 dark:text-emerald-400">{correct}</span>
            <span className="text-xs text-muted-foreground font-normal">/</span>
            <span className="text-rose-500">{wrong}</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-medium block">
            respostas
          </span>
        </div>

        <div className="p-3 space-y-0.5">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">
            Aproveitamento
          </span>
          <span className="text-2xl font-black font-mono text-primary">
            {accuracy !== null ? `${accuracy}%` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium block">
            taxa de acertos
          </span>
        </div>
      </div>

      <div className="space-y-1.5 pt-1 border-t">
        <div className="flex justify-between text-xs font-bold text-muted-foreground">
          <span>Progresso Semanal</span>
          <span className="text-foreground font-mono font-bold">
            {realPct !== null ? `${realPct}%` : "—"}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              realPct !== null && realPct >= 100
                ? "bg-emerald-500"
                : "bg-primary"
            )}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. WIDGET: Revisões
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetRevisoes({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const count = snapshot?.reviews?.count ?? 0

  if (colSpan === 1) {
    return (
      <div
        className="p-4 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => router.push("/dashboard/reviews")}
      >
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-purple-500" /> REVISÕES
          </span>
          <span className="text-[10px] font-black text-purple-600 font-mono">
            {count}
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">
            {count} pendentes
          </div>
          <div className="text-[11px] text-purple-600 font-bold mt-0.5">Clique para revisar</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={() => router.push("/dashboard/reviews")}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-purple-500" /> CENTRAL DE REVISÕES
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            router.push("/dashboard/reviews")
          }}
          className="h-7 text-xs font-bold text-purple-600 border-purple-500/30"
        >
          Ver Todas
        </Button>
      </div>
      <div className="flex items-center justify-between my-auto">
        <div>
          <div className="text-2xl font-black text-foreground font-mono">{count} pendentes</div>
          <p className="text-xs text-muted-foreground font-medium">Revisões agendadas para hoje</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. WIDGET: Metas de Estudo
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetMetasEstudo({ snapshot, onOpenGoalsModal }: DashboardWidgetProps) {
  const goals = snapshot?.analytics?.goals
  const hoursPct = goals?.weekly?.percentage ?? null
  const qPct = goals?.questions?.percentage ?? null
  const daysPct = goals?.studyDays?.percentage ?? null

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500" /> METAS DE ESTUDO SEMANAL
        </span>
        {onOpenGoalsModal && (
          <button
            type="button"
            onClick={onOpenGoalsModal}
            className="text-muted-foreground hover:text-foreground"
          >
            <SquarePen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 my-auto">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground">Horas</span>
            <span className="text-foreground font-mono">
              {hoursPct === null ? "—" : `${hoursPct}%`}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${hoursPct ?? 0}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground">Questões</span>
            <span className="text-foreground font-mono">{qPct === null ? "—" : `${qPct}%`}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${qPct ?? 0}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground">Dias Ativos</span>
            <span className="text-foreground font-mono">
              {daysPct === null ? "—" : `${daysPct}%`}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-orange-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${daysPct ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. WIDGET: Desempenho por Matéria (PLANO + CICLO + 30D, sem duplicar)
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetDesempenhoMateria({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const rows = snapshot?.rawDisciplines || []
  const contexts = snapshot?.subjectContexts || []

  const contextById = React.useMemo(() => {
    const map = new Map<string, (typeof contexts)[number]>()
    for (const c of contexts) map.set(c.discipline_id, c)
    return map
  }, [contexts])

  const ordered = React.useMemo(() => {
    const score = (id: string | undefined, hasHistory: boolean, lastStudiedAt: string | null) => {
      const ctx = id ? contextById.get(id) : undefined
      const planned = ctx?.planned ? 1 : 0
      const inCycle = ctx?.inCycle ? 1 : 0
      const current = ctx?.isCurrentInCycle ? 1 : 0
      const recent = ctx?.recent30d ? 1 : 0
      const recency = lastStudiedAt ? new Date(lastStudiedAt).getTime() : 0
      // Prioridade: atual do ciclo > ciclo > planejada > 30d > histórico total
      return (
        current * 1e15 +
        inCycle * 1e13 +
        planned * 1e11 +
        recent * 1e9 +
        (hasHistory ? 1e6 : 0) +
        recency / 1e9
      )
    }
    return [...rows]
      .map((disc) => {
        const ctx = disc.discipline_id ? contextById.get(disc.discipline_id) : undefined
        const hasHistory =
          disc.correctCount > 0 || disc.wrongCount > 0 || disc.tempoFormatted !== "-"
        return { disc, ctx, s: score(disc.discipline_id, hasHistory, ctx?.lastStudiedAt ?? null) }
      })
      .sort((a, b) => b.s - a.s)
  }, [rows, contextById])

  const limit = colSpan === 3 ? 8 : 4
  const visible = ordered.slice(0, limit)

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-primary" /> DESEMPENHO POR MATÉRIA
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/estatisticas")}
          className="text-xs font-bold text-primary"
        >
          Ver Todas <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b text-muted-foreground font-extrabold text-[10px] uppercase">
              <th className="pb-2 px-2">Disciplina</th>
              <th className="pb-2 px-2 text-center">Tempo</th>
              <th className="pb-2 px-2 text-center text-emerald-600">Acertos</th>
              <th className="pb-2 px-2 text-center text-rose-500">Erros</th>
              <th className="pb-2 px-2 text-center">%</th>
            </tr>
          </thead>
          <tbody className="divide-y font-semibold">
            {ordered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground font-medium text-xs"
                >
                  Nenhuma matéria disponível ainda.
                </td>
              </tr>
            ) : (
              visible.map(({ disc, ctx }, idx: number) => (
                <tr key={disc.id || idx} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-2 font-bold text-foreground truncate max-w-[150px]">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {ctx?.isCurrentInCycle && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[9px] font-black uppercase text-primary-foreground">
                          Atual
                        </span>
                      )}
                      <span className="truncate">{disc.name}</span>
                      {(ctx?.planned || ctx?.inCycle || ctx?.recent30d) && (
                        <span className="shrink-0 text-[9px] font-bold text-muted-foreground">
                          {[ctx?.planned ? "PLANO" : null, ctx?.inCycle ? "CICLO" : null, ctx?.recent30d ? "30D" : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-muted-foreground">
                    {disc.tempoFormatted}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-emerald-600">
                    {disc.correctCount}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-rose-500">
                    {disc.wrongCount}
                  </td>
                  <td className="py-2 px-2 text-center font-mono font-extrabold text-foreground">
                    {disc.accuracyPercentage}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. WIDGET: Ranking
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetRanking({ snapshot, colSpan }: DashboardWidgetProps) {
  // REGRA DE PONTOS DO RANKING DAS MATÉRIAS
  // A única regra de ranking por disciplina existente no sistema é baseada em
  // tempo de estudo (getDisciplineRanking). Para não criar uma segunda regra
  // incompatível, os pontos reutilizam essa métrica: 1 ponto = 1 minuto de
  // estudo na disciplina, acumulado no período de 30 dias (item.value).
  // A ordenação é determinística (minutos -> nº de sessões -> nome alfabético),
  // definida em application/study-analytics/rankings.ts.
  const ranking = snapshot?.analytics?.rankings?.disciplines || []

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-yellow-500" /> RANKING DAS MATÉRIAS
        </span>
      </div>

      <div className="space-y-2 my-auto">
        {ranking.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-medium">
            Sem dados suficientes para o ranking.
          </div>
        ) : (
          ranking.slice(0, colSpan === 3 ? 5 : 3).map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs font-bold"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center text-[10px] font-black shrink-0">
                  #{idx + 1}
                </span>
                <span className="truncate text-foreground">{item.name}</span>
                {typeof item.secondaryValue === "number" && item.secondaryValue > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                    {item.secondaryValue} sessões
                  </span>
                )}
              </div>
              <span className="font-mono text-primary shrink-0">{item.value ?? 0} pts</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. WIDGET: Últimas Atividades
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetUltimasAtividades({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const activities = snapshot?.recentActivities || []

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" /> ÚLTIMAS ATIVIDADES
        </span>
        <button
          type="button"
          onClick={() => router.push("/dashboard/history")}
          className="text-xs font-bold text-primary"
        >
          Ver Histórico
        </button>
      </div>

      <div className="space-y-2 my-auto">
        {activities.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground font-medium">
            Nenhuma atividade registrada recentemente.
          </div>
        ) : (
          activities.slice(0, colSpan === 3 ? 5 : 3).map((act) => (
            <div
              key={act.id}
              className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs"
            >
              <div className="space-y-0.5 truncate">
                <div className="font-bold text-foreground truncate">{act.discipline_name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {act.duration_minutes} min •{" "}
                  {new Date(act.started_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. WIDGET: Conquistas & Marcos
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetConquistas({ snapshot, colSpan }: DashboardWidgetProps) {
  const streak = snapshot?.stats?.consecutiveStreak ?? 0
  const totalMins = snapshot?.stats?.weeklyMinutes ?? 0

  const badges = [
    { title: "Primeiro Estudo", desc: "Concluiu o 1º ciclo", unlocked: totalMins > 0 },
    { title: "Consistência", desc: "Estudou 3 dias seguidos", unlocked: streak >= 3 },
    { title: "Maratona", desc: "Estudou +10 horas", unlocked: totalMins >= 600 },
    {
      title: "Mestre",
      desc: "Respondeu 50+ questões",
      unlocked: (snapshot?.stats?.totalQuestions ?? 0) >= 50,
    },
  ]

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-purple-500" /> CONQUISTAS & MARCOS
        </span>
        <span className="text-xs font-black text-purple-600 font-mono">
          {badges.filter((b) => b.unlocked).length} / {badges.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 my-auto">
        {badges.slice(0, colSpan === 1 ? 2 : 4).map((b, idx) => (
          <div
            key={idx}
            className={`p-2.5 rounded-xl border text-center space-y-1 transition-all ${
              b.unlocked
                ? "bg-purple-500/10 border-purple-500/30 text-purple-600"
                : "bg-muted/20 border-muted opacity-50"
            }`}
          >
            <Award className="w-5 h-5 mx-auto" />
            <div className="font-extrabold text-[11px] truncate">{b.title}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. WIDGET: Data da Prova
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetDataProva({ snapshot }: DashboardWidgetProps) {
  const targetDate = snapshot?.activeTarget?.exam_date
  const examName =
    snapshot?.activeTarget?.exam_name || snapshot?.activeTarget?.target_exam || "Prova"
  const local = snapshot?.activeTarget?.exam_location || "Local não informado"
  const time = snapshot?.activeTarget?.exam_time || "Horário não informado"

  const getDaysUntil = (date: string) => {
    const d = new Date(date + "T00:00:00")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = d.getTime() - today.getTime()
    return Math.round(diff / (1000 * 3600 * 24))
  }

  const daysUntil = targetDate ? getDaysUntil(targetDate) : null

  return (
    <div className="p-3 flex flex-col space-y-1.5">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-primary" /> DATA DA PROVA
        </span>
      </div>
      <div className="space-y-1">
        {targetDate ? (
          <>
            <div className="text-sm font-bold text-foreground leading-snug">{examName}</div>
            <div className="text-sm font-bold text-primary leading-tight">
              {new Date(targetDate + "T00:00:00").toLocaleDateString("pt-BR")}
              {daysUntil !== null && (
                <span className="block text-xs text-muted-foreground font-medium">
                  {daysUntil > 0 ? `Faltam ${daysUntil} dias` : "Prova hoje ou já realizada"}
                </span>
              )}
            </div>
            <div className="pt-1 text-xs text-muted-foreground grid gap-0.5 leading-snug">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" /> {local}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 shrink-0" /> {time}
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground font-medium text-center py-2">
            Nenhuma prova cadastrada.
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. WIDGET: Lembretes
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetLembretes({ snapshot: _snapshot, colSpan: _colSpan }: DashboardWidgetProps) {
  return <RemindersWidget embedded={true} className="p-4" />
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. WIDGET: Mensagem do Dia
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetMensagemDia(_props: DashboardWidgetProps) {
  const msg = getDailyMessage()

  return (
    <div className="p-4 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> MENSAGEM DO DIA
        </span>
        <span className="text-[10px] text-muted-foreground font-medium">{msg.category}</span>
      </div>
      <div className="my-auto space-y-2 text-center py-2">
        <p className="text-xs font-semibold italic text-foreground leading-relaxed">
          &ldquo;{msg.text}&rdquo;
        </p>
        <p className="text-[11px] font-bold text-muted-foreground">— {msg.author}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. WIDGET: Calendário
// ─────────────────────────────────────────────────────────────────────────────

function getIntensityClass(mins: number): string {
  if (mins <= 0) return "bg-transparent hover:bg-muted/50"
  if (mins < 60) return "bg-emerald-500/20 dark:bg-emerald-600/25"
  if (mins < 180) return "bg-emerald-500/35 dark:bg-emerald-600/45"
  if (mins < 300) return "bg-emerald-500/55 dark:bg-emerald-600/65"
  if (mins < 480) return "bg-emerald-500/75 dark:bg-emerald-500/80"
  return "bg-emerald-500 dark:bg-emerald-500"
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

export function WidgetCalendario({ snapshot, colSpan: _colSpan }: DashboardWidgetProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState("")
  const [manualModalOpen, setManualModalOpen] = React.useState(false)
  const [manualDate, setManualDate] = React.useState("")

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  ).getDate()
  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  ).getDay()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const paddedMonth = String(month).padStart(2, "0")
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month

  const dailyTargetMinutes = snapshot?.user?.weekly_study_hours
    ? Math.round((snapshot.user.weekly_study_hours * 60) / 7)
    : null

  const fetchCalendarData = React.useCallback(async () => {
    const { getMonthlyDailyTotalsAction, getMonthlyStatsAction } = await import(
      "@/application/study-history/study-history.actions"
    )
    const [totalsRes, statsRes] = await Promise.all([
      getMonthlyDailyTotalsAction(year, month),
      getMonthlyStatsAction(year, month),
    ])
    return {
      dailyTotals: totalsRes.data ?? [],
      monthlyStats: statsRes.data ?? null,
    }
  }, [year, month])

  const { data: calendarData, refresh: refreshCalendar } = useCachedServerAction(
    `monthlyCalendar:${year}:${month}`,
    fetchCalendarData,
    5 * 60 * 1000,
  )

  const dailyTotals = calendarData?.dailyTotals ?? []
  const monthlyStats = calendarData?.monthlyStats ?? null

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(year, currentDate.getMonth() + delta, 1))
  }

  const getMinutesForDay = (day: number) => {
    const dateKey = `${year}-${paddedMonth}-${String(day).padStart(2, "0")}`
    return dailyTotals.find((d) => d.date === dateKey)?.minutes ?? 0
  }

  const handleDayClick = (day: number) => {
    const dateKey = `${year}-${paddedMonth}-${String(day).padStart(2, "0")}`
    const mins = getMinutesForDay(day)
    if (mins > 0) {
      setSelectedDate(dateKey)
      setDetailOpen(true)
    } else {
      setManualDate(dateKey)
      setManualModalOpen(true)
    }
  }

  const monthName = MONTH_NAMES[currentDate.getMonth()] ?? ""
  const weekDays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]

  return (
    <div className="p-3 sm:p-3.5 flex flex-col h-auto bg-card">
      {/* Cabeçalho — mesmo padrão dos demais widgets do dashboard */}
      <div className="flex items-center justify-between border-b pb-2 mb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          {monthName} {year}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => changeMonth(-1)}
            className="p-1 hover:bg-muted rounded-md cursor-pointer transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => changeMonth(1)}
            className="p-1 hover:bg-muted rounded-md cursor-pointer transition-colors"
            aria-label="Próximo mês"
          >
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Stats do mês — linha única compacta */}
      {monthlyStats && monthlyStats.totalMinutes > 0 && (
        <div className="flex items-center justify-center gap-1.5 mb-2 text-[10px] sm:text-[11px] text-muted-foreground font-semibold whitespace-nowrap">
          <span>
            Total <strong className="text-foreground font-mono font-bold">{formatDurationMinutes(monthlyStats.totalMinutes)}</strong>
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span>
            Média <strong className="text-foreground font-mono font-bold">{formatDurationMinutes(monthlyStats.averageMinutes)}</strong>/dia
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span>
            <strong className="text-foreground font-mono font-bold">{monthlyStats.daysStudied}</strong> dias
          </span>
        </div>
      )}

      {/* Grid do calendário */}
      <div className="grid grid-cols-7 gap-[3px] sm:gap-1 text-center">
        {/* Cabeçalho dos dias da semana */}
        {weekDays.map((d, i) => (
          <div key={i} className="text-[10px] sm:text-xs font-bold text-muted-foreground pb-1">
            {d}
          </div>
        ))}

        {/* Dias vazios */}
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Dias do mês */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = `${year}-${paddedMonth}-${String(day).padStart(2, "0")}`
          const isToday = isCurrentMonth && dateKey === todayStr
          const mins = getMinutesForDay(day)
          const intensityClass = getIntensityClass(mins)
          const goalPct =
            dailyTargetMinutes && mins > 0
              ? Math.min(100, Math.round((mins / dailyTargetMinutes) * 100))
              : null

          return (
            <button
              key={i}
              onClick={() => handleDayClick(day)}
              aria-label={`${day} de ${monthName} de ${year}${mins > 0 ? `, ${formatDurationMinutes(mins)} estudados` : ""}`}
              className={`relative rounded-lg font-medium flex flex-col items-center justify-center gap-0.5
                ${mins > 0 ? "p-1 sm:p-1.5 min-h-[56px] sm:min-h-[62px]" : "p-0.5 sm:p-1 min-h-[34px] sm:min-h-[38px]"}
                cursor-pointer transition-all duration-150
                hover:brightness-105 hover:scale-[1.02]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                ${intensityClass}
                ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""}
              `}
              title={`${day}/${paddedMonth}/${year}${mins > 0 ? ` — ${formatDurationMinutes(mins)} estudados` : " — Clique para registrar estudo"}`}
            >
              {/* Dia */}
              <span
                className={`text-[11px] sm:text-sm leading-none font-bold ${
                  isToday
                    ? "text-primary"
                    : mins > 0
                      ? "text-emerald-950 dark:text-emerald-50"
                      : "text-muted-foreground"
                }`}
              >
                {day}
              </span>

              {/* Tempo estudado */}
              {mins > 0 && (
                <span className="text-[9px] sm:text-[10px] leading-none font-semibold text-emerald-900/80 dark:text-emerald-100/80">
                  {formatDurationMinutes(mins)}
                </span>
              )}

              {/* Percentual da meta */}
              {goalPct !== null && (
                <span
                  className={[
                    "text-[8px] sm:text-[9px] leading-none font-bold",
                    goalPct >= 100
                      ? "text-emerald-900 dark:text-emerald-200"
                      : "text-emerald-900/70 dark:text-emerald-200/70",
                  ].join(" ")}
                >
                  {goalPct}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legenda do heatmap */}
      <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-border/50">
        <span className="text-[10px] sm:text-xs text-muted-foreground font-semibold mr-1">Menos</span>
        {[
          "bg-emerald-500/20 dark:bg-emerald-600/25",
          "bg-emerald-500/35 dark:bg-emerald-600/45",
          "bg-emerald-500/55 dark:bg-emerald-600/65",
          "bg-emerald-500/75 dark:bg-emerald-500/80",
          "bg-emerald-500 dark:bg-emerald-500",
        ].map((cls, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-xs ${cls}`}
          />
        ))}
        <span className="text-[10px] sm:text-xs text-muted-foreground font-semibold ml-1">Mais</span>
      </div>

      {/* Modal de detalhes do dia */}
      <DayDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        date={selectedDate}
      />

      {/* Modal de registro manual (para dias sem estudo) */}
      <ManualStudyTimeModal
        open={manualModalOpen}
        onOpenChange={setManualModalOpen}
        dateStr={manualDate}
        onSaved={refreshCalendar}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. WIDGET: Ciclo de Estudo
// ─────────────────────────────────────────────────────────────────────────────
function WidgetCicloEstudoWrapper(_props: DashboardWidgetProps) {
  return <IntelligentCycleWidget embedded={true} />
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO MASTER DE WIDGETS
// ─────────────────────────────────────────────────────────────────────────────
export const WIDGET_REGISTRY: Record<
  string,
  {
    name: string
    description: string
    defaultSpan: 1 | 2 | 3
    component: React.ComponentType<DashboardWidgetProps>
  }
> = {
  calendario: {
    name: "Calendário",
    description: "Calendário mensal para visualizar datas e navegar entre os meses.",
    defaultSpan: 2,
    component: WidgetCalendario,
  },
  tempo_estudo: {
    name: "Tempo de Estudo",
    description: "Exibe horas estudadas no dia e semana em relação à sua meta.",
    defaultSpan: 1,
    component: WidgetTempoEstudo,
  },
  desempenho: {
    name: "Desempenho Geral",
    description: "Métricas de acurácia, taxa de acertos e acertos vs erros.",
    defaultSpan: 1,
    component: WidgetDesempenho,
  },
  progresso_edital: {
    name: "Progresso no Edital",
    description: "Percentual de cobertura e disciplinas concluídas.",
    defaultSpan: 1,
    component: WidgetProgressoEdital,
  },
  estudos_hoje: {
    name: "Estudos de Hoje (Visão Diária)",
    description: "Cronograma diário com disciplinas agendadas e botão Iniciar Estudo.",
    defaultSpan: 3,
    component: WidgetEstudosHoje,
  },
  constancia: {
    name: "Constância nos Estudos",
    description: "Sequência de dias consecutivos estudando (Streak).",
    defaultSpan: 1,
    component: WidgetConstancia,
  },
  questoes: {
    name: "Questões",
    description: "Acompanhamento da meta semanal de questões resolvidas.",
    defaultSpan: 1,
    component: WidgetQuestoes,
  },
  revisoes: {
    name: "Revisões",
    description: "Revisões pendentes e agendadas para o dia.",
    defaultSpan: 1,
    component: WidgetRevisoes,
  },
  desempenho_materia: {
    name: "Desempenho por Matéria",
    description: "Tabela com tempo estudado, questões e acurácia por matéria.",
    defaultSpan: 2,
    component: WidgetDesempenhoMateria,
  },
  ultimas_atividades: {
    name: "Últimas Atividades",
    description: "Histórico das últimas sessões de estudo realizadas.",
    defaultSpan: 1,
    component: WidgetUltimasAtividades,
  },
  metas_estudo: {
    name: "Metas de Estudo",
    description: "Barras de progresso para horas, questões e dias ativos.",
    defaultSpan: 1,
    component: WidgetMetasEstudo,
  },
  ranking: {
    name: "Ranking",
    description: "Classificação por pontos das suas matérias e áreas.",
    defaultSpan: 1,
    component: WidgetRanking,
  },
  conquistas: {
    name: "Conquistas",
    description: "Medalhas e marcos de evolução desbloqueados.",
    defaultSpan: 1,
    component: WidgetConquistas,
  },
  data_prova: {
    name: "Data da Prova",
    description: "Exibe a contagem ou data da prova cadastrada.",
    defaultSpan: 1,
    component: WidgetDataProva,
  },
  lembretes: {
    name: "Lembretes",
    description: "Lista de lembretes e avisos importantes.",
    defaultSpan: 1,
    component: WidgetLembretes,
  },
  mensagem_dia: {
    name: "Mensagem do Dia",
    description: "Uma mensagem motivacional para começar o dia.",
    defaultSpan: 1,
    component: WidgetMensagemDia,
  },
  ciclo_estudo: {
    name: "Ciclo de Estudo",
    description: "Resumo inteligente do ciclo de estudo ativo com volta, matéria em foco e próxima.",
    defaultSpan: 3,
    component: WidgetCicloEstudoWrapper,
  },
}
