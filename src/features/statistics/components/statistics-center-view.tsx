"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  Download,
  Printer,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Sparkles,
  ListChecks,
  Brain,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { getStatisticsCenterAction, type StatisticsCenterPayload } from "@/application/study-analytics/statistics-center.action"
import {
  buildDayBuckets,
  buildHeatmap,
  computeComparisons,
  computeDisciplineStats,
  computeEditalCoverage,
  computeFocusStatistics,
  computeFrequency,
  computeHoursOfDay,
  computeMonthlyReport,
  computePlanning,
  computePriorities,
  computeProductivity,
  computeQuestionStatistics,
  computeQuestionTrend,
  computeRevisionStatistics,
  computeSessionStatistics,
  computeStreaks,
  computeTimeCards,
  computeTopicStats,
  computeWeeklyReport,
  dateKeyOf,
  formatBRDate,
  formatDurationRaw,
  generateInsights,
  keysBetween,
  mondayKeyOf,
  todayKey,
  type ComparisonRow,
  type DailyBucket,
  type DisciplineStat,
  type HourBucket,
  type Insight,
  type MetricComparison,
  type TopicStat,
} from "@/application/study-analytics/engine/stats-engine"
import {
  ClassificationChip,
  DeltaBadge,
  EmptyState,
  HeatmapCalendar,
  Metric,
  ProgressBar,
  SectionCard,
} from "./statistics-charts"

const TIMEZONE = "America/Sao_Paulo"

type RangeId = "7" | "30" | "90" | "365" | "custom"

const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: "7", label: "7 dias", days: 7 },
  { id: "30", label: "30 dias", days: 30 },
  { id: "90", label: "90 dias", days: 90 },
  { id: "365", label: "365 dias", days: 365 },
  { id: "custom", label: "Personalizado", days: 0 },
]

function rangeDays(range: RangeId, customStart: string, customEnd: string): number {
  if (range !== "custom") return RANGES.find((r) => r.id === range)?.days ?? 30
  const from = new Date(customStart + "T00:00:00")
  const to = new Date(customEnd + "T00:00:00")
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return 30
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1
}

type CmpKey = "minutes" | "questions" | "accuracy" | "focus" | "pages" | "sessions" | "days"

function metricCmpValue(m: MetricComparison | undefined, key: CmpKey): string {
  if (!m) return "—"
  const v = m.current
  if (v === null) return "—"
  if (key === "accuracy" || key === "focus") return `${Math.round(v)}%`
  if (key === "minutes") return formatDurationRaw(v)
  return String(Math.round(v))
}

function formatPlanningSubtitle(planning: { weeklyTargetMinutes: number; weeklyTargetQuestions: number; weeklyTargetDays: number }): string {
  const questionTarget = planning.weeklyTargetQuestions > 0 ? `${planning.weeklyTargetQuestions} questões` : "sem meta de questões"
  const dayTarget = planning.weeklyTargetDays > 0 ? ` · ${planning.weeklyTargetDays} dias` : ""
  return `Meta semanal: ${formatDurationRaw(planning.weeklyTargetMinutes)} · ${questionTarget}${dayTarget}`
}

function adherenceClass(adherencePct: number): string {
  if (adherencePct >= 100) return "text-emerald-600"
  if (adherencePct >= 50) return "text-amber-600"
  return "text-rose-600"
}

function daysSinceLastStudyLabel(days: number | null): string {
  if (days === null) return "nunca"
  if (days === 0) return "hoje"
  return `${days}d`
}

