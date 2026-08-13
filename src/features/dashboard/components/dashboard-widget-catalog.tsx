"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import {
  Clock,
  Target,
  FileText,
  Flame,
  HelpCircle,
  RotateCcw,
  Trophy,
  Activity,
  Award,
  Calendar,
  CheckCircle2,
  Edit2,
  ChevronRight,
  Sparkles,
  BarChart3,
  ChevronLeft,
  ChevronRight as ChevronRightIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { DailyPlanningView } from "@/features/planejamento/components/daily-planning-view"
import { type StudyCycleBlock } from "@/features/planejamento/components/estudei-planning-view"
import { RemindersWidget } from "@/features/dashboard/components/reminders-widget"
import { getRecentStudyHistoryAction, type RecentHistoryEntry } from "@/application/study-analytics/study-analytics.actions"

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
  const weeklyMins = snapshot?.analytics?.stats?.weeklyMinutes ?? snapshot?.stats?.weeklyMinutes ?? 0
  const dailyMins = snapshot?.analytics?.stats?.dailyMinutes ?? snapshot?.stats?.dailyMinutes ?? 0
  const weeklyHours = snapshot?.user?.weekly_study_hours
  const targetMins = weeklyHours ? weeklyHours * 60 : null

  const formatMin = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h}h ${m.toString().padStart(2, "0")}min`
  }

  const pct = targetMins ? Math.min(100, Math.round((weeklyMins / targetMins) * 100)) : null

  if (colSpan === 1) {
    return (
      <div className="p-4 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#2563EB]" /> TEMPO
          </span>
          <span className="text-[10px] font-black text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded-full font-mono">
            {pct === null ? "—" : `${pct}%`}
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">{formatMin(weeklyMins)}</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
            {targetMins === null ? "Meta não definida" : `Meta: ${formatMin(targetMins)}`}
          </div>
        </div>
      </div>
    )
  }

  if (colSpan === 2) {
    return (
      <div className="p-5 flex flex-col justify-between h-full space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[#2563EB]" /> TEMPO DE ESTUDO SEMANAL
          </span>
          <span className="text-xs font-black text-[#2563EB] bg-[#2563EB]/10 px-2.5 py-0.5 rounded-full font-mono">
            {pct === null ? "—" : `${pct}% Concluído`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 my-auto">
          <div className="bg-muted/40 p-2.5 rounded-xl border">
            <span className="text-[10px] text-muted-foreground font-bold uppercase block">Hoje</span>
            <span className="text-base font-black text-foreground font-mono">{formatMin(dailyMins)}</span>
          </div>
          <div className="bg-[#2563EB]/10 p-2.5 rounded-xl border border-[#2563EB]/20">
            <span className="text-[10px] text-[#2563EB] font-bold uppercase block">Esta Semana</span>
            <span className="text-base font-black text-[#2563EB] font-mono">{formatMin(weeklyMins)}</span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className="bg-[#2563EB] h-full rounded-full transition-all duration-500" style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>
    )
  }

  // Large (colSpan === 3)
  return (
    <div className="p-6 flex flex-col justify-between h-full space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#2563EB]" /> PAINEL GERAL DE TEMPO DE ESTUDO
        </span>
        <span className="text-xs font-black text-[#2563EB] bg-[#2563EB]/10 px-3 py-1 rounded-full font-mono">
          Meta Semanal: {targetMins === null ? "Não definida" : formatMin(targetMins)}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-muted/30 p-3.5 rounded-xl border">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground block">Hoje</span>
          <span className="text-xl font-black text-foreground font-mono">{formatMin(dailyMins)}</span>
        </div>
        <div className="bg-[#2563EB]/10 p-3.5 rounded-xl border border-[#2563EB]/20">
          <span className="text-[10px] font-extrabold uppercase text-[#2563EB] block">Esta Semana</span>
          <span className="text-xl font-black text-[#2563EB] font-mono">{formatMin(weeklyMins)}</span>
        </div>
        <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/20">
          <span className="text-[10px] font-extrabold uppercase text-emerald-600 block">Progresso</span>
          <span className="text-xl font-black text-emerald-600 font-mono">{pct}%</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">DISTRIBUIÇÃO DIÁRIA</span>
          <div className="flex gap-2">
             {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day, idx) => {
               const ev = snapshot?.analytics?.evolution?.[idx]
               const mins = ev?.value ?? 0
               return (
                 <div key={day} className="flex flex-col items-center gap-1">
                   <div className="w-2 bg-muted rounded-full h-12 relative flex items-end">
                     <div className="bg-[#2563EB] w-full rounded-full transition-all" style={{ height: `${Math.min(100, (mins/120)*100)}%` }} />
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
// 2. WIDGET: Desempenho Geral
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetDesempenho({ snapshot, colSpan }: DashboardWidgetProps) {
  const accuracy = snapshot?.stats?.accuracyPercentage ?? 0
  const total = snapshot?.stats?.totalQuestions ?? 0
  const correct = snapshot?.stats?.correctQuestions ?? 0
  const wrong = snapshot?.stats?.wrongQuestions ?? 0
  const disciplineRanking = snapshot?.analytics?.rankings?.disciplines || []

  if (colSpan === 1) {
    return (
      <div className="p-4 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-600" /> DESEMPENHO
          </span>
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
            {accuracy}%
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">{accuracy}%</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">{total} questões respondidas</div>
        </div>
      </div>
    )
  }

  if (colSpan === 2) {
    return (
      <div className="p-5 flex flex-col justify-between h-full space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Target className="w-4 h-4 text-emerald-600" /> DESEMPENHO GERAL
          </span>
          <span className="text-xs font-black text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-mono">
            {accuracy}% Acurácia
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 my-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-foreground font-mono">{accuracy}%</span>
            <div className="text-xs text-muted-foreground font-medium">
              <div><strong className="text-emerald-600">{correct}</strong> acertos</div>
              <div><strong className="text-rose-500">{wrong}</strong> erros</div>
            </div>
          </div>
          <div className="text-right text-xs font-bold text-muted-foreground">
            Total: <span className="font-mono text-foreground font-extrabold">{total}</span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${accuracy}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col justify-between h-full space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-600" /> DESEMPENHO & TAXA DE ACERTO
        </span>
        <span className="text-xs font-black text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full font-mono">
          Aproveitamento: {accuracy}%
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-muted/30 p-3 rounded-xl border text-center">
          <span className="text-[10px] text-muted-foreground font-bold uppercase block">Total</span>
          <span className="text-lg font-black text-foreground font-mono">{total}</span>
        </div>
        <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center">
          <span className="text-[10px] text-emerald-600 font-bold uppercase block">Acertos</span>
          <span className="text-lg font-black text-emerald-600 font-mono">{correct}</span>
        </div>
        <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-center">
          <span className="text-[10px] text-rose-500 font-bold uppercase block">Erros</span>
          <span className="text-lg font-black text-rose-500 font-mono">{wrong}</span>
        </div>
        <div className="bg-[#2563EB]/10 p-3 rounded-xl border border-[#2563EB]/20 text-center">
          <span className="text-[10px] text-[#2563EB] font-bold uppercase block">Precisão</span>
          <span className="text-lg font-black text-[#2563EB] font-mono">{accuracy}%</span>
        </div>
      </div>

      {disciplineRanking.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider">MELHORES DESEMPENHOS POR MATÉRIA</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {disciplineRanking.slice(0, 4).map((item: { name?: string; disciplineName?: string; accuracy?: number; percentage?: number }, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-[11px] font-bold">
                <span className="truncate pr-2">{item.name || item.disciplineName}</span>
                <span className="text-emerald-600 font-mono">{item.accuracy || item.percentage || 0}%</span>
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
  const progress = snapshot?.stats?.editalProgress ?? 0
  const completed = snapshot?.stats?.completedTopics ?? 0
  const total = snapshot?.disciplinesStats?.total ?? 0

  if (colSpan === 1) {
    return (
      <div className="p-4 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors" onClick={() => router.push("/edital")}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#2563EB]" /> EDITAL
          </span>
          <span className="text-[10px] font-black text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded-full font-mono">
            {progress}%
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">{progress}%</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">{completed} de {total} disciplinas concluídas</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer hover:bg-muted/10 transition-colors" onClick={() => router.push("/edital")}>
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-[#2563EB]" /> PROGRESSO NO EDITAL
        </span>
        <span className="text-xs font-black text-[#2563EB] bg-[#2563EB]/10 px-2.5 py-0.5 rounded-full font-mono">
          {progress}% Concluído
        </span>
      </div>
      <div className="space-y-2 my-auto">
        <div className="flex justify-between text-xs font-bold text-muted-foreground">
          <span>Cobertura do Conteúdo</span>
          <span className="text-foreground font-mono font-black">{completed} / {total} matérias</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div className="bg-[#2563EB] h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WIDGET: Constância nos Estudos
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetConstancia({ snapshot, colSpan }: DashboardWidgetProps) {
  const streak = snapshot?.analytics?.stats?.consecutiveStreak ?? snapshot?.stats?.consecutiveStreak ?? 0
  const longest = snapshot?.analytics?.stats?.longestStreak ?? snapshot?.stats?.longestStreak ?? streak
  const heatmap = snapshot?.analytics?.heatmap || []

  if (colSpan === 1) {
    return (
      <div className="p-4 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-500" /> CONSTÂNCIA
          </span>
          <span className="text-[10px] font-black text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full font-mono">
            {streak}d
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">{streak} dias</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">Recorde: {longest} dias</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-orange-500" /> CONSTÂNCIA E SEQUÊNCIA ATIVA
        </span>
        <span className="text-xs font-black text-orange-500 bg-orange-500/10 px-2.5 py-0.5 rounded-full font-mono">
          🔥 {streak} dias consecutivos
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
          <div className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider mb-2">REGISTRO DIÁRIO</div>
          <div className="flex flex-wrap gap-1.5">
            {heatmap.slice(-14).map((day: { date?: string; minutes?: number; count?: number }, idx: number) => {
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
  const [history, setHistory] = React.useState<RecentHistoryEntry[] | undefined>(undefined)

  React.useEffect(() => {
    let cancelled = false
    void getRecentStudyHistoryAction(14).then((res) => {
      if (!cancelled) setHistory(res.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="w-full">
      <DailyPlanningView blocks={cycleBlocks} history={history ?? []} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WIDGET: Questões
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetQuestoes({ snapshot, colSpan }: DashboardWidgetProps) {
  const total = snapshot?.stats?.totalQuestions ?? 0
  const target = snapshot?.analytics?.goals?.questions?.target ?? null
  const achieved = snapshot?.analytics?.goals?.questions?.achieved ?? total
  const pct = snapshot?.analytics?.goals?.questions?.percentage ?? (target && target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : null)

  if (colSpan === 1) {
    return (
      <div className="p-4 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[#2563EB]" /> QUESTÕES
          </span>
          <span className="text-[10px] font-black text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded-full font-mono">
            {pct === null ? "—" : `${pct}%`}
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">{achieved}</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
            {target === null ? "Meta não definida" : `Meta da semana: ${target}`}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-[#2563EB]" /> META DE QUESTÕES SEMANAL
        </span>
        <span className="text-xs font-black text-[#2563EB] bg-[#2563EB]/10 px-2.5 py-0.5 rounded-full font-mono">
          {target === null ? achieved : `${achieved} / ${target}`}
        </span>
      </div>
      <div className="space-y-2 my-auto">
        <div className="flex justify-between text-xs font-bold text-muted-foreground">
          <span>Progresso Semanal</span>
          <span className="text-foreground font-mono font-black">{pct === null ? "—" : `${pct}%`}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div className="bg-[#2563EB] h-full rounded-full transition-all duration-500" style={{ width: `${pct ?? 0}%` }} />
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
      <div className="p-4 flex flex-col justify-between h-full space-y-2 cursor-pointer hover:bg-muted/10 transition-colors" onClick={() => router.push("/dashboard/reviews")}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-purple-500" /> REVISÕES
          </span>
          <span className="text-[10px] font-black text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-full font-mono">
            {count}
          </span>
        </div>
        <div>
          <div className="text-2xl font-black text-foreground font-mono leading-tight">{count} pendentes</div>
          <div className="text-[11px] text-purple-600 font-bold mt-0.5">Clique para revisar</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3 cursor-pointer hover:bg-muted/10 transition-colors" onClick={() => router.push("/dashboard/reviews")}>
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <RotateCcw className="w-4 h-4 text-purple-500" /> CENTRAL DE REVISÕES
        </span>
        <Button size="sm" variant="outline" className="h-7 text-xs font-bold text-purple-600 border-purple-500/30">
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
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Trophy className="w-4 w-4 text-amber-500" /> METAS DE ESTUDO SEMANAL
        </span>
        {onOpenGoalsModal && (
          <button type="button" onClick={onOpenGoalsModal} className="text-muted-foreground hover:text-foreground">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 my-auto">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground">Horas</span>
            <span className="text-foreground font-mono">{hoursPct === null ? "—" : `${hoursPct}%`}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div className="bg-[#2563EB] h-full rounded-full transition-all duration-300" style={{ width: `${hoursPct ?? 0}%` }} />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground">Questões</span>
            <span className="text-foreground font-mono">{qPct === null ? "—" : `${qPct}%`}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${qPct ?? 0}%` }} />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-muted-foreground">Dias Ativos</span>
            <span className="text-foreground font-mono">{daysPct === null ? "—" : `${daysPct}%`}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div className="bg-orange-500 h-full rounded-full transition-all duration-300" style={{ width: `${daysPct ?? 0}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. WIDGET: Desempenho por Matéria
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetDesempenhoMateria({ snapshot, colSpan }: DashboardWidgetProps) {
  const router = useRouter()
  const rows = snapshot?.rawDisciplines || []

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#2563EB]" /> DESEMPENHO POR MATÉRIA
        </span>
        <Button variant="ghost" size="sm" onClick={() => router.push("/disciplines")} className="text-xs font-bold text-[#2563EB]">
          Ver Todas <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b text-muted-foreground font-extrabold text-[10px] uppercase">
              <th className="pb-2 px-2">Disciplina</th>
              <th className="pb-2 px-2 text-center">Tempo</th>
              <th className="pb-2 px-2 text-center text-emerald-600">✔</th>
              <th className="pb-2 px-2 text-center text-rose-500">✖</th>
              <th className="pb-2 px-2 text-center">%</th>
            </tr>
          </thead>
          <tbody className="divide-y font-semibold">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground font-medium text-xs">
                  Nenhuma sessão de estudo registrada ainda.
                </td>
              </tr>
            ) : (
              rows.slice(0, colSpan === 3 ? 8 : 4).map((disc, idx: number) => (
                <tr key={disc.id || idx} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-2 font-bold text-foreground truncate max-w-[150px]">{disc.name}</td>
                  <td className="py-2 px-2 text-center font-mono text-muted-foreground">{disc.tempoFormatted}</td>
                  <td className="py-2 px-2 text-center font-mono text-emerald-600">{disc.correctCount}</td>
                  <td className="py-2 px-2 text-center font-mono text-rose-500">{disc.wrongCount}</td>
                  <td className="py-2 px-2 text-center font-mono font-extrabold text-foreground">{disc.accuracyPercentage}%</td>
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
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Award className="w-4 h-4 text-yellow-500" /> RANKING DAS MATÉRIAS
        </span>
      </div>

      <div className="space-y-2 my-auto">
        {ranking.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-medium">
            Sem dados suficientes para o ranking.
          </div>
        ) : (
          ranking.slice(0, colSpan === 3 ? 5 : 3).map((item, idx) => (
            <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs font-bold">
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
              <span className="font-mono text-[#2563EB] shrink-0">{item.value ?? 0} pts</span>
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
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-[#2563EB]" /> ÚLTIMAS ATIVIDADES
        </span>
        <button type="button" onClick={() => router.push("/dashboard/history")} className="text-xs font-bold text-[#2563EB]">
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
            <div key={act.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs">
              <div className="space-y-0.5 truncate">
                <div className="font-bold text-foreground truncate">{act.discipline_name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {act.duration_minutes} min • {new Date(act.started_at).toLocaleDateString("pt-BR")}
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
    { title: "Mestre", desc: "Respondeu 50+ questões", unlocked: (snapshot?.stats?.totalQuestions ?? 0) >= 50 }
  ]

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Award className="w-4 h-4 text-purple-500" /> CONQUISTAS & MARCOS
        </span>
        <span className="text-xs font-black text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-full font-mono">
          {badges.filter(b => b.unlocked).length} / {badges.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 my-auto">
        {badges.slice(0, colSpan === 1 ? 2 : 4).map((b, idx) => (
          <div
            key={idx}
            className={`p-2.5 rounded-xl border text-center space-y-1 transition-all ${
              b.unlocked ? "bg-purple-500/10 border-purple-500/30 text-purple-600" : "bg-muted/20 border-muted opacity-50"
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
  const examName = snapshot?.activeTarget?.exam_name || snapshot?.activeTarget?.target_exam || "Prova"
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
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-[#2563EB]" /> DATA DA PROVA
        </span>
      </div>
      <div className="my-auto space-y-2">
        {targetDate ? (
          <>
            <div className="text-sm font-black text-foreground">{examName}</div>
            <div className="text-sm font-bold text-[#2563EB]">
              {new Date(targetDate + "T00:00:00").toLocaleDateString("pt-BR")}
              {daysUntil !== null && (
                <span className="block text-xs text-muted-foreground font-medium">
                  {daysUntil > 0 ? `Faltam ${daysUntil} dias` : "Prova hoje ou já realizada"}
                </span>
              )}
            </div>
            <div className="pt-2 text-xs text-muted-foreground grid gap-1">
              <div className="flex items-center gap-1">
                <span className="font-bold">📍</span> {local}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-bold">🕐</span> {time}
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground font-medium text-center">Nenhuma prova cadastrada.</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. WIDGET: Lembretes
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetLembretes({ snapshot: _snapshot, colSpan: _colSpan }: DashboardWidgetProps) {
  return <RemindersWidget className="border-0 bg-transparent shadow-none" />
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. WIDGET: Mensagem do Dia
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetMensagemDia(_props: DashboardWidgetProps) {
  const messages = [
    { text: "A disciplina é a ponte entre seus objetivos e suas realizações.", author: "Jim Rohn" },
    { text: "O sucesso é a soma de pequenos esforços repetidos dia após dia.", author: "Robert Collier" },
    { text: "Estude enquanto eles dormem, trabalhe enquanto eles descansam, viva o que eles sonham.", author: "Provérbio" },
    { text: "A persistência é o menor caminho para o êxito.", author: "Charles Chaplin" }
  ]
  const todayIndex = new Date().getDate() % messages.length
  const msg = messages[todayIndex] as { text: string; author: string }

  return (
    <div className="p-5 flex flex-col justify-between h-full space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-purple-500" /> MENSAGEM DO DIA
        </span>
      </div>
      <div className="my-auto space-y-2 text-center py-2">
        <p className="text-xs font-semibold italic text-foreground">
          &ldquo;{msg.text}&rdquo;
        </p>
        <p className="text-[11px] font-bold text-muted-foreground">
          — {msg.author}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. WIDGET: Calendário
// ─────────────────────────────────────────────────────────────────────────────
export function WidgetCalendario({ colSpan: _colSpan }: DashboardWidgetProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1))
  }

  return (
    <div className="p-3 flex flex-col h-full bg-card">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider">
          {currentDate.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}.
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-0.5 hover:bg-muted rounded"><ChevronLeft className="w-3 h-3" /></button>
          <button onClick={() => changeMonth(1)} className="p-0.5 hover:bg-muted rounded"><ChevronRightIcon className="w-3 h-3" /></button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-[9px] font-bold text-muted-foreground pb-1">{d}</div>
        ))}
        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const isToday = day === new Date().getDate() && currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear()
          return (
            <div key={i} className={`text-[10px] p-0.5 rounded font-medium flex items-center justify-center aspect-square ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO MASTER DE WIDGETS
// ─────────────────────────────────────────────────────────────────────────────
export const WIDGET_REGISTRY: Record<string, {
  name: string
  description: string
  defaultSpan: 1 | 2 | 3
  component: React.ComponentType<DashboardWidgetProps>
}> = {
  calendario: {
    name: "Calendário",
    description: "Calendário mensal para visualizar datas e navegar entre os meses.",
    defaultSpan: 2,
    component: WidgetCalendario
  },
  tempo_estudo: {
    name: "Tempo de Estudo",
    description: "Exibe horas estudadas no dia e semana em relação à sua meta.",
    defaultSpan: 1,
    component: WidgetTempoEstudo
  },
  desempenho: {
    name: "Desempenho Geral",
    description: "Métricas de acurácia, taxa de acertos e acertos vs erros.",
    defaultSpan: 1,
    component: WidgetDesempenho
  },
  progresso_edital: {
    name: "Progresso no Edital",
    description: "Percentual de cobertura e disciplinas concluídas.",
    defaultSpan: 1,
    component: WidgetProgressoEdital
  },
  estudos_hoje: {
    name: "Estudos de Hoje (Visão Diária)",
    description: "Cronograma diário com disciplinas agendadas e botão Iniciar Estudo.",
    defaultSpan: 3,
    component: WidgetEstudosHoje
  },
  constancia: {
    name: "Constância nos Estudos",
    description: "Sequência de dias consecutivos estudando (Streak).",
    defaultSpan: 1,
    component: WidgetConstancia
  },
  questoes: {
    name: "Questões",
    description: "Acompanhamento da meta semanal de questões resolvidas.",
    defaultSpan: 1,
    component: WidgetQuestoes
  },
  revisoes: {
    name: "Revisões",
    description: "Revisões pendentes e agendadas para o dia.",
    defaultSpan: 1,
    component: WidgetRevisoes
  },
  desempenho_materia: {
    name: "Desempenho por Matéria",
    description: "Tabela com tempo estudado, questões e acurácia por matéria.",
    defaultSpan: 2,
    component: WidgetDesempenhoMateria
  },
  ultimas_atividades: {
    name: "Últimas Atividades",
    description: "Histórico das últimas sessões de estudo realizadas.",
    defaultSpan: 1,
    component: WidgetUltimasAtividades
  },
  metas_estudo: {
    name: "Metas de Estudo",
    description: "Barras de progresso para horas, questões e dias ativos.",
    defaultSpan: 1,
    component: WidgetMetasEstudo
  },
  ranking: {
    name: "Ranking",
    description: "Classificação por pontos das suas matérias e áreas.",
    defaultSpan: 1,
    component: WidgetRanking
  },
  conquistas: {
    name: "Conquistas",
    description: "Medalhas e marcos de evolução desbloqueados.",
    defaultSpan: 1,
    component: WidgetConquistas
  },
  data_prova: {
    name: "Data da Prova",
    description: "Exibe a contagem ou data da prova cadastrada.",
    defaultSpan: 1,
    component: WidgetDataProva
  },
  lembretes: {
    name: "Lembretes",
    description: "Lista de lembretes e avisos importantes.",
    defaultSpan: 1,
    component: WidgetLembretes
  },
  mensagem_dia: {
    name: "Mensagem do Dia",
    description: "Uma mensagem motivacional para começar o dia.",
    defaultSpan: 1,
    component: WidgetMensagemDia
  }
}
