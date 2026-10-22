"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  SquarePen,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { formatDurationMinutes } from "@/lib/format-duration"
import {
  dailyBars,
  dashboardMilestones,
  lastSevenDaysActivity,
  percentOrDash,
} from "@/features/dashboard/lib/widget-display"

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
import { alignHistoryToBlocks } from "@/application/dashboard/dashboard-identity"
import { type StudyCycleBlock } from "@/features/planejamento/components/planning-view"
import { STUDY_SESSION_SAVED_EVENT, shouldWidgetRefreshOnSaved } from "@/features/study-session/lib/study-session-events"

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
  // Fase I.8: o histórico de estudo alimenta dailyMinutes/weeklyMinutes. Se a
  // leitura falhou, `dataIssues.history` distingue isso de "0 minutos hoje" —
  // sem essa flag, uma falha de leitura mostrava um "0min" indistinguível de
  // um dia real sem estudo.
  const historyUnavailable = snapshot?.dataIssues?.history === true
  const weeklyMins =
    snapshot?.analytics?.stats?.weeklyMinutes ?? snapshot?.stats?.weeklyMinutes ?? 0
  const dailyMins = snapshot?.analytics?.stats?.dailyMinutes ?? snapshot?.stats?.dailyMinutes ?? 0
  const dailyDisplay = historyUnavailable ? "—" : formatDurationMinutes(dailyMins)
  const weeklyDisplay = historyUnavailable ? "—" : formatDurationMinutes(weeklyMins)
  const weeklyHours = snapshot?.user?.weekly_study_hours
  const targetMins = weeklyHours ? weeklyHours * 60 : null

  const pct = historyUnavailable
    ? null
    : targetMins
      ? Math.min(100, Math.round((weeklyMins / targetMins) * 100))
      : null

  if (colSpan === 1) {
    return (
      <div className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2.5">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Tempo de estudo
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {pct === null ? "—" : `${pct}%`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 my-auto">
          <div>
            <span className="type-label block mb-0.5">Hoje</span>
            <span className="metric-value text-sm sm:text-base text-foreground">
              {dailyDisplay}
            </span>
          </div>
          <div className="text-right">
            <span className="type-label block mb-0.5">
              Semana
            </span>
            <span className="metric-value text-sm sm:text-base text-foreground">
              {weeklyDisplay}
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
      <div className="p-3 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Tempo de estudo semanal
          </span>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {pct === null ? "—" : `${pct}% Concluído`}
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border border-y border-border my-auto">
          <div className="p-2.5">
            <span className="type-label block">
              Hoje
            </span>
            <span className="metric-value text-base text-foreground">
              {dailyDisplay}
            </span>
          </div>
          <div className="p-2.5">
            <span className="type-label block">
              Esta Semana
            </span>
            <span className="metric-value text-base text-foreground">
              {weeklyDisplay}
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
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Painel geral de tempo de estudo
        </span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          Meta Semanal: {targetMins === null ? "Não definida" : formatDurationMinutes(targetMins)}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border border-y border-border">
        <div className="p-3.5">
          <span className="type-label block">
            Hoje
          </span>
          <span className="metric-value text-xl text-foreground">
            {dailyDisplay}
          </span>
        </div>
        <div className="p-3.5">
          <span className="type-label block">
            Esta Semana
          </span>
          <span className="metric-value text-xl text-foreground">
            {weeklyDisplay}
          </span>
        </div>
        <div className="p-3.5">
          <span className="type-label block">
            Progresso
          </span>
          <span className="metric-value text-xl text-foreground">{percentOrDash(pct)}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-muted-foreground">
            Distribuição diária
          </span>
          <div className="flex gap-2">
            {/* Fase H: rótulo = dia real de cada ponto (últimos 7 dias corridos). */}
            {dailyBars(snapshot?.analytics?.evolution).map((bar) => (
              <div key={bar.key} className="flex flex-col items-center gap-1">
                <div
                  className="w-2 bg-muted rounded-full h-12 relative flex items-end"
                  title={`${bar.key}: ${formatDurationMinutes(bar.minutes)}`}
                >
                  <div
                    className="bg-primary w-full rounded-full transition-all"
                    style={{ height: `${bar.heightPct}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground">{bar.label}</span>
              </div>
            ))}
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
    // G2.21: o período escolhido só era indicado pela cor; agora o leitor de
    // tela ouve "pressionado" (mesmo padrão do seletor de período de Simulados).
    <div
      role="group"
      aria-label="Período do desempenho"
      className={cn(
        "inline-flex items-center p-0.5 bg-muted rounded-md text-[11px] font-medium",
        className,
      )}
    >
      {PERFORMANCE_PERIOD_OPTIONS.map((opt) => {
        const isActive = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isActive}
            onClick={(e) => {
              e.stopPropagation()
              onChange(opt.key)
            }}
            className={cn(
              "px-2 py-1 rounded-[5px] transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
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

  // Fase I.9: totalQuestions/correctQuestions/wrongQuestions/accuracyPercentage
  // (em qualquer período) vêm de rawHistory + question_attempts combinados. Se
  // qualquer uma das duas leituras falhou, esses números são um "0" fabricado,
  // não um desempenho real — inclusive o ranking de matérias por tempo (que
  // vem só de rawHistory).
  const desempenhoUnavailable =
    snapshot?.dataIssues?.history === true || snapshot?.dataIssues?.attempts === true

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
  // Fase H: sem questões no período não existe acurácia — "—", não "0%".
  // Fase I.9: leitura indisponível também é "—", nunca um número calculado.
  const accuracyText = desempenhoUnavailable ? "—" : percentOrDash(accuracy, total > 0)
  const totalDisplay = desempenhoUnavailable ? "—" : total
  const correctDisplay = desempenhoUnavailable ? "—" : correct
  const wrongDisplay = desempenhoUnavailable ? "—" : wrong
  const disciplineRanking = desempenhoUnavailable ? [] : snapshot?.analytics?.rankings?.disciplines || []
  const periodLabel =
    PERFORMANCE_PERIOD_OPTIONS.find((o) => o.key === selectedPeriod)?.label || "Semana"

  if (colSpan === 1) {
    return (
      <div className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Desempenho
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {accuracyText}
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
          <div className="metric-value text-xl sm:text-2xl text-foreground">
            {accuracyText}
          </div>
          <div className="text-right text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-tight">
            <div>
              <strong className="text-emerald-700 dark:text-emerald-400 font-semibold">{correctDisplay}</strong> acertos
            </div>
            <div>
              <strong className="text-rose-600 dark:text-rose-400 font-semibold">{wrongDisplay}</strong> erros
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold text-muted-foreground border-t pt-1.5">
          <span>Total ({periodLabel})</span>
          <span className="tabular-nums text-foreground font-semibold">{totalDisplay} questões</span>
        </div>
      </div>
    )
  }

  if (colSpan === 2) {
    return (
      <div className="p-3 flex flex-col justify-between h-full space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Desempenho geral
          </span>
          {/* G2.22: em 320 px o seletor + "75% Acurácia" não cabiam na mesma linha e a
              palavra estourava o card. Agora o par quebra para a linha de baixo,
              inteiro (sem cortar o valor nem o rótulo). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
            <PerformancePeriodSelector
              value={selectedPeriod}
              onChange={setSelectedPeriod}
            />
            <span
              data-testid="desempenho-acuracia"
              className="whitespace-nowrap text-xs font-medium text-muted-foreground tabular-nums"
            >
              {accuracyText} Acurácia
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 my-auto">
          <div className="flex items-center gap-3">
            <span className="metric-value text-xl text-foreground">{accuracyText}</span>
            <div className="text-xs text-muted-foreground font-medium">
              <div>
                <strong className="text-emerald-700 dark:text-emerald-400">{correctDisplay}</strong> acertos
              </div>
              <div>
                <strong className="text-rose-600 dark:text-rose-400">{wrongDisplay}</strong> erros
              </div>
            </div>
          </div>
          <div className="text-right text-xs font-semibold text-muted-foreground">
            Total ({periodLabel}):{" "}
            <span className="tabular-nums text-foreground font-semibold">{totalDisplay}</span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${desempenhoUnavailable ? 0 : accuracy}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Desempenho & taxa de acerto
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
          <PerformancePeriodSelector
            value={selectedPeriod}
            onChange={setSelectedPeriod}
          />
          <span className="whitespace-nowrap text-xs font-medium text-muted-foreground tabular-nums">
            Aproveitamento: {accuracyText}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border rounded-xl border bg-card">
        <div className="p-3 text-center">
          <span className="type-label block">
            Total ({periodLabel})
          </span>
          <span className="metric-value text-lg text-foreground">{totalDisplay}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold block">Acertos</span>
          <span className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{correctDisplay}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold block">Erros</span>
          <span className="text-lg font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{wrongDisplay}</span>
        </div>
        <div className="p-3 text-center">
          <span className="type-label block">Precisão</span>
          <span className="metric-value text-lg text-foreground">{accuracyText}</span>
        </div>
      </div>

      {/* Fase H: a lista antiga dizia "Melhores desempenhos por matéria" e
          mostrava sempre "0%" (lia campos que o ranking não tem). O ranking é
          por TEMPO de estudo no histórico, então é isso que ela mostra. */}
      {disciplineRanking.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Matérias mais estudadas (tempo total)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {disciplineRanking.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-[11px] font-semibold"
              >
                <span className="truncate pr-2">{item.name}</span>
                <span className="text-foreground tabular-nums">
                  {formatDurationMinutes(item.value)}
                </span>
              </div>
            ))}
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
  // Fase I.8: cobertura do edital vem de `getUserDisciplines` — se a leitura
  // falhou, "0%"/"0 matérias" pareceria um edital vazio, quando na verdade
  // não sabemos o real progresso.
  const disciplinesUnavailable = snapshot?.dataIssues?.disciplines === true
  const progress = snapshot?.stats?.editalProgress ?? 0
  const completed = snapshot?.stats?.completedTopics ?? 0
  const total = snapshot?.disciplinesStats?.total ?? 0
  const progressBadge = disciplinesUnavailable ? "—" : `${progress}%`
  const progressBadgeLong = disciplinesUnavailable ? "—" : `${progress}% Concluído`
  const completedLabel = disciplinesUnavailable ? "—" : String(completed)
  const totalLabel = disciplinesUnavailable ? "—" : String(total)
  const progressBarPct = disciplinesUnavailable ? 0 : progress

  if (colSpan === 1) {
    return (
      <div
        className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => router.push("/edital")}
      >
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Progresso no edital
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {progressBadge}
          </span>
        </div>
        <div className="my-auto flex items-baseline justify-between">
          <span className="metric-value text-xl sm:text-2xl text-foreground">
            {completedLabel} <span className="text-xs text-muted-foreground font-semibold">/ {totalLabel}</span>
          </span>
          <span className="text-[10px] text-muted-foreground font-semibold">matérias</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progressBarPct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-3 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={() => router.push("/edital")}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Progresso no edital
        </span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {progressBadgeLong}
        </span>
      </div>
      <div className="space-y-2 my-auto">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
          <span>Cobertura do conteúdo</span>
          <span className="text-foreground tabular-nums font-semibold">
            {completedLabel} / {totalLabel} matérias
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progressBarPct}%` }}
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
  // Fase I.8: streak/heatmap vêm do histórico de estudo — se a leitura
  // falhou, mostrar "—" em vez de "0 dias seguidos" (uma sequência quebrada
  // que nunca aconteceu).
  const historyUnavailable = snapshot?.dataIssues?.history === true
  const streak =
    snapshot?.analytics?.stats?.consecutiveStreak ?? snapshot?.stats?.consecutiveStreak ?? 0
  const longest =
    snapshot?.analytics?.stats?.longestStreak ?? snapshot?.stats?.longestStreak ?? streak
  const heatmap = historyUnavailable ? [] : snapshot?.analytics?.heatmap || []
  const streakBadge = historyUnavailable ? "—" : `${streak}d`
  const streakBig = historyUnavailable ? "—" : String(streak)
  const recordeBadge = historyUnavailable ? "—" : `${longest}d`
  const streakConsecutiveLabel = historyUnavailable ? "—" : `${streak} dias consecutivos`
  const longestLabel = historyUnavailable ? "—" : `${longest} dias`

  if (colSpan === 1) {
    return (
      <div className="p-3 sm:p-3.5 flex flex-col justify-between h-full space-y-2.5">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Constância
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {streakBadge}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 my-auto">
          <div>
            <span className="metric-value text-xl sm:text-2xl text-foreground">
              {streakBig}
            </span>
            <span className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold ml-1">dias seguidos</span>
          </div>
          <div className="text-right text-[10px] sm:text-[11px] text-muted-foreground font-semibold leading-tight">
            Recorde: <span className="text-foreground font-semibold">{recordeBadge}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border/50">
          <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">
            Registro diário
          </span>
          <div className="flex items-center gap-1">
            {/* Fase H: verde só nos dias com estudo (antes `idx < streak`
                pintava os dias mais antigos da fileira). */}
            {lastSevenDaysActivity(heatmap).map((day, idx) => {
              const studied = day.studied
              return (
                <div
                  key={idx}
                  className={`w-2.5 h-2.5 rounded-xs transition-all ${
                    studied ? "bg-primary" : "bg-muted-foreground/20"
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
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Constância e sequência ativa
        </span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {streakConsecutiveLabel}
        </span>
      </div>
      <div className="flex items-center justify-between my-auto">
        <div>
          <span className="metric-value text-2xl text-foreground">{streakBig}</span>
          <span className="text-xs text-muted-foreground font-semibold ml-1">dias seguidos</span>
        </div>
        <div className="text-right text-xs text-muted-foreground font-semibold">
          Maior sequência: <span className="text-foreground font-semibold">{longestLabel}</span>
        </div>
      </div>

      {heatmap.length > 0 && (
        <div className="pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Registro diário
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
                      studied ? "bg-primary" : "bg-muted-foreground/20"
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
export function WidgetEstudosHoje({ snapshot, cycleBlocks }: DashboardWidgetProps) {
  const { data: history, refresh, serverBacked } = useCachedServerAction<RecentHistoryEntry[]>(
    "recentStudyHistory:14",
    () => getRecentStudyHistoryAction(14).then((res) => res.data ?? []),
    5 * 60 * 1000,
  )

  React.useEffect(() => {
    // Fase F.2: com router.refresh() a caminho (estudo salvo online), a lista
    // de 14 dias chega pelo servidor — não busca 2×. Sync offline: busca aqui.
    const load = (event: Event) => {
      if (!shouldWidgetRefreshOnSaved(event, serverBacked)) return
      void refresh()
    }
    window.addEventListener(STUDY_SESSION_SAVED_EVENT, load)
    return () => window.removeEventListener(STUDY_SESSION_SAVED_EVENT, load)
  }, [refresh, serverBacked])

  // G2.14: estudo lançado num alias conta no bloco da mesma identidade
  // canônica (e vice-versa). Hoje, timezone, duração e distribuição continuam
  // sendo os do componente do plano — só o id da disciplina é alinhado.
  const alignedHistory = React.useMemo(
    () => alignHistoryToBlocks(history ?? [], cycleBlocks.map((b) => b.disciplineId), snapshot?.disciplineIdentity),
    [history, cycleBlocks, snapshot?.disciplineIdentity],
  )

  return (
    <div className="w-full">
      <DailyPlanningView blocks={cycleBlocks} history={alignedHistory} embedded={true} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WIDGET: Questões
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetQuestoes({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()

  // Fase I.9: total/correct/wrong/accuracy (histórico completo) e achieved
  // (semana, via analytics.goals) vêm de rawHistory + question_attempts. Se
  // qualquer uma das duas leituras falhou, esses números não podem aparecer
  // como se fossem reais — inclusive o fallback que soma `rawDisciplines`,
  // já que `rawDisciplines.correctCount/wrongCount` são derivados das MESMAS
  // leituras em dashboard.service.ts (não é uma fonte independente).
  const questoesUnavailable =
    snapshot?.dataIssues?.history === true || snapshot?.dataIssues?.attempts === true
  // Meta (target) vem do perfil — se o perfil falhou, não sabemos se existe
  // meta configurada; "Livre"/target null ficaria indistinguível de "sem meta".
  const metaUnavailable = snapshot?.dataIssues?.profile === true

  const total = questoesUnavailable ? 0 : (snapshot?.stats?.totalQuestions ?? 0)
  const target = metaUnavailable ? null : (snapshot?.analytics?.goals?.questions?.target ?? null)
  // Fase H: sem o dado da semana, 0 — antes caía no TOTAL de todo o histórico,
  // exibido como "resolvidas esta semana".
  const achieved = questoesUnavailable ? 0 : (snapshot?.analytics?.goals?.questions?.achieved ?? 0)

  // Porcentagem REAL (sem travar em 100%, ex: 90 / 50 = 180%)
  const realPct =
    !questoesUnavailable && !metaUnavailable && target && target > 0
      ? Math.round((achieved / target) * 100)
      : null
  const progressWidth = Math.min(100, realPct ?? 0)

  // Diferença em relação à meta
  const diff = !questoesUnavailable && !metaUnavailable && target !== null ? achieved - target : null

  // Acertos, Erros e Aproveitamento
  let correct = questoesUnavailable ? 0 : (snapshot?.stats?.correctQuestions ?? 0)
  let wrong = questoesUnavailable ? 0 : (snapshot?.stats?.wrongQuestions ?? 0)
  let accuracy = questoesUnavailable ? null : (snapshot?.stats?.accuracyPercentage ?? null)

  // Fase I.9: fallback cruzado só é seguro quando a fonte principal NÃO
  // falhou — senão estaríamos "confirmando" um zero fabricado com dados que
  // vêm da mesma leitura quebrada.
  if (
    !questoesUnavailable &&
    correct === 0 &&
    wrong === 0 &&
    snapshot?.rawDisciplines &&
    snapshot.rawDisciplines.length > 0
  ) {
    correct = snapshot.rawDisciplines.reduce((acc, d) => acc + (d.correctCount || 0), 0)
    wrong = snapshot.rawDisciplines.reduce((acc, d) => acc + (d.wrongCount || 0), 0)
  }

  const answeredSum = correct + wrong
  if (!questoesUnavailable && accuracy === null && answeredSum > 0) {
    accuracy = Math.round((correct / answeredSum) * 100)
  }
  // Fase H: sem nenhuma questão respondida não há aproveitamento ("—", não "0%").
  if (!questoesUnavailable && answeredSum === 0 && total === 0) accuracy = null

  // Fase I.9: textos de exibição — "—" quando indisponível, nunca o número
  // (forçado a 0 acima só para as contas de barra/diff, nunca renderizado).
  const achievedDisplay = questoesUnavailable ? "—" : achieved
  const correctDisplay = questoesUnavailable ? "—" : correct
  const wrongDisplay = questoesUnavailable ? "—" : wrong
  const accuracyDisplay = accuracy !== null ? `${accuracy}%` : "—"
  const targetDisplay = metaUnavailable ? "indisponível" : target !== null ? target : "—"

  if (colSpan === 1) {
    return (
      <div
        className="p-3 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => router.push("/estatisticas")}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[13px] font-semibold text-foreground">
            Questões
          </span>
          {questoesUnavailable || metaUnavailable ? (
            <span className="text-[10px] font-semibold text-muted-foreground">
              Indisponível
            </span>
          ) : realPct !== null ? (
            <span
              className={cn(
                "text-[11px] font-medium tabular-nums transition-colors",
                realPct >= 100 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {realPct}% da meta
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-muted-foreground">
              Livre
            </span>
          )}
        </div>

        {/* Destaque das Questões Realizadas + Comparativo */}
        <div className="space-y-1.5 my-auto">
          <div className="flex items-baseline justify-between gap-1.5">
            <div>
              <span className="metric-value text-xl sm:text-2xl leading-none text-foreground">
                {achievedDisplay}
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold ml-1.5">
                resolvidas esta semana
              </span>
            </div>
            {diff !== null && (
              <span
                className={cn(
                  "text-[10px] sm:text-[11px] font-semibold tabular-nums shrink-0",
                  diff >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400"
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
                  "bg-primary"
                )}
                style={{ width: `${progressWidth}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
              <span>Meta semanal: {targetDisplay}</span>
              <span>
                {achievedDisplay} de {targetDisplay}
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé: Acertos, Erros e Aproveitamento */}
        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border/50 text-[10px] font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
              <Check className="w-3 h-3 stroke-[2.5]" /> {correctDisplay} acertos
            </span>
            <span className="text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
              <X className="w-3 h-3 stroke-[2.5]" /> {wrongDisplay} erros
            </span>
          </div>
          <div className="text-muted-foreground" title="Acertos, erros e aproveitamento de todo o histórico">
            Aprov. total:{" "}
            <span className="tabular-nums text-foreground font-semibold">
              {accuracyDisplay}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-3 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
      onClick={() => router.push("/estatisticas")}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Meta de questões semanal
        </span>
        {questoesUnavailable || metaUnavailable ? (
          <span className="text-xs font-semibold text-muted-foreground">
            Indisponível
          </span>
        ) : realPct !== null ? (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              realPct >= 100 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {realPct}% da meta
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {achievedDisplay} resolvidas
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border rounded-xl border bg-card my-auto">
        <div className="p-3 space-y-0.5">
          <span className="type-label block">
            Realizadas
          </span>
          <span className="metric-value text-xl text-foreground">{achievedDisplay}</span>
          <span className="text-[10px] text-muted-foreground font-medium block">
            esta semana
          </span>
        </div>

        <div className="p-3 space-y-0.5">
          <span className="type-label block">
            Meta semanal
          </span>
          <span className="metric-value text-xl text-foreground">
            {targetDisplay}
          </span>
          <span
            className={cn(
              "text-[10px] font-bold block",
              diff !== null && diff >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            )}
          >
            {questoesUnavailable
              ? "Indisponível"
              : metaUnavailable
              ? "Meta indisponível"
              : diff !== null
              ? diff >= 0
                ? `+${diff} acima`
                : `${diff} para meta`
              : "Sem meta"}
          </span>
        </div>

        <div className="p-3 space-y-0.5">
          <span className="type-label block">
            Acertos / Erros
          </span>
          <div className="flex items-baseline gap-1 text-xl font-semibold tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">{correctDisplay}</span>
            <span className="text-xs text-muted-foreground font-normal">/</span>
            <span className="text-rose-600 dark:text-rose-400">{wrongDisplay}</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-medium block">
            respostas (total)
          </span>
        </div>

        <div className="p-3 space-y-0.5">
          <span className="type-label block">
            Aproveitamento
          </span>
          <span className="metric-value text-xl text-foreground">
            {accuracyDisplay}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium block">
            taxa de acertos (total)
          </span>
        </div>
      </div>

      <div className="space-y-1.5 pt-1 border-t">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
          <span>Progresso semanal</span>
          <span className="text-foreground tabular-nums font-semibold">
            {questoesUnavailable || metaUnavailable ? "—" : realPct !== null ? `${realPct}%` : "—"}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              "bg-primary"
            )}
            style={{ width: `${progressWidth}%` }}
          />
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
  // Fase I.9: cada meta cruza a config do perfil (target) com uma leitura de
  // dados (achieved). Se qualquer uma falhou, o percentual é fabricado — não
  // dá para saber se "sem meta" é real ou se é a leitura que quebrou.
  const profileFailed = snapshot?.dataIssues?.profile === true
  const historyFailed = snapshot?.dataIssues?.history === true
  const attemptsFailed = snapshot?.dataIssues?.attempts === true

  const hoursUnavailable = profileFailed || historyFailed
  const questionsUnavailable = profileFailed || historyFailed || attemptsFailed
  const daysUnavailable = profileFailed || historyFailed

  const hoursPct = hoursUnavailable ? null : (goals?.weekly?.percentage ?? null)
  const qPct = questionsUnavailable ? null : (goals?.questions?.percentage ?? null)
  const daysPct = daysUnavailable ? null : (goals?.studyDays?.percentage ?? null)

  const hoursText = hoursUnavailable ? "indisponível" : hoursPct === null ? "—" : `${hoursPct}%`
  const qText = questionsUnavailable ? "indisponível" : qPct === null ? "—" : `${qPct}%`
  const daysText = daysUnavailable ? "indisponível" : daysPct === null ? "—" : `${daysPct}%`

  return (
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Metas de estudo semanal
        </span>
        {onOpenGoalsModal && (
          <button
            type="button"
            onClick={onOpenGoalsModal}
            aria-label="Editar metas semanais"
            title="Editar metas semanais"
            className="-m-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <SquarePen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 my-auto">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Horas</span>
            <span className="text-foreground tabular-nums">
              {hoursText}
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
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Questões</span>
            <span className="text-foreground tabular-nums">{qText}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${qPct ?? 0}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Dias ativos</span>
            <span className="text-foreground tabular-nums">
              {daysText}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${daysPct ?? 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Cor da barra de acerto. V2.5: uma cor só (a da marca) para a quantidade; a
 * terracota marca apenas o que pede atenção (< 50%). Antes eram verde/âmbar/
 * vermelho em todas as linhas — o "semáforo" que deixava o painel com cara de
 * gerado e competia com o resto da tela. O número continua escrito ao lado.
 */
function accuracyBarColor(accuracy: number | null): string {
  if (accuracy === null) return "bg-muted-foreground/30"
  if (accuracy >= 50) return "bg-primary"
  return "bg-accent"
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. WIDGET: Desempenho por Matéria (PLANO + CICLO + 30D, sem duplicar)
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetDesempenhoMateria({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const rows = snapshot?.rawDisciplines || []
  const contexts = snapshot?.subjectContexts || []
  // Fase I.9: a LISTA de matérias vem de getUserDisciplines (dataIssues.disciplines);
  // os números por matéria (correctCount/wrongCount/tempo) vêm de attempts +
  // rawHistory (dataIssues.history/attempts) — são falhas independentes.
  const disciplinesUnavailable = snapshot?.dataIssues?.disciplines === true
  const statsUnavailable =
    snapshot?.dataIssues?.history === true || snapshot?.dataIssues?.attempts === true

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
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Desempenho por matéria
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/estatisticas")}
          className="text-xs font-semibold text-primary"
        >
          Ver todas <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      {/* Lista compacta (sem tabela): cabe em qualquer largura de card, sem
          rolagem horizontal. Linha 1: matéria + tempo. Linha 2: barra de
          acerto + % + acertos/total. O contexto (plano · ciclo · 30d) fica no
          título da linha. */}
      {ordered.length === 0 ? (
        <p className="py-6 text-center text-xs font-medium text-muted-foreground">
          {disciplinesUnavailable
            ? "Não foi possível carregar suas matérias agora."
            : "Nenhuma matéria disponível ainda."}
        </p>
      ) : (
        <ul className="-mx-1 flex-1 divide-y divide-border">
          {visible.map(({ disc, ctx }, idx: number) => {
            const answered = disc.correctCount + disc.wrongCount
            const accuracy = !statsUnavailable && answered > 0 ? disc.accuracyPercentage : null
            const context = [
              ctx?.planned ? "no plano" : null,
              ctx?.inCycle ? "no ciclo" : null,
              ctx?.recent30d ? "estudada nos últimos 30 dias" : null,
            ]
              .filter(Boolean)
              .join(" · ")
            const barColor = accuracyBarColor(accuracy)
            return (
              <li key={disc.id || idx} className="px-1 py-1.5" title={context || undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-foreground">{disc.name}</span>
                    {ctx?.isCurrentInCycle && (
                      <span className="shrink-0 text-[11px] font-semibold text-primary">
                        Atual
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {disc.tempoFormatted === "-" ? "—" : disc.tempoFormatted}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`Acerto em ${disc.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={accuracy ?? 0}
                  >
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${Math.max(0, Math.min(100, accuracy ?? 0))}%` }}
                    />
                  </div>
                  {accuracy === null ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {statsUnavailable ? "Indisponível" : "Sem questões"}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{accuracy}%</span>
                      {" · "}
                      {disc.correctCount}/{answered}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
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
  // incompatível, o ranking reutiliza essa métrica: minutos de estudo na
  // disciplina em TODO o histórico (item.value — o Dashboard carrega o
  // histórico inteiro; o comentário antigo dizia "30 dias"). Fase H: exibido
  // como tempo, não como "pts".
  // A ordenação é determinística (minutos -> nº de sessões -> nome alfabético),
  // definida em application/study-analytics/rankings.ts.
  // Fase I.9: este ranking usa só rawHistory (getDisciplineRanking, acima) —
  // é uma métrica diferente do ranking global de usuários (getRankingViaDirectQuery,
  // usado na página /ranking, corrigido na Fase I.8). A dependência real deste
  // widget é dataIssues.history, não o ranking global.
  const rankingUnavailable = snapshot?.dataIssues?.history === true
  const ranking = rankingUnavailable ? [] : snapshot?.analytics?.rankings?.disciplines || []

  return (
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Ranking das matérias
        </span>
      </div>

      <div className="my-auto">
        {ranking.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-medium">
            {rankingUnavailable
              ? "Ranking indisponível no momento."
              : "Sem dados suficientes para o ranking."}
          </div>
        ) : (
          ranking.slice(0, colSpan === 3 ? 5 : 3).map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 border-b border-border/70 py-2 text-[13px] last:border-b-0"
            >
              <div className="flex min-w-0 items-baseline gap-2.5">
                <span className="metric-value text-sm w-6 shrink-0 text-muted-foreground">
                  #{idx + 1}
                </span>
                <span className="truncate font-medium text-foreground">{item.name}</span>
                {typeof item.secondaryValue === "number" && item.secondaryValue > 0 && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {item.secondaryValue} sessões
                  </span>
                )}
              </div>
              <span className="tabular-nums font-semibold text-foreground shrink-0">
                {formatDurationMinutes(item.value ?? 0)}
              </span>
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
  // Fase I.8: distinguir "a leitura falhou" de "não há atividades" — antes as
  // duas situações mostravam a mesma mensagem de lista vazia.
  const activitiesUnavailable = snapshot?.dataIssues?.activities === true
  const activities = snapshot?.recentActivities || []

  return (
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Últimas atividades
        </span>
        <button
          type="button"
          onClick={() => router.push("/dashboard/history")}
          className="text-xs font-semibold text-primary"
        >
          Ver histórico
        </button>
      </div>

      <div className="my-auto">
        {activitiesUnavailable ? (
          <div className="text-center py-6 text-xs text-muted-foreground font-medium">
            Não foi possível carregar suas atividades recentes agora.
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground font-medium">
            Nenhuma atividade registrada recentemente.
          </div>
        ) : (
          activities.slice(0, colSpan === 3 ? 5 : 3).map((act) => (
            <div
              key={act.id}
              className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 text-[13px] last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{act.discipline_name}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {new Date(act.started_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">{act.duration_minutes} min</span>
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
  // Fase I.9: totalMinutes/consecutiveStreak vêm de rawHistory; totalQuestions
  // vem de rawHistory + question_attempts combinados (performanceByPeriod.TOTAL
  // em dashboard.service.ts). Se qualquer uma dessas leituras falhou, os marcos
  // calculados a partir delas não são reais — não dá para dizer que uma
  // conquista está "bloqueada" quando na verdade é que não sabemos o valor.
  const conquistasUnavailable =
    snapshot?.dataIssues?.history === true || snapshot?.dataIssues?.attempts === true

  // Fase H: marcos sobre o histórico inteiro (antes: minutos da SEMANA, e
  // "Primeiro Estudo"/"Maratona" trancavam de novo a cada semana).
  const badges = conquistasUnavailable
    ? []
    : dashboardMilestones({
        totalMinutes: snapshot?.stats?.totalMinutes ?? 0,
        currentStreak: snapshot?.stats?.consecutiveStreak ?? 0,
        totalQuestions: snapshot?.stats?.totalQuestions ?? 0,
      })

  return (
    <div className="p-3 flex flex-col justify-between h-full space-y-2">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Marcos
        </span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {conquistasUnavailable ? "—" : `${badges.filter((b) => b.unlocked).length} / ${badges.length}`}
        </span>
      </div>

      {conquistasUnavailable ? (
        <p className="py-6 text-center text-xs font-medium text-muted-foreground my-auto">
          Não foi possível carregar suas conquistas agora.
        </p>
      ) : (
        <ul className="my-auto">
          {badges.slice(0, colSpan === 1 ? 2 : 4).map((b, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 border-b border-border/70 py-2 text-[13px] last:border-b-0"
              title={b.desc}
            >
              {/* G2.21: o estado não depende só de cor — o texto diz e o leitor
                  de tela ouve se o marco foi alcançado. V2.5: lista em vez de
                  "medalhas" em caixas coloridas. */}
              <span className={`truncate ${b.unlocked ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {b.title}
                <span className="sr-only">{b.unlocked ? " (conquistada)" : " (ainda bloqueada)"}</span>
              </span>
              <span aria-hidden className={`shrink-0 text-[11px] ${b.unlocked ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {b.unlocked ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. WIDGET: Data da Prova
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetDataProva({ snapshot }: DashboardWidgetProps) {
  // Fase I.8: "meta ativa" vem de `user_targets` — se a leitura falhou, não
  // dá para saber se a pessoa tem uma prova cadastrada ou não.
  const targetUnavailable = snapshot?.dataIssues?.target === true
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
        <span className="text-[13px] font-semibold text-foreground">
          Data da prova
        </span>
      </div>
      <div className="space-y-1">
        {targetDate ? (
          <>
            <div className="text-sm font-semibold text-foreground leading-snug">{examName}</div>
            <div className="metric-value text-[15px] text-foreground">
              {new Date(targetDate + "T00:00:00").toLocaleDateString("pt-BR")}
              {daysUntil !== null && (
                <span className="block font-sans text-xs font-medium tracking-normal text-muted-foreground">
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
        ) : targetUnavailable ? (
          <div className="text-xs text-muted-foreground font-medium text-center py-2">
            Não foi possível carregar sua prova agora.
          </div>
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
  return <RemindersWidget embedded={true} className="p-3" />
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. WIDGET: Mensagem do Dia
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetMensagemDia(_props: DashboardWidgetProps) {
  const msg = getDailyMessage()

  return (
    <div className="p-3 flex flex-col justify-between h-full space-y-1.5">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[13px] font-semibold text-foreground">
          Mensagem do dia
        </span>
        <span className="text-[10px] text-muted-foreground font-medium">{msg.category}</span>
      </div>
      <div className="my-auto space-y-2 text-center py-2">
        <p className="text-[15px] italic leading-relaxed text-foreground">
          &ldquo;{msg.text}&rdquo;
        </p>
        <p className="text-[11px] font-semibold text-muted-foreground">— {msg.author}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. WIDGET: Calendário
// ─────────────────────────────────────────────────────────────────────────────

// V2.5: intensidade em tons da cor da marca (antes: verde-menta, o "heatmap
// padrão" de painel gerado). Os 4 primeiros níveis levam texto grafite/claro
// (≥ 5:1); o mais forte, texto na cor de contraste do primário (≥ 6:1).
const INTENSITY_LEVELS = [
  "bg-primary/10 dark:bg-primary/15",
  "bg-primary/25 dark:bg-primary/30",
  "bg-primary/40 dark:bg-primary/45",
  "bg-primary/60 dark:bg-primary/55",
  "bg-primary",
] as const

function intensityLevel(mins: number): number {
  if (mins <= 0) return -1
  if (mins < 60) return 0
  if (mins < 180) return 1
  if (mins < 300) return 2
  if (mins < 480) return 3
  return 4
}

function getIntensityClass(mins: number): string {
  const level = intensityLevel(mins)
  return level < 0 ? "bg-transparent hover:bg-muted/50" : INTENSITY_LEVELS[level] ?? "bg-primary"
}

/** Texto sobre a célula do dia: grafite nos tons claros, contraste do primário no mais forte. */
function intensityTextClass(mins: number): string {
  return intensityLevel(mins) === 4 ? "text-primary-foreground" : "text-foreground"
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
  const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

  return (
    <div className="p-3 sm:p-3.5 flex flex-col h-auto bg-card">
      {/* Cabeçalho — mesmo padrão dos demais widgets do dashboard */}
      <div className="flex items-center justify-between border-b pb-2 mb-2">
        <span className="text-[13px] font-semibold text-foreground">
          {monthName.charAt(0).toUpperCase() + monthName.slice(1)} {year}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => changeMonth(-1)}
            className="inline-flex h-7 w-7 items-center justify-center hover:bg-muted rounded-md cursor-pointer transition-colors"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => changeMonth(1)}
            className="inline-flex h-7 w-7 items-center justify-center hover:bg-muted rounded-md cursor-pointer transition-colors"
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
            Total <strong className="text-foreground tabular-nums font-semibold">{formatDurationMinutes(monthlyStats.totalMinutes)}</strong>
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span>
            Média <strong className="text-foreground tabular-nums font-semibold">{formatDurationMinutes(monthlyStats.averageMinutes)}</strong>/dia
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span>
            <strong className="text-foreground tabular-nums font-semibold">{monthlyStats.daysStudied}</strong> dias
          </span>
        </div>
      )}

      {/* Grid do calendário */}
      <div className="grid grid-cols-7 gap-[3px] sm:gap-1 text-center">
        {/* Cabeçalho dos dias da semana */}
        {weekDays.map((d, i) => (
          <div key={i} className="text-[11px] font-medium text-muted-foreground pb-1">
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
              aria-label={`${day} de ${monthName} de ${year}${isToday ? ", hoje" : ""}${mins > 0 ? `, ${formatDurationMinutes(mins)} estudados` : ""}`}
              className={`relative rounded-md font-medium flex flex-col items-center justify-center gap-0.5
                ${mins > 0 ? "p-1 sm:p-1.5 min-h-[56px] sm:min-h-[50px]" : "p-0.5 sm:p-1 min-h-[34px] sm:min-h-[30px]"}
                cursor-pointer transition-all duration-150
                hover:brightness-105
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                ${intensityClass}
                ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""}
              `}
              title={`${day}/${paddedMonth}/${year}${mins > 0 ? ` — ${formatDurationMinutes(mins)} estudados` : " — Clique para registrar estudo"}`}
            >
              {/* Dia */}
              <span
                // G2.22: "hoje" com estudo usa a cor do dia estudado (text-primary
                // sobre o verde do calor ficava em 2,5:1 no tema escuro); o
                // anel continua marcando o dia de hoje.
                className={`font-semibold text-[11px] sm:text-sm leading-none ${
                  mins > 0
                    ? intensityTextClass(mins)
                    : isToday
                      ? "text-primary"
                      : "text-muted-foreground"
                }`}
              >
                {day}
              </span>

              {/* Tempo estudado */}
              {mins > 0 && (
                <span className={`text-[10px] leading-none font-medium tabular-nums ${intensityTextClass(mins)}`}>
                  {formatDurationMinutes(mins)}
                </span>
              )}

              {/* Percentual da meta */}
              {goalPct !== null && (
                <span
                  className={`text-[10px] leading-none font-semibold tabular-nums ${intensityTextClass(mins)}`}
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
        <span className="text-[11px] text-muted-foreground mr-1">Menos</span>
        {INTENSITY_LEVELS.map((cls, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-xs ${cls}`}
          />
        ))}
        <span className="text-[11px] text-muted-foreground ml-1">Mais</span>
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
  desempenho_materia: {
    name: "Desempenho por Matéria",
    description: "Tempo estudado e taxa de acerto por matéria.",
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
    description: "Resumo do ciclo de estudo ativo: volta, matéria em foco e próxima.",
    defaultSpan: 3,
    component: WidgetCicloEstudoWrapper,
  },
}