const INSIGHT_STYLES: Record<Insight["severity"], { icon: typeof Info; cls: string }> = {
  positive: { icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/5" },
  info: { icon: Info, cls: "border-sky-500/30 bg-sky-500/5" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/30 bg-amber-500/5" },
  danger: { icon: XCircle, cls: "border-rose-500/30 bg-rose-500/5" },
}

export function StatisticsCenterView() {
  // ── Estado bruto ──────────────────────────────────────────────────────────
  const [payload, setPayload] = useState<StatisticsCenterPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [range, setRange] = useState<RangeId>("90")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [disciplineId, setDisciplineId] = useState<string>("all")
  const [studyType, setStudyType] = useState<string>("all")

  const [now] = useState(() => new Date())

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data, error: err } = await getStatisticsCenterAction()
    if (err) {
      setError(err)
      if (!silent) toast.error(err)
    } else if (data) {
      setPayload(data)
      setError(null)
      setLastRefresh(new Date())
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // ── Filtros derivados ─────────────────────────────────────────────────────
  const days = rangeDays(range, customStart, customEnd)
  const rangeKeys = useMemo(() => {
    const today = todayKey(now, TIMEZONE)
    if (range === "custom" && customStart && customEnd) {
      return keysBetween(customStart, customEnd)
    }
    const keys: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const k = dateFromToday(today, -i)
      if (k) keys.push(k)
    }
    return keys
  }, [range, customStart, customEnd, days, now])

  const registry = useMemo(() => {
    const m = new Map<string, { id: string; name: string; area: string | null }>()
    ;(payload?.disciplines ?? []).forEach((d) => {
      if (d.id) m.set(d.id, d)
    })
    ;(payload?.sessions ?? []).forEach((s) => {
      if (s.disciplineId && !m.has(s.disciplineId)) {
        m.set(s.disciplineId, { id: s.disciplineId, name: s.disciplineName ?? s.disciplineId, area: s.disciplineArea })
      }
    })
    return m
  }, [payload?.disciplines, payload?.sessions])

  const filteredSessions = useMemo(() => filterSessions(payload?.sessions ?? [], rangeKeys, disciplineId, studyType, TIMEZONE), [payload, rangeKeys, disciplineId, studyType])
  const filteredAttempts = useMemo(() => filterAttempts(payload?.attempts ?? [], rangeKeys, disciplineId, TIMEZONE), [payload, rangeKeys, disciplineId])

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const buckets = useMemo(
    () => buildDayBuckets(filteredSessions, filteredAttempts, Math.max(1, rangeKeys.length), now, TIMEZONE),
    [filteredSessions, filteredAttempts, rangeKeys, now]
  )
  const timeCards = useMemo(() => computeTimeCards(buckets, now, TIMEZONE), [buckets, now])
  const sessionStats = useMemo(() => computeSessionStatistics(filteredSessions), [filteredSessions])
  const questionStats = useMemo(() => computeQuestionStatistics(filteredSessions, filteredAttempts), [filteredSessions, filteredAttempts])
  const focusStats = useMemo(() => computeFocusStatistics(filteredSessions), [filteredSessions])
  const streaks = useMemo(
    () => computeStreaks(new Set(buckets.filter((b) => b.minutes > 0).map((b) => b.date)), now, TIMEZONE),
    [buckets, now]
  )
  const frequency = useMemo(() => computeFrequency(buckets, now, TIMEZONE), [buckets, now])
  const revisionStats = useMemo(
    () =>
      computeRevisionStatistics(
        payload?.reviewItems ?? [],
        payload?.reviewsCompletedLast30 ?? 0,
        now,
        registry
      ),
    [payload?.reviewItems, payload?.reviewsCompletedLast30, now, registry]
  )
  const overdueByDiscipline = useMemo(() => {
    const m = new Map<string, number>()
    revisionStats.byDiscipline.forEach((d) => m.set(d.disciplineId, d.overdue))
    return m
  }, [revisionStats])

  const disciplineStats = useMemo(
    () =>
      computeDisciplineStats(
        filteredSessions,
        filteredAttempts,
        registry,
        payload?.userDisciplines ?? [],
        overdueByDiscipline,
        timeCards.totalMinutes,
        now,
        TIMEZONE
      ),
    [filteredSessions, filteredAttempts, registry, payload?.userDisciplines, overdueByDiscipline, timeCards.totalMinutes, now]
  )
  const topicStats = useMemo(() => computeTopicStats(filteredSessions, now, TIMEZONE), [filteredSessions, now])
  const hoursOfDay = useMemo(() => computeHoursOfDay(filteredSessions, filteredAttempts, TIMEZONE), [filteredSessions, filteredAttempts])
  const comparisons = useMemo(() => computeComparisons(buckets, now, TIMEZONE), [buckets, now])
  const planning = useMemo(() => computePlanning(payload?.activePlan ?? null, buckets, now, TIMEZONE), [payload?.activePlan, buckets, now])
  const edital = useMemo(
    () => computeEditalCoverage(payload?.userDisciplines ?? [], disciplineStats, registry, now),
    [payload?.userDisciplines, disciplineStats, registry, now]
  )
  const productivity = useMemo(
    () => computeProductivity(filteredSessions, questionStats, focusStats.averagePct, frequency.last7Days),
    [filteredSessions, questionStats, focusStats.averagePct, frequency.last7Days]
  )
  const questionTrend = useMemo(() => computeQuestionTrend(buckets), [buckets])
  const heatmap = useMemo(() => buildHeatmap(buckets, Math.min(rangeKeys.length, 365)), [buckets, rangeKeys])
  const insights = useMemo(
    () =>
      generateInsights({
        hasPlan: planning.hasPlan,
        sessionsInRange: filteredSessions.length,
        hoursOfDay,
        focusPct: focusStats.averagePct,
        questionStats,
        streaks,
        comparisons,
        planning,
        revision: revisionStats,
        disciplineStats,
        topicStats,
        timeCards,
        productivity,
        daysSinceLastStudy: frequency.daysSinceLastStudy,
        questionsPerDay: days > 0 ? questionStats.total / days : 0,
      }),
    [filteredSessions.length, hoursOfDay, focusStats.averagePct, questionStats, streaks, comparisons, planning, revisionStats, disciplineStats, topicStats, timeCards, productivity, frequency.daysSinceLastStudy, days]
  )
  const priorities = useMemo(() => computePriorities(disciplineStats, revisionStats), [disciplineStats, revisionStats])
  const weeklyReport = useMemo(() => computeWeeklyReport(buckets, now, TIMEZONE), [buckets, now])
  const monthlyReport = useMemo(() => computeMonthlyReport(buckets, now, TIMEZONE), [buckets, now])
  const chartData = useMemo(() => buildChartData(buckets, days, TIMEZONE), [buckets, days])

  // Opções de filtro (a partir dos dados totais, não filtrados)
  const allSessions = useMemo(() => payload?.sessions ?? [], [payload?.sessions])
  const disciplineOptions = useMemo(() => {
    const byId = new Map<string, string>()
    allSessions.forEach((s) => {
      if (s.disciplineId && !byId.has(s.disciplineId)) byId.set(s.disciplineId, s.disciplineName ?? s.disciplineId)
    })
    payload?.disciplines.forEach((d) => {
      if (d.id) byId.set(d.id, d.name)
    })
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allSessions, payload?.disciplines])
  const typeOptions = useMemo(() => {
    const names = new Set<string>()
    allSessions.forEach((s) => {
      if (s.studyType) names.add(s.studyType)
    })
    return [...names].sort()
  }, [allSessions])

  const hasAnyData = allSessions.length > 0 || filteredSessions.length > 0

  // ── Export ────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const lines: string[] = [
      "data;minutos;sessoes;questoes;acertos;erros;acuracia_pct;foco_pct;paginas;flashcards",
    ]
    buckets.forEach((b) => {
      lines.push(
        [
          b.date,
          Math.round(b.minutes),
          b.sessions,
          b.questions,
          b.correct,
          b.wrong,
          b.accuracy === null ? "" : Math.round(b.accuracy),
          b.focusAvg === null ? "" : Math.round(b.focusAvg),
          b.pages,
          b.flashcards,
        ].join(";")
      )
    })
    lines.push("")
    lines.push("disciplina;minutos;sessoes;questoes;acertos;acuracia_pct;tendencia;classificacao;score_atencao")
    disciplineStats.forEach((d) => {
      lines.push(
        [
          d.name,
          Math.round(d.minutes),
          d.sessions,
          d.questions,
          d.correct,
          d.accuracy === null ? "" : Math.round(d.accuracy),
          d.trendDirection,
          d.classification,
          d.attentionScore,
        ].join(";")
      )
    })
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `estatisticas-${todayKey(now, TIMEZONE)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !payload) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">Não foi possível carregar suas estatísticas</p>
        <p className="mb-4">{error}</p>
        <Button onClick={() => load()}>Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-16 print:space-y-4">
      {/* ===================== HEADER ===================== */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#2563EB]" />
            Estatísticas
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Análise real dos seus estudos — tempo, desempenho, consistência e prioridades
            {lastRefresh && <> · atualizado {lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => load(true)} className="text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs">
            <Printer className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* ===================== FILTROS ===================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Período</p>
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg flex-wrap">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  range === r.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex gap-2 mt-2">
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded-md border bg-card px-2 py-1 text-xs text-foreground"
              />
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded-md border bg-card px-2 py-1 text-xs text-foreground"
              />
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Disciplina</p>
          <select
            value={disciplineId}
            onChange={(e) => setDisciplineId(e.target.value)}
            className="w-full rounded-lg border bg-card px-2.5 py-2 text-xs text-foreground"
          >
            <option value="all">Todas</option>
            {disciplineOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Tipo de estudo</p>
          <select
            value={studyType}
            onChange={(e) => setStudyType(e.target.value)}
            className="w-full rounded-lg border bg-card px-2.5 py-2 text-xs text-foreground"
          >
            <option value="all">Todos</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Resumo do período</p>
          <div className="rounded-lg border bg-card px-3 py-2 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">Sessões analisadas</span>
            <span className="font-black text-foreground font-mono text-base">{filteredSessions.length}</span>
          </div>
        </div>
      </div>

      {!hasAnyData && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-semibold text-foreground mb-1">Nenhum estudo registrado no período</p>
          <p className="text-xs text-muted-foreground mb-4">
            Registre uma sessão de estudo para começar a ver suas estatísticas reais.
          </p>
          <a href="/dashboard/history">
            <Button size="sm">Registrar sessão</Button>
          </a>
        </div>
      )}

      {/* ===================== CARDS DE TEMPO ===================== */}
      <SectionCard
        title="Tempo de estudo"
        subtitle={`Hoje, semana, mês e janelas no período selecionado (fuso ${TIMEZONE.replace("_", " ")})`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric label="Hoje" value={formatDurationRaw(timeCards.todayMinutes)} sub="sessões de hoje" accent />
          <Metric label="Semana" value={formatDurationRaw(timeCards.weekMinutes)} sub="segunda → hoje" accent />
          <Metric label="Mês" value={formatDurationRaw(timeCards.monthMinutes)} sub="dia 1 → hoje" accent />
          <Metric label="Últimos 30d" value={formatDurationRaw(timeCards.last30Minutes)} sub="janela móvel" />
          <Metric label="Últimos 90d" value={formatDurationRaw(timeCards.last90Minutes)} sub="janela móvel" />
          <Metric label="Total no período" value={formatDurationRaw(timeCards.totalMinutes)} sub={`${timeCards.studiedDayCount} dias estudados`} accent />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric
            label="Média por dia estudado"
            value={formatDurationRaw(timeCards.avgPerStudiedDay)}
            sub="minutos ÷ dias com sessão"
          />
          <Metric
            label="Média por dia do período"
            value={formatDurationRaw(timeCards.avgPerPeriodDay)}
            sub="minutos ÷ dias do período"
          />
          <Metric
            label="Maior dia"
            value={timeCards.bestDay ? formatDurationRaw(timeCards.bestDay.minutes) : "—"}
            sub={timeCards.bestDay ? formatBRDate(timeCards.bestDay.date) : "sem estudo"}
          />
          <Metric
            label="Menor dia"
            value={timeCards.worstDay ? formatDurationRaw(timeCards.worstDay.minutes) : "—"}
            sub={timeCards.worstDay ? formatBRDate(timeCards.worstDay.date) : "—"}
          />
        </div>
        {timeCards.totalMinutes === 0 && filteredSessions.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Há sessões registradas, mas nenhuma com duração válida no período.
          </p>
        )}
      </SectionCard>

      {/* ===================== MÉTRICAS BASE ===================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SectionCard title="Sessões" subtitle="Concluídas e interrompidas">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-black">{sessionStats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Média de duração</span>
              <span className="font-bold">{formatDurationRaw(sessionStats.averageMinutes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mais longa</span>
              <span className="font-bold">{formatDurationRaw(sessionStats.longestMinutes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Concluídas</span>
              <span className="font-bold text-emerald-600">{sessionStats.completed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interrompidas</span>
              <span className="font-bold text-amber-600">{sessionStats.interrupted}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Desempenho" subtitle={`${questionStats.total} questões no período`}>
          <div className="flex items-center gap-4">
            <Donut value={questionStats.accuracy} size={84} />
            <div className="space-y-1 text-sm flex-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acertos</span>
                <span className="font-black text-emerald-600">{questionStats.correct}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Erros</span>
                <span className="font-black text-rose-600">{questionStats.wrong}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acurácia</span>
                <span className="font-black">{questionStats.accuracy === null ? "—" : `${Math.round(questionStats.accuracy)}%`}</span>
              </div>
            </div>
          </div>
          {questionStats.total === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Acurácia aparece quando houver questões respondidas (manual ou pela plataforma).
            </p>
          )}
        </SectionCard>

        <SectionCard title="Qualidade" subtitle="Foco e pausas">
          <div className="text-sm">
            <div className="font-black text-3xl mb-1">
              {focusStats.average === null ? "—" : `${Math.round(focusStats.average)}%`}
            </div>
            <p className="text-xs text-muted-foreground mb-3">foco médio das sessões</p>
            <ProgressBar pct={focusStats.average ?? 0} barClass={focusBarCls(focusStats.average)} />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>
                Ativo {formatDurationRaw(focusStats.totalActiveMinutes)}
              </span>
              <span>
                Pausa {formatDurationRaw(focusStats.totalPausedMinutes)}
              </span>
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>
                {focusStats.activeRatio !== null ? `${Math.round(focusStats.activeRatio * 100)}% do tempo ativo` : ""}
              </span>
              <span>
                {focusStats.best !== null ? `melhor ${Math.round(focusStats.best)}%` : ""}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Constância" subtitle="Sequência e frequência">
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Sequência atual</span>
              <span className="font-black text-lg">
                {streaks.current} {streaks.current === 1 ? "dia" : "dias"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maior sequência</span>
              <span className="font-bold">{streaks.longest} dias</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Últimos 7 dias</span>
              <span className="font-bold">{frequency.last7Days} de 7</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Últimos 30 dias</span>
              <span className="font-bold">{frequency.last30Days} de 30</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Média semanal</span>
              <span className="font-bold">{frequency.weeklyAvgDays.toFixed(1)} dias</span>
            </div>
            {frequency.daysSinceLastStudy !== null && frequency.daysSinceLastStudy > 0 && (
              <p className="text-[11px] text-amber-600 font-semibold">
                {frequency.daysSinceLastStudy} dias sem estudar{streaks.current === 0 ? " — quebre o ciclo hoje" : ""}
              </p>
            )}
            {streaks.current >= 3 && (
              <p className="text-[11px] text-emerald-600 font-semibold">🔥 Sequência de {streaks.current} dias!</p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ===================== EVOLUÇÃO ===================== */}
      <EvolutionChart data={chartData} rangeDays={days} empty={filteredSessions.length === 0} />

      {/* ===================== HEATMAP ===================== */}
      <SectionCard title="Calendário de atividade" subtitle="Intensidade de estudo por dia (nível por percentil)" action={<HeatmapLegendNote />}>
        {heatmap.length > 0 ? (
          <HeatmapCalendar cells={heatmap} now={now} timezone={TIMEZONE} />
        ) : (
          <EmptyState message="Sem dados no período selecionado." />
        )}
      </SectionCard>

      {/* ===================== DISCIPLINAS ===================== */}
      <DisciplinasSection
        stats={disciplineStats}
        totalMinutes={timeCards.totalMinutes}
        empty={filteredSessions.length === 0}
      />

      {/* ===================== TÓPICOS ===================== */}
      <SectionCard
        title="Matérias (tópicos)"
        subtitle="Agrupados por tema registrado nas sessões — classificação pela mesma regra das disciplinas"
      >
        {topicStats.length === 0 ? (
          <EmptyState message="Registre tópicos nas sessões (ex.: “Controle de Constitucionalidade”) para ver o desempenho por assunto." />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  <th className="text-left py-2 pr-2 font-bold">Tópico</th>
                  <th className="text-left py-2 pr-2 font-bold">Disciplina</th>
                  <th className="text-right py-2 pr-2 font-bold">Tempo</th>
                  <th className="text-right py-2 pr-2 font-bold">Questões</th>
                  <th className="text-right py-2 pr-2 font-bold">Acurácia</th>
                  <th className="text-right py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {topicStats.slice(0, 50).map((t) => (
                  <tr key={`${t.disciplineId}-${t.topicName}`} className="border-t border-border/40">
                    <td className="py-2 pr-2 font-semibold">{t.topicName}</td>
                    <td className="py-2 pr-2 text-muted-foreground">{t.disciplineName}</td>
                    <td className="py-2 pr-2 text-right font-mono">{formatDurationRaw(t.minutes)}</td>
                    <td className="py-2 pr-2 text-right">{t.questions}</td>
                    <td className="py-2 pr-2 text-right font-bold">
                      {t.accuracy === null ? "—" : `${Math.round(t.accuracy)}%`}
                    </td>
                    <td className="py-2 text-right">
                      <ClassificationChip classification={t.classification} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===================== QUESTÕES ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Questões ao longo do tempo" subtitle="Volume diário e acurácia em linha">
          {questionTrend.length === 0 ? (
            <EmptyState message="Sem questões registradas no período." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={questionTrend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis yAxisId="q" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={28} />
                  <YAxis yAxisId="a" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip content={<QTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
                  <Bar yAxisId="q" dataKey="questions" name="Questões" fill="#2563EB" radius={[3, 3, 0, 0]} barSize={Math.max(2, Math.min(10, 360 / questionTrend.length))} />
                  <Line yAxisId="a" type="monotone" dataKey="accuracy" name="Acurácia %" stroke="#22c55e" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Mapa de erros" subtitle="Onde os erros se concentram (rever antes de avançar)">
          <ErrorMap
            disciplineStats={disciplineStats}
            topicStats={topicStats.filter((t) => t.wrong > 0)}
            empty={questionStats.total === 0}
          />
        </SectionCard>
      </div>

      {/* ===================== PRODUTIVIDADE ===================== */}
      <SectionCard
        title="Produtividade"
        subtitle="Índice 0-100 com fórmula documentada abaixo"
        action={productivity.score !== null ? <span className="text-3xl font-black text-[#2563EB] font-mono">{productivity.score}</span> : null}
      >
        {productivity.score === null ? (
          <div>
            <EmptyState message="Complete ao menos 3 sessões no período para calcular o índice de produtividade — a fórmula soma tempo ativo (40%), acurácia (30%), foco (20%) e constância (10%)." />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Tempo ativo (40%)" value={`${productivity.breakdown.activeRatioScore}%`} sub="minutos ativos ÷ duração total" />
            <Metric label="Acurácia (30%)" value={`${productivity.breakdown.accuracyScore}%`} sub="com ≥5 questões no período" />
            <Metric label="Foco (20%)" value={`${productivity.breakdown.focusScore}%`} sub="foco médio das sessões" />
            <Metric label="Constância (10%)" value={`${productivity.breakdown.consistencyScore}%`} sub="dias estudados nos últimos 7" />
          </div>
        )}
      </SectionCard>

      {/* ===================== ANÁLISE INTELIGENTE ===================== */}
      <SectionCard
        title="Análise inteligente"
        subtitle="Insights gerados por regras determinísticas sobre os seus dados (sem IA de terceiros)"
        action={<Sparkles className="h-4 w-4 text-[#2563EB]" />}
      >
        {insights.length === 0 ? (
          <EmptyState message="Sem sinais suficientes ainda — registre mais sessões." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins) => {
              const style = INSIGHT_STYLES[ins.severity]
              const Icon = style.icon
              return (
                <div key={ins.id} className={`rounded-xl border p-3.5 flex gap-3 ${style.cls}`}>
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-foreground/70" />
                  <div>
                    <p className="text-xs font-bold text-foreground">{ins.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{ins.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* ===================== PRIORIDADES ===================== */}
      <SectionCard
        title="Prioridades de estudo"
        subtitle="Score de atenção 0-100: desempenho 30% · erros 15% · abandono 20% · revisão atrasada 15% · cobertura 10% · tendência 10%"
        action={<ListChecks className="h-4 w-4 text-[#2563EB]" />}
      >
        {priorities.length === 0 ? (
          <EmptyState message="Sem disciplinas estudadas no período." />
        ) : (
          <div className="space-y-3">
            {priorities.map((p, i) => (
              <div key={p.disciplineId} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                <span className="w-6 h-6 rounded-full bg-[#2563EB]/10 text-[#2563EB] text-xs font-black flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold">{p.name}</p>
                    <span className="text-xs font-black font-mono text-[#2563EB]">{p.score}<span className="text-muted-foreground font-semibold">/100</span></span>
                  </div>
                  {p.reasons.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.reasons.join(" · ")}</p>
                  )}
                  <p className="text-[11px] text-foreground/80 mt-1 font-medium">{p.action}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ===================== REVISÕES ===================== */}
      <RevisionSection revision={revisionStats} />

      {/* ===================== PLANEJADO X REALIZADO ===================== */}
      <SectionCard
        title="Planejado × Realizado"
        subtitle={
          planning.hasPlan
            ? formatPlanningSubtitle(planning)
            : "Sem plano ativo — crie um plano no concurso para acompanhar aqui"
        }
        action={planning.hasPlan && planning.adherencePct !== null ? (
          <span className={`text-xs font-black ${adherenceClass(planning.adherencePct)}`}>
            {Math.round(planning.adherencePct)}% da meta semanal
          </span>
        ) : null}
      >
        {!planning.hasPlan ? (
          <EmptyState message="Quando houver um plano ativo, o gráfico mostra o planejado por dia da semana (pela grade do plano) contra o realizado." />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Meta semanal" value={formatDurationRaw(planning.weeklyTargetMinutes)} sub="minutos planejados" />
              <Metric label="Realizado na semana" value={formatDurationRaw(planning.actualWeekMinutes)} sub={`${planning.actualWeekDays} dias`} accent />
              <Metric label="Aderência" value={planning.adherencePct === null ? "—" : `${Math.round(planning.adherencePct)}%`} sub="realizado ÷ meta semanal" />
              <Metric label="Questões da semana" value={String(planning.actualWeekQuestions)} sub={planning.weeklyTargetQuestions > 0 ? `meta ${planning.weeklyTargetQuestions}` : "sem meta"} />
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={planning.series} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={32} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => formatDurationRaw(v)} />
                  <Tooltip content={<PlanTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
                  <Bar dataKey="actualMinutes" name="Realizado" fill="#2563EB" radius={[3, 3, 0, 0]} />
                  <Line type="stepAfter" dataKey="plannedMinutes" name="Planejado" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </SectionCard>

      {/* ===================== EDITAL ===================== */}
      <SectionCard
        title="Progresso no edital"
        subtitle="Status das disciplinas do seu concurso e cobertura geral"
        action={
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-[#2563EB] font-mono">{edital.percentage}%</span>
            <div className="w-28"><ProgressBar pct={edital.percentage} /></div>
          </div>
        }
      >
        {edital.total === 0 ? (
          <EmptyState message="Adicione um concurso (edital) para acompanhar a cobertura por disciplina." />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Total" value={edital.total} sub="disciplinas no edital" />
              <Metric label="Concluídas" value={edital.completed} sub="status CONCLUÍDA" />
              <Metric label="Em estudo" value={edital.studying} sub="status EM_ESTUDO" />
              <Metric label="Não iniciadas" value={edital.notStarted} sub="status NOT_STARTED" />
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    <th className="text-left py-2 pr-2 font-bold">Disciplina</th>
                    <th className="text-left py-2 pr-2 font-bold">Área</th>
                    <th className="text-right py-2 pr-2 font-bold">Estudado</th>
                    <th className="text-right py-2 pr-2 font-bold">Última sessão</th>
                    <th className="text-right py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {edital.byDiscipline.map((d) => (
                    <tr key={d.disciplineId} className="border-t border-border/40">
                      <td className="py-2 pr-2 font-semibold">{d.name}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{d.area ?? "—"}</td>
                      <td className="py-2 pr-2 text-right font-mono">{formatDurationRaw(d.studiedMinutes)}</td>
                      <td className="py-2 pr-2 text-right">
                        {daysSinceLastStudyLabel(d.daysSinceLastStudy)}
                      </td>
                      <td className="py-2 text-right">{statusLabel(d.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      {/* ===================== EU VS EU ===================== */}
      <SectionCard
        title="Eu × Eu"
        subtitle="Comparações do período atual contra seus próprios períodos anteriores"
      >
        <ComparisonsTable rows={comparisons} />
      </SectionCard>

      {/* ===================== HORÁRIOS ===================== */}
      <SectionCard title="Períodos do dia" subtitle="Manhã, tarde, noite e madrugada — por tempo e desempenho registrado">
        <HoursSection hours={hoursOfDay} empty={filteredSessions.length === 0} />
      </SectionCard>

      {/* ===================== RESUMOS ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Resumo semanal" subtitle="Últimos 7 dias vs os 7 anteriores">
          <ReportTable rows={weeklyReport} />
        </SectionCard>
        <SectionCard title="Resumo mensal" subtitle="Mês corrido vs mês anterior completo">
          <ReportTable rows={monthlyReport} />
        </SectionCard>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function dateFromToday(today: string, offsetDays: number): string | null {
  const d = new Date(today + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function filterSessions(
  sessions: StatisticsCenterPayload["sessions"],
  rangeKeys: string[],
  disciplineId: string,
  studyType: string,
  timezone: string
) {
  const min = rangeKeys[0]
  const max = rangeKeys[rangeKeys.length - 1]
  return sessions.filter((s) => {
    const k = dateKeyOf(s.startedAt, timezone)
    if (!k || !min || !max) return false
    if (k < min || k > max) return false
    if (disciplineId !== "all" && s.disciplineId !== disciplineId) return false
    if (studyType !== "all" && s.studyType !== studyType) return false
    return true
  })
}

function filterAttempts(
  attempts: StatisticsCenterPayload["attempts"],
  rangeKeys: string[],
  disciplineId: string,
  timezone: string
) {
  const min = rangeKeys[0]
  const max = rangeKeys[rangeKeys.length - 1]
  return attempts.filter((a) => {
    if (disciplineId !== "all" && a.disciplineId !== disciplineId && a.disciplineId !== null) return false
    if (!a.answeredAt) return true
    const k = dateKeyOf(a.answeredAt, timezone)
    if (!k || !min || !max) return false
    return k >= min && k <= max
  })
}

function buildChartData(buckets: DailyBucket[], rangeDays: number, _timezone: string) {
  if (rangeDays > 90) {
    const groups = new Map<string, DailyBucket>()
    buckets.forEach((b) => {
      const monday = mondayKeyOf(b.date)
      if (!monday) return
      let g = groups.get(monday)
      if (!g) {
        g = { ...b }
        groups.set(monday, g)
      } else {
        g.minutes += b.minutes
        g.sessions += b.sessions
        g.questions += b.questions
        g.correct += b.correct
        g.wrong += b.wrong
        g.pages += b.pages
        g.focusSum += b.focusSum
        g.focusCount += b.focusCount
      }
    })
    return [...groups.entries()].map(([monday, g]) => ({
      label: shortDate(monday),
      date: monday,
      minutos: Math.round(g.minutes),
      questoes: g.questions,
      acuracia: g.questions > 0 ? Math.round((g.correct / g.questions) * 100) : null,
      foco: g.focusCount > 0 ? Math.round(g.focusSum / g.focusCount) : null,
      paginas: g.pages,
      sessoes: g.sessions,
    }))
  }
  return buckets.map((b) => ({
    label: shortDate(b.date),
    date: b.date,
    minutos: Math.round(b.minutes),
    questoes: b.questions,
    acuracia: b.accuracy === null ? null : Math.round(b.accuracy),
    foco: b.focusAvg === null ? null : Math.round(b.focusAvg),
    paginas: b.pages,
    sessoes: b.sessions,
  }))
}

function shortDate(key: string): string {
  const [, m, d] = key.split("-")
  return `${d}/${m}`
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    TEORIA: "Teoria",
    QUESTOES: "Questões",
    REVISAO: "Revisão",
    RESUMO: "Resumo",
    MAPA_MENTAL: "Mapa mental",
    FLASHCARDS: "Flashcards",
    VIDEOAULA: "Videoaula",
    AUDIO: "Áudio",
    AULA_VIVO: "Aula ao vivo",
    LEITURA: "Leitura",
    LEI_SECA: "Lei seca",
    JURISPRUDENCIA: "Jurisprudência",
    INFORMATIVOS: "Informativo",
    DOUTRINA: "Doutrina",
    SIMULADO: "Simulado",
    MONITORIA: "Monitoria",
    ESTUDO_IA: "Estudo com IA",
    DISCUSSAO: "Discussão",
    OUTRO: "Outro",
  }
  return map[t] ?? t
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    CONCLUIDA: "✅ Concluída",
    COMPLETED: "✅ Concluída",
    CONCLUÍDA: "✅ Concluída",
    EM_ESTUDO: "📘 Em estudo",
    STUDYING: "📘 Em estudo",
    EM_REVISAO: "🔁 Em revisão",
    REVISING: "🔁 Em revisão",
    NOT_STARTED: "⏳ Não iniciada",
    NOT_STARTED_: "⏳ Não iniciada",
  }
  return map[status] ?? status
}

function focusBarCls(pct: number | null): string {
  if (pct === null) return "bg-muted"
  if (pct >= 75) return "bg-emerald-500"
  if (pct >= 50) return "bg-amber-500"
  return "bg-rose-500"
}

function Donut({ value, size }: { value: number | null; size: number }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3.8" className="text-muted/40" />
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="#2563EB"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeDasharray={`${v}, 100`}
          className={value === null ? "opacity-30" : ""}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-black font-mono" style={{ fontSize: size / 4.6 }}>
        {value === null ? "—" : `${v}%`}
      </div>
    </div>
  )
}

function HeatmapLegendNote() {
  return <span className="text-[10px] text-muted-foreground">níveis por percentil de minutos por dia</span>
}

function formatEvolutionValue(metric: string, value: number): string {
  if (metric === "minutos") return formatDurationRaw(value)
  if (metric === "acuracia" || metric === "foco") return `${Math.round(value)}%`
  return String(Math.round(value))
}

// ─── Evolução ───────────────────────────────────────────────────────────────

const EVO_METRICS = [
  { id: "minutos", label: "Tempo" },
  { id: "questoes", label: "Questões" },
  { id: "acuracia", label: "Acurácia" },
  { id: "foco", label: "Foco" },
  { id: "paginas", label: "Páginas" },
  { id: "sessoes", label: "Sessões" },
]

type EvolutionDataPoint = {
  label: string
  date: string
  minutos: number
  questoes: number
  acuracia: number | null
  foco: number | null
  paginas: number
  sessoes: number
}

type ChartTooltipProps = {
  active?: boolean
  label?: string
  payload?: { value?: number; payload?: EvolutionDataPoint & { actualMinutes?: number; plannedMinutes?: number; actualSessions?: number } }[]
}

function EvolutionChart({ data, rangeDays, empty }: { data: EvolutionDataPoint[]; rangeDays: number; empty: boolean }) {
  const [metric, setMetric] = useState("minutos")
  const lineBased = metric === "acuracia" || metric === "foco"
  let color = "#2563EB"
  if (metric === "acuracia") color = "#22c55e"
  else if (metric === "foco") color = "#8b5cf6"

  const fmt = (value: number) => formatEvolutionValue(metric, value)

  return (
    <SectionCard
      title="Evolução"
      subtitle={rangeDays > 90 ? "Agregado por semana" : "Por dia"}
      action={
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg flex-wrap print:hidden">
          {EVO_METRICS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                metric === m.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      {empty || data.length === 0 ? (
        <EmptyState message="Sem sessões no período selecionado." />
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={38} tickFormatter={fmt} />
              <Tooltip content={<EvoTooltip metric={metric} />} />
              {lineBased ? (
                <Line type="monotone" dataKey={metric} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              ) : (
                <Area type="monotone" dataKey={metric} stroke={color} strokeWidth={2.5} fill="url(#evoFill)" dot={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  )
}

function EvoTooltip({ active, payload, label, metric }: ChartTooltipProps & { metric: string }) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value
  const full = payload[0]?.payload
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold mb-1">{label}</p>
      <p>
        <span className="text-muted-foreground">{EVO_METRICS.find((m) => m.id === metric)?.label}: </span>
        <span className="font-bold">
          {formatEvolutionValue(metric, v ?? 0)}
        </span>
      </p>
      {(full?.sessoes ?? 0) > 0 && <p className="text-muted-foreground">{full?.sessoes} sessões</p>}
      {(full?.questoes ?? 0) > 0 && <p className="text-muted-foreground">{full?.questoes} questões</p>}
    </div>
  )
}

function QTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as { questions?: number; accuracy?: number | null } | undefined
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-0.5">
      <p className="font-semibold mb-1">{label}</p>
      {(p?.questions ?? 0) > 0 && (
        <p>
          <span className="text-muted-foreground">Questões: </span>
          <span className="font-bold">{p?.questions}</span>
        </p>
      )}
      {p?.accuracy !== null && p?.accuracy !== undefined && (
        <p>
          <span className="text-muted-foreground">Acurácia: </span>
          <span className="font-bold">{Math.round(p.accuracy)}%</span>
        </p>
      )}
    </div>
  )
}

function PlanTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-0.5">
      <p className="font-semibold mb-1">{label}</p>
      <p><span className="text-muted-foreground">Realizado: </span><span className="font-bold">{formatDurationRaw(p?.actualMinutes ?? 0)}</span></p>
      <p><span className="text-muted-foreground">Planejado: </span><span className="font-bold">{formatDurationRaw(p?.plannedMinutes ?? 0)}</span></p>
      {(p?.actualSessions ?? 0) > 0 && <p className="text-muted-foreground">{p?.actualSessions} sessões</p>}
    </div>
  )
}

// ─── Disciplinas ────────────────────────────────────────────────────────────

type SortKey = "tempo" | "questoes" | "acuracia" | "prioridade" | "erros"

function DisciplinasSection({ stats, totalMinutes: _totalMinutes, empty }: { stats: DisciplineStat[]; totalMinutes: number; empty: boolean }) {
  const [sort, setSort] = useState<SortKey>("tempo")

  const sorted = useMemo(() => {
    const list = [...stats]
    switch (sort) {
      case "tempo":
        return list.sort((a, b) => b.minutes - a.minutes)
      case "questoes":
        return list.sort((a, b) => b.questions - a.questions)
      case "acuracia":
        return list.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1))
      case "erros":
        return list.sort((a, b) => b.wrong - a.wrong)
      case "prioridade":
        return list.sort((a, b) => b.attentionScore - a.attentionScore)
      default:
        return list
    }
  }, [stats, sort])

  return (
    <SectionCard
      title="Desempenho por disciplina"
      subtitle="Fórmulas documentadas: acurácia = acertos ÷ questões · tendência = 2ª metade ÷ 1ª metade do período · classificação pelas regras do painel"
      action={
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border bg-card px-2.5 py-1.5 text-xs text-foreground print:hidden">
          <option value="tempo">Por tempo</option>
          <option value="questoes">Por questões</option>
          <option value="acuracia">Por acurácia</option>
          <option value="erros">Por erros</option>
          <option value="prioridade">Por prioridade</option>
        </select>
      }
    >
      {empty || sorted.length === 0 ? (
        <EmptyState message="Sem sessões no período — estude uma disciplina para vê-la aqui." />
      ) : (
        <div className="space-y-4">
          {sorted.map((d) => {
            const maxMinutes = Math.max(...sorted.map((x) => x.minutes), 1)
            const pct = (d.minutes / maxMinutes) * 100
            return (
              <div key={d.disciplineId} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.area ?? "Geral"} · {d.sessions} sessões</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClassificationChip classification={d.classification} />
                    {d.daysSinceLastStudy !== null && (
                      <span className={`text-[10px] font-bold ${d.daysSinceLastStudy > 30 ? "text-rose-600" : "text-muted-foreground"}`}>
                        {d.daysSinceLastStudy === 0 ? "hoje" : `${d.daysSinceLastStudy}d`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ProgressBar pct={pct} height="h-2.5" />
                  </div>
                  <span className="text-xs font-black font-mono whitespace-nowrap">{formatDurationRaw(d.minutes)}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Questões</p>
                    <p className="font-bold">{d.questions}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Acurácia</p>
                    <p className="font-bold">{d.accuracy === null ? "—" : `${Math.round(d.accuracy)}%`}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Erros</p>
                    <p className="font-bold text-rose-600">{d.wrong}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Foco</p>
                    <p className="font-bold">{d.focusAvg === null ? "—" : `${Math.round(d.focusAvg)}%`}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tendência</p>
                    <p className="font-bold">
                      <TendenciaChip trend={d.trendDirection} delta={d.accuracyTrend} />
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{Math.round(d.shareOfTotalMinutes)}% do tempo total · atenção {d.attentionScore}/100</span>
                  <span>páginas {d.pages} · flashcards {d.flashcards}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

function TendenciaChip({ trend, delta }: { trend: "UP" | "DOWN" | "STABLE"; delta: number | null }) {
  if (trend === "UP") return <span className="text-emerald-600">▲ {delta === null ? "" : `+${Math.round(delta)}%`}</span>
  if (trend === "DOWN") return <span className="text-rose-600">▼ {delta === null ? "" : `${Math.round(delta)}%`}</span>
  return <span className="text-muted-foreground">■ estável</span>
}

// ─── Mapa de erros ──────────────────────────────────────────────────────────

function ErrorMap({ disciplineStats, topicStats, empty }: { disciplineStats: DisciplineStat[]; topicStats: TopicStat[]; empty: boolean }) {
  const byDiscipline = [...disciplineStats].sort((a, b) => b.wrong - a.wrong).filter((d) => d.wrong > 0)
  const byTopic = [...topicStats].sort((a, b) => b.wrong - a.wrong).slice(0, 5)

  if (empty || (byDiscipline.length === 0 && byTopic.length === 0)) {
    return (
      <div>
        <EmptyState message="Nenhum erro registrado — sem questões respondidas ou tudo certo por aqui. 🎯" />
      </div>
    )
  }

  const maxErr = Math.max(...byDiscipline.map((d) => d.wrong), 1)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Por disciplina</p>
        <div className="space-y-2">
          {byDiscipline.slice(0, 5).map((d) => (
            <div key={d.disciplineId} className="flex items-center gap-2 text-xs">
              <span className="w-40 truncate font-semibold">{d.name}</span>
              <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(d.wrong / maxErr) * 100}%` }} />
              </div>
              <span className="font-black text-rose-600 w-6 text-right">{d.wrong}</span>
            </div>
          ))}
        </div>
      </div>
      {byTopic.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Por tópico</p>
          <div className="space-y-1.5">
            {byTopic.map((t) => (
              <div key={`${t.disciplineId}-${t.topicName}`} className="flex items-center justify-between text-xs border border-border/40 rounded-md px-2.5 py-1.5">
                <span className="truncate font-medium">{t.topicName} <span className="text-muted-foreground">· {t.disciplineName}</span></span>
                <span className="font-black text-rose-600">{t.wrong} erros</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Revisões ───────────────────────────────────────────────────────────────

function RevisionSection({ revision }: { revision: ReturnType<typeof computeRevisionStatistics> }) {
  return (
    <SectionCard
      title="Revisões (memória)"
      subtitle="Fila do motor de repetição espaçada — atrasadas, de hoje e concluídas nos últimos 30 dias"
      action={<Brain className="h-4 w-4 text-[#2563EB]" />}
    >
      {revision.totalPending === 0 && revision.completedLast30 === 0 ? (
        <EmptyState message="Nenhum item de revisão ainda. Quando o motor de repetição espaçada tiver itens, eles aparecem aqui com a taxa de conclusão." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Metric label="Pendentes" value={revision.totalPending} sub="em fila" />
            <Metric label="Atrasadas" value={revision.overdue} sub="vencidas" accent={revision.overdue > 0} />
            <Metric label="Para hoje" value={revision.dueToday} sub="vencimento de hoje" />
            <Metric label="Concluídas 30d" value={revision.completedLast30} sub="últimos 30 dias" />
            <Metric
              label="Taxa de conclusão"
              value={revision.completionRate === null ? "—" : `${Math.round(revision.completionRate)}%`}
              sub="concluídas ÷ (concluídas + pendentes)"
            />
          </div>
          {revision.byDiscipline.length > 0 && (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    <th className="text-left py-2 pr-2 font-bold">Disciplina</th>
                    <th className="text-right py-2 pr-2 font-bold">Atrasadas</th>
                    <th className="text-right py-2 pr-2 font-bold">Próximas</th>
                    <th className="text-right py-2 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {revision.byDiscipline.map((d) => (
                    <tr key={d.disciplineId} className="border-t border-border/40">
                      <td className="py-2 pr-2 font-semibold">{d.name}</td>
                      <td className={`py-2 pr-2 text-right font-bold ${d.overdue > 0 ? "text-rose-600" : ""}`}>{d.overdue}</td>
                      <td className="py-2 pr-2 text-right">{d.dueSoon}</td>
                      <td className="py-2 text-right">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── Eu × Eu ────────────────────────────────────────────────────────────────

const CMP_COLUMNS: { key: CmpKey; label: string }[] = [
  { key: "minutes", label: "Tempo" },
  { key: "sessions", label: "Sessões" },
  { key: "days", label: "Dias" },
  { key: "questions", label: "Questões" },
  { key: "accuracy", label: "Acurácia" },
  { key: "focus", label: "Foco" },
  { key: "pages", label: "Páginas" },
]

function ComparisonsTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
            <th className="text-left py-2 pr-2 font-bold">Comparação</th>
            {CMP_COLUMNS.map((c) => (
              <th key={c.key} className="text-right py-2 px-1.5 font-bold min-w-16">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40">
              <td className="py-2.5 pr-2">
                <p className="font-bold">{r.label}</p>
                <p className="text-[10px] text-muted-foreground">{r.detail}</p>
              </td>
              {CMP_COLUMNS.map((c) => {
                const m = r.metrics[c.key]
                const isPp = c.key === "accuracy" || c.key === "focus"
                return (
                  <td key={c.key} className="py-2.5 px-1.5 text-right">
                    <p className="font-bold">
                      {metricCmpValue(m, c.key)}
                    </p>
                    <p>
                      <DeltaBadge delta={m?.delta ?? null} suffix={isPp ? "pp" : ""} />
                    </p>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Horários ───────────────────────────────────────────────────────────────

function HoursSection({ hours, empty }: { hours: HourBucket[]; empty: boolean }) {
  if (empty || hours.every((h) => h.minutes === 0 && h.questions === 0)) {
    return <EmptyState message="Sem sessões no período — os períodos do dia aparecem aqui." />
  }
  const maxMinutes = Math.max(...hours.map((h) => h.minutes), 1)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {hours.map((h) => (
        <div key={h.period} className={`rounded-lg border p-3 ${h.best ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60"}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">{h.label}</p>
            {h.best && <span className="text-[10px] font-black text-emerald-600">MELHOR RENDIMENTO</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
              <div className="h-full bg-[#2563EB] rounded-full" style={{ width: `${(h.minutes / maxMinutes) * 100}%` }} />
            </div>
            <span className="text-xs font-black font-mono">{formatDurationRaw(h.minutes)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
            <div>
              <p className="text-muted-foreground">Sessões</p>
              <p className="font-bold">{h.sessions}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Questões</p>
              <p className="font-bold">{h.questions}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Acurácia</p>
              <p className="font-bold">{h.accuracy === null ? "—" : `${Math.round(h.accuracy)}%`}</p>
            </div>
          </div>
          {h.best && (
            <p className="text-[10px] text-emerald-600 mt-1.5">
              Melhor desempenho registrado (maior acurácia com ≥ 5 questões) — considere fixar a prática nesse horário.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Relatório ──────────────────────────────────────────────────────────────

function ReportTable({ rows }: { rows: { id: string; label: string; current: string; previous: string; deltaLabel: string; positive: boolean }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
            <th className="text-left py-2 pr-2 font-bold">Métrica</th>
            <th className="text-right py-2 pr-2 font-bold">Atual</th>
            <th className="text-right py-2 pr-2 font-bold">Anterior</th>
            <th className="text-right py-2 font-bold">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40">
              <td className="py-2 pr-2 font-semibold">{r.label}</td>
              <td className="py-2 pr-2 text-right font-bold">{r.current}</td>
              <td className="py-2 pr-2 text-right text-muted-foreground">{r.previous}</td>
              <td className={`py-2 text-right font-black ${r.positive ? "text-emerald-600" : "text-rose-600"}`}>{r.deltaLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}