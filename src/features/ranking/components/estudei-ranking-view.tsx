"use client"

import { useState, useEffect, useMemo, type ReactNode } from "react"
import {
  Trophy,
  Users,
  Timer,
  ListChecks,
  BookOpen,
  Crown,
  Medal,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Flame,
  Target,
  Eye,
  ArrowUp,
  ArrowDown,
  Crosshair,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getGlobalRankingAction,
  getRankingPersonalContextAction,
  type RankingPersonalContext,
} from "@/application/study-analytics/study-analytics.actions"
import { toast } from "sonner"

export interface RankingStudent {
  rank: number
  id: string
  name: string
  avatar: string
  targetContest: string
  hours: string
  totalMinutes: number
  questions: number
  pages: number
  initials: string
  bgColor: string
  hasActivity: boolean
}

export type RankingPeriod = "today" | "this_week" | "last_week" | "this_month" | "general"
type RankingMetric = "TEMPO" | "QUESTOES" | "PAGINAS"

interface GlobalRankingData {
  totalParticipants: number
  rankingTempo: RankingStudent[]
  rankingQuestions: RankingStudent[]
  rankingPages: RankingStudent[]
  userStats: {
    tempo: RankingStudent | null
    questoes: RankingStudent | null
    paginas: RankingStudent | null
  }
}

const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: "this_week", label: "Esta semana" },
  { id: "last_week", label: "Semana passada" },
  { id: "today", label: "Hoje" },
  { id: "this_month", label: "Este mês" },
  { id: "general", label: "Geral" },
]

const METRICS: { id: RankingMetric; label: string; icon: LucideIcon }[] = [
  { id: "TEMPO", label: "Tempo de Estudo", icon: Timer },
  { id: "QUESTOES", label: "Questões", icon: ListChecks },
  { id: "PAGINAS", label: "Páginas Lidas", icon: BookOpen },
]

function isMedalRank(rank: number): boolean {
  return rank >= 1 && rank <= 3
}

function medalStyleFor(rank: number): { color: string; fill: string } {
  if (rank === 1) return { color: "#FFA828", fill: "#FFA828" }
  if (rank === 2) return { color: "#C0C0C0", fill: "#C0C0C0" }
  return { color: "#A86534", fill: "#A86534" }
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-background"

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setHours(0, 0, 0, 0)
  return new Date(d.setDate(diff))
}

const pad = (n: number) => String(n).padStart(2, "0")
const fmtFull = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
const fmtShort = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`

function periodRangeFor(period: RankingPeriod): { label: string; range: string } {
  const now = new Date()
  if (period === "today") {
    return { label: "Hoje", range: fmtFull(now) }
  }
  if (period === "this_week") {
    const monday = getMonday(now)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    return { label: "Esta semana", range: `${fmtFull(monday)} — ${fmtFull(sunday)}` }
  }
  if (period === "last_week") {
    const monday = getMonday(now)
    monday.setDate(monday.getDate() - 7)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    return { label: "Semana anterior", range: `${fmtFull(monday)} — ${fmtFull(sunday)}` }
  }
  if (period === "this_month") {
    const label = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    return { label: "Este mês", range: label }
  }
  return { label: "Ranking geral", range: "Todo o histórico" }
}

function formatWeekRange(offset: number): string {
  const monday = getMonday(new Date())
  monday.setDate(monday.getDate() + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return `${fmtShort(monday)} — ${fmtShort(sunday)}`
}

function cleanStudentName(name: string): string {
  return name.replace(/\s*\(Você\)\s*$/i, "")
}

function isCurrentUserStudent(student: RankingStudent, currentUserId: string | null): boolean {
  if (currentUserId && student.id === currentUserId) return true
  return /\(você\)$/i.test(student.name)
}

function metricLabelFor(metric: RankingMetric): string {
  if (metric === "TEMPO") return "Tempo de Estudo"
  if (metric === "QUESTOES") return "Questões"
  return "Páginas Lidas"
}

function metricValueFor(student: RankingStudent, metric: RankingMetric): string {
  if (metric === "TEMPO") return student.hours
  if (metric === "QUESTOES") return `${student.questions} questões`
  return `${student.pages} páginas`
}

// Valor numérico da métrica (para cálculos de distância/progresso)
function metricNumber(student: RankingStudent, metric: RankingMetric): number {
  if (metric === "TEMPO") return student.totalMinutes
  if (metric === "QUESTOES") return student.questions
  return student.pages
}

// Formata distâncias de forma curta e motivacional
function formatGap(metric: RankingMetric, diff: number): string {
  if (metric === "TEMPO") {
    if (diff < 60) return `${Math.max(0, diff)}min`
    const h = Math.floor(diff / 60)
    const m = Math.round(diff % 60)
    return m > 0 ? `${h}h${m}min` : `${h}h`
  }
  if (metric === "QUESTOES") return `${diff} ${diff === 1 ? "questão" : "questões"}`
  return `${diff} ${diff === 1 ? "página" : "páginas"}`
}

function formatGoalTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${pad(m)}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function Avatar({
  student,
  sizeClass,
  imgSize,
}: {
  student: RankingStudent
  sizeClass: string
  imgSize: number
}) {
  if (student.avatar) {
    return (
      <Image
        src={student.avatar}
        alt={student.name}
        width={imgSize}
        height={imgSize}
        unoptimized
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${student.bgColor}`}
    >
      {student.initials}
    </div>
  )
}

function ProgressBar({
  value,
  className = "",
  ariaLabel,
}: {
  value: number
  className?: string
  ariaLabel: string
}) {
  const safe = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className}`}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   VIEW PRINCIPAL
──────────────────────────────────────────────────────────────────────────────*/
export function EstudeiRankingView() {
  const [activeTab, setActiveTab] = useState<RankingMetric>("TEMPO")
  const [period, setPeriod] = useState<RankingPeriod>("this_week")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<GlobalRankingData | null>(null)
  const [prevWeekData, setPrevWeekData] = useState<GlobalRankingData | null>(null)
  const [personal, setPersonal] = useState<RankingPersonalContext | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadRanking() {
      setLoading(true)
      setError(null)
      try {
        const res = await getGlobalRankingAction(period)
        if (cancelled) return
        if (res?.error) {
          setError(res.error)
          toast.error("Erro ao carregar ranking: " + res.error)
        } else if (res?.data) {
          setData(res.data as GlobalRankingData)
        }
      } catch (err: unknown) {
        if (cancelled) return
        const message = errorMessage(err)
        setError(message)
        toast.error("Erro inesperado: " + message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // Semana anterior: usado apenas no comparativo do "Sua Posição" (dados reais).
    async function loadPreviousWeek() {
      if (period !== "this_week") {
        setPrevWeekData(null)
        return
      }
      try {
        const res = await getGlobalRankingAction("last_week")
        if (cancelled) return
        setPrevWeekData((res?.data as GlobalRankingData | null) ?? null)
      } catch {
        if (!cancelled) setPrevWeekData(null)
      }
    }

    loadRanking()
    loadPreviousWeek()

    return () => {
      cancelled = true
    }
  }, [period, reloadKey])

  // Meta semanal + constância (dados reais, sem N+1)
  useEffect(() => {
    let cancelled = false
    getRankingPersonalContextAction()
      .then((res) => {
        if (!cancelled && res.data) setPersonal(res.data)
      })
      .catch(() => {
        if (!cancelled) setPersonal(null)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const currentRanking = useMemo(() => {
    if (!data) return []
    if (activeTab === "TEMPO") return data.rankingTempo
    if (activeTab === "QUESTOES") return data.rankingQuestions
    return data.rankingPages
  }, [data, activeTab])

  const currentUserStats = useMemo(() => {
    if (!data) return null
    if (activeTab === "TEMPO") return data.userStats.tempo
    if (activeTab === "QUESTOES") return data.userStats.questoes
    return data.userStats.paginas
  }, [data, activeTab])

  const prevUserStats = useMemo(() => {
    if (!prevWeekData) return null
    if (activeTab === "TEMPO") return prevWeekData.userStats.tempo
    if (activeTab === "QUESTOES") return prevWeekData.userStats.questoes
    return prevWeekData.userStats.paginas
  }, [prevWeekData, activeTab])

  const rankedStudents = useMemo(
    () => currentRanking.filter((student) => student.hasActivity !== false),
    [currentRanking],
  )

  const top3 = rankedStudents.slice(0, 3)
  const others = rankedStudents.slice(3)

  const myIndex = useMemo(
    () =>
      rankedStudents.findIndex((student) =>
        isCurrentUserStudent(student, currentUserStats?.id ?? null),
      ),
    [rankedStudents, currentUserStats],
  )

  const above = myIndex > 0 ? rankedStudents[myIndex - 1] ?? null : null
  const below = myIndex >= 0 ? rankedStudents[myIndex + 1] ?? null : null

  const positionDelta = useMemo(() => {
    const current = currentUserStats?.rank
    const previous = prevUserStats?.rank
    if (typeof current !== "number" || typeof previous !== "number") return null
    return previous - current
  }, [currentUserStats, prevUserStats])

  const isCurrentUserId = currentUserStats?.id ?? null

  const scrollToMyRow = () => {
    const row = document.getElementById("minha-posicao-ranking")
    row?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  let positionCaption: ReactNode = (
    <span className="text-[11px] font-bold text-muted-foreground">Ranking Global</span>
  )
  if (positionDelta !== null) {
    if (positionDelta > 0) {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-600">
          <TrendingUp className="h-3.5 w-3.5" />
          Subiu {positionDelta} {positionDelta === 1 ? "posição" : "posições"}
        </span>
      )
    } else if (positionDelta < 0) {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-destructive">
          <TrendingDown className="h-3.5 w-3.5" />
          Caiu {Math.abs(positionDelta)} {Math.abs(positionDelta) === 1 ? "posição" : "posições"}
        </span>
      )
    } else {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
          <Minus className="h-3.5 w-3.5" /> Manteve a posição
        </span>
      )
    }
  }

  if (loading && !data) return <RankingSkeleton />

  if (error && !data) {
    return <RankingErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
  }

  const totalParticipants = data?.totalParticipants ?? 0
  const periodInfo = periodRangeFor(period)
  const isOnlyParticipant =
    totalParticipants <= 1 && rankedStudents.length === 1 && myIndex >= 0

  return (
    <div className="space-y-4 pb-16">
      {/* ── Cabeçalho (baixo e compacto) ──────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Trophy className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight leading-none">
              Ranking
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Compare seu desempenho com todos os alunos do Mentor IA.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value="global" onValueChange={() => undefined}>
            <SelectTrigger className="h-9 w-[170px] rounded-lg border bg-card text-xs font-bold shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Ranking Global</SelectItem>
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={(value) => setPeriod(value as RankingPeriod)}>
            <SelectTrigger className="h-9 w-[170px] rounded-lg border bg-card text-xs font-bold shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {loading && data && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-primary animate-fade-in">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando ranking...
        </div>
      )}

      <main
        className={`space-y-4 transition-opacity duration-300 ${
          loading && data ? "opacity-70" : "opacity-100"
        }`}
      >
        {/* ── Barra: período atual + métrica ──────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 w-fit rounded-full border bg-card px-3.5 py-1.5 shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-foreground">
                {periodInfo.label}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">{periodInfo.range}</span>
            </div>
            {period === "this_week" && (
              <div className="flex items-center gap-1.5 w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] font-extrabold text-amber-600">
                  Ranking em andamento
                </span>
              </div>
            )}
          </div>

          {/* Abas de métrica (controlam todo o ranking) */}
          <div role="group" aria-label="Métrica do ranking" className="flex flex-wrap gap-1.5">
            {METRICS.map(({ id, label, icon: MetricIcon }) => {
              const selected = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 border ${FOCUS_RING} ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-muted"
                  }`}
                >
                  <MetricIcon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Faixa de métricas (resumo compacto) ─────────────────────────── */}
        <section
          key={`band-${activeTab}`}
          className="rounded-xl border bg-card shadow-sm overflow-hidden animate-fade-in"
          aria-label="Resumo das suas métricas"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <MetricCell
              label="Tempo"
              value={data?.userStats.tempo?.hours || "0min"}
              caption="estudado"
            />
            <MetricCell
              label="Questões"
              value={data?.userStats.tempo?.questions ?? 0}
              caption="respondidas"
            />
            <MetricCell
              label="Páginas"
              value={data?.userStats.tempo?.pages ?? 0}
              caption="lidas"
            />
            <MetricCell
              label="Sequência"
              value={`${personal?.streak.consecutiveDays ?? 0} dias`}
              caption="constância"
            />
          </div>
        </section>

        {/* ── ÁREA DE COMPETIÇÃO: HERO + PRÓXIMO ALVO ─────────────────────── */}
        <section
          key={`duel-${activeTab}`}
          className="grid grid-cols-1 lg:grid-cols-[6fr_4fr] gap-4 animate-fade-in"
          aria-label="Sua posição e próximo alvo no ranking"
        >
          <SuaPosicaoCard
            student={currentUserStats}
            hasActivity={currentUserStats?.hasActivity ?? false}
            metric={activeTab}
            above={above}
            below={below}
            totalParticipants={totalParticipants}
            isOnlyParticipant={isOnlyParticipant}
            positionCaption={positionCaption}
          />
          <ProximoAlvoCard
            student={currentUserStats}
            metric={activeTab}
            above={above}
            below={below}
            totalParticipants={totalParticipants}
            isOnlyParticipant={isOnlyParticipant}
          />
        </section>

        {/* ── Avisos (dados reais) ────────────────────────────────────────── */}
        <div className="space-y-2.5">
          {error && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3.5 rounded-xl bg-destructive/5 border border-destructive/20 animate-fade-in">
              <div className="flex items-center gap-2.5 text-destructive min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs font-bold truncate">
                  Falha ao atualizar o ranking: {error}
                </p>
              </div>
              <button
                onClick={() => setReloadKey((key) => key + 1)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-bold hover:opacity-90 transition-opacity ${FOCUS_RING}`}
              >
                <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
              </button>
            </div>
          )}

          {!loading && rankedStudents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-muted/20 rounded-xl border border-dashed animate-fade-in">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Users className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">Ranking começando</h3>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Estude hoje para entrar no ranking e disputar o pódio.
                </p>
              </div>
            </div>
          )}

          {data &&
            rankedStudents.length > 0 &&
            (!currentUserStats || !currentUserStats.hasActivity) && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs font-bold text-amber-700">
                  Você ainda não registrou {metricLabelFor(activeTab).toLowerCase()} no período
                  selecionado. Estude hoje para entrar no ranking.
                </p>
              </div>
            )}
        </div>

        {/* ── TOP 3 (pódio horizontal) ────────────────────────────────────── */}
        {top3.length > 0 && (
          <section key={`podium-${activeTab}-${period}`} className="animate-fade-in-up">
            <div className="grid grid-cols-3 gap-3 sm:gap-4 items-end">
              {[top3[1], top3[0], top3[2]].map((student, index) =>
                student ? (
                  <PodiumCard
                    key={student.id || `pos-${student.rank}`}
                    student={student}
                    metric={activeTab}
                    isYou={isCurrentUserStudent(student, isCurrentUserId)}
                  />
                ) : (
                  <div key={`empty-podium-${index}`} />
                ),
              )}
            </div>
          </section>
        )}

        {/* ── Ranking + Painel lateral ────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] items-start gap-4">
          {/* Ranking completo */}
          <section className="rounded-xl border bg-card shadow-sm overflow-hidden min-w-0">
            <div className="px-4 sm:px-5 py-3.5 border-b bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Ranking completo
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground tabular-nums">
                  {totalParticipants} participante{totalParticipants === 1 ? "" : "s"}
                  {myIndex >= 0 && (
                    <button
                      onClick={scrollToMyRow}
                      className={`inline-flex items-center gap-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 font-black transition-colors ${FOCUS_RING}`}
                      aria-label="Ir para a minha posição na lista"
                    >
                      <Crosshair className="h-3 w-3" /> Minha posição
                    </button>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Passe uma posição para subir · cuidado com quem vem atrás.
              </p>
            </div>

            <div className="p-3 sm:p-4 space-y-1">
              {others.length === 0 && myIndex < 0 && !currentUserStats && (
                <p className="text-center text-xs text-muted-foreground py-5">
                  Sem outros participantes no período.
                </p>
              )}

              <div key={`list-${activeTab}`} className="space-y-1 animate-fade-in-up">
                {others.map((student, idx) => {
                  const isYou = isCurrentUserStudent(student, isCurrentUserId)
                  const prevStudent = idx > 0 ? others[idx - 1] ?? null : null
                  const nextStudent =
                    idx < others.length - 1 ? others[idx + 1] ?? null : null

                  return (
                    <div
                      key={student.id || `pos-${student.rank}`}
                      id={isYou ? "minha-posicao-ranking" : undefined}
                      className="scroll-mt-6"
                    >
                      {isYou &&
                        prevStudent &&
                        metricNumber(prevStudent, activeTab) > metricNumber(student, activeTab) && (
                          <GapLine
                            icon={<ArrowUp className="h-3.5 w-3.5" />}
                            text={`Faltam ${formatGap(
                              activeTab,
                              metricNumber(prevStudent, activeTab) -
                                metricNumber(student, activeTab),
                            )} para passar o #${prevStudent.rank}`}
                          />
                        )}
                      <RankRankingRow student={student} metric={activeTab} isYou={isYou} />
                      {isYou &&
                        nextStudent &&
                        metricNumber(student, activeTab) > metricNumber(nextStudent, activeTab) && (
                          <GapLine
                            icon={<ArrowDown className="h-3.5 w-3.5" />}
                            text={`Você está ${formatGap(
                              activeTab,
                              metricNumber(student, activeTab) -
                                metricNumber(nextStudent, activeTab),
                            )} à frente do #${nextStudent.rank}`}
                          />
                        )}
                    </div>
                  )
                })}
              </div>

              {/* Usuário fora da lista exibida (sem atividade ou posição além da lista) */}
              {currentUserStats && myIndex < 0 && (
                <div
                  id="minha-posicao-ranking"
                  className="pt-2.5 mt-0.5 border-t border-border space-y-1 scroll-mt-6"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                    Sua posição
                  </p>
                  <RankRankingRow student={currentUserStats} metric={activeTab} isYou />
                </div>
              )}
            </div>
          </section>

          {/* Painel lateral: meta, constância, líder e vencedores */}
          <aside className="space-y-4 min-w-0">
            <WeeklyGoalCard personal={personal} />
            <ConsistencyCard personal={personal} />
            {(() => {
              const leader = rankedStudents[0] ?? null
              return leader ? (
                <LeaderOfWeekCard leader={leader} metric={activeTab} period={period} />
              ) : null
            })()}
            {period === "this_week" && <WeeklyWinnersCard />}
          </aside>
        </div>
      </main>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CARD: SUA POSIÇÃO (elemento visual mais forte)
──────────────────────────────────────────────────────────────────────────────*/
function SuaPosicaoCard({
  student,
  hasActivity,
  metric,
  above,
  below,
  totalParticipants,
  isOnlyParticipant,
  positionCaption,
}: {
  student: RankingStudent | null
  hasActivity: boolean
  metric: RankingMetric
  above: RankingStudent | null
  below: RankingStudent | null
  totalParticipants: number
  isOnlyParticipant: boolean
  positionCaption: ReactNode
}) {
  const rank = student?.rank ?? 0
  const value = student ? metricNumber(student, metric) : 0
  const aboveValue = above ? metricNumber(above, metric) : null
  const belowValue = below ? metricNumber(below, metric) : null

  let rankLabel = "Fora do ranking"
  if (rank > 0) {
    rankLabel = isMedalRank(rank) ? ordinalLabelFor(rank) : `${rank}º lugar`
  }
  let progress = 0
  let goalLabel = ""
  let message = "Estude hoje e comece a subir no Ranking Global."

  if (student && hasActivity && rank > 0) {
    if (isOnlyParticipant) {
      message = "Você é o líder do Ranking Global agora."
      goalLabel = "Continue estudando para manter a liderança."
      progress = value > 0 ? 100 : 0
    } else if (rank === 1) {
      message = "Você está liderando."
      goalLabel = "Defenda sua liderança"
      progress =
        value > 0 && belowValue !== null
          ? Math.min(100, Math.round((belowValue / value) * 100))
          : 100
    } else if (rank === 2) {
      message =
        aboveValue !== null && aboveValue > value
          ? `Faltam ${formatGap(metric, aboveValue - value)} para assumir a liderança.`
          : "Você é o 2º colocado. Falta pouco para a liderança."
      goalLabel = "Próximo objetivo: chegar ao #1"
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 0
    } else if (rank === 3) {
      message =
        aboveValue !== null && aboveValue > value
          ? `Faltam ${formatGap(metric, aboveValue - value)} para o #2.`
          : "Você é o 3º colocado. Mantenha o pódio."
      goalLabel = "Próximo objetivo: chegar ao #2"
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 100
    } else if (rank <= 10) {
      message =
        aboveValue !== null && aboveValue > value
          ? `Você está a ${formatGap(metric, aboveValue - value)} de alcançar o #${above?.rank}.`
          : "Você está perto do TOP 3. Suba uma posição."
      goalLabel = `Próximo objetivo: chegar ao #${above?.rank ?? rank - 1}`
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 0
    } else {
      const positionsToTop10 = rank - 10
      message = `Suba ${positionsToTop10} ${
        positionsToTop10 === 1 ? "posição" : "posições"
      } para entrar no TOP 10.`
      goalLabel =
        aboveValue !== null && aboveValue > value
          ? `Faltam ${formatGap(metric, aboveValue - value)} para o #${above?.rank}`
          : "Cada sessão conta"
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 0
    }
  } else if (student && !hasActivity && totalParticipants > 0) {
    message = "Estude hoje e comece a subir no Ranking Global."
    goalLabel = "Registre seu primeiro estudo do período"
  }

  return (
    <div className="relative rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary to-sky-400" />
      <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              🏆 Sua posição
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-5xl sm:text-6xl font-black tracking-tight text-primary leading-none tabular-nums">
                {rank > 0 ? `#${rank}` : "#--"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground leading-tight">
                  {rankLabel}
                  {isMedalRank(rank) && (
                    <Medal
                      className="inline h-4 w-4 ml-1 -mt-0.5"
                      style={medalStyleFor(rank)}
                    />
                  )}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground mt-0.5 tabular-nums">
                  {metricLabelFor(metric)} · {student ? metricValueFor(student, metric) : "0"}
                </p>
              </div>
            </div>
          </div>
          {positionCaption && <div className="shrink-0 pt-0.5">{positionCaption}</div>}
        </div>

        <div>
          <p className="text-[13px] font-bold text-foreground leading-snug">{message}</p>
          {goalLabel && (
            <p className="text-[11px] text-muted-foreground font-semibold mt-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" /> {goalLabel}
            </p>
          )}
          <ProgressBar
            className="mt-3"
            value={progress}
            ariaLabel="Progresso em direção ao próximo objetivo no ranking"
          />
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CARD: PRÓXIMO ALVO + DE OLHO (caçada à frente e defesa atrás)
──────────────────────────────────────────────────────────────────────────────*/
function ProximoAlvoCard({
  student,
  metric,
  above,
  below,
  totalParticipants,
  isOnlyParticipant,
}: {
  student: RankingStudent | null
  metric: RankingMetric
  above: RankingStudent | null
  below: RankingStudent | null
  totalParticipants: number
  isOnlyParticipant: boolean
}) {
  const isTop1 = student?.rank === 1
  const userValue = student ? metricNumber(student, metric) : 0
  const aboveValue = above ? metricNumber(above, metric) : null
  const belowValue = below ? metricNumber(below, metric) : null
  const progress =
    aboveValue !== null && aboveValue > 0 && userValue > 0
      ? Math.min(100, Math.round((userValue / aboveValue) * 100))
      : 0

  let targetTitle = "Ninguém está na sua frente"
  if (totalParticipants <= 0) targetTitle = "Seja o primeiro a entrar no ranking"
  else if (isOnlyParticipant) targetTitle = "Você é o único participante"

  return (
    <div className="relative rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            <Target className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-primary" />
            Próximo alvo
          </p>

          {above ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <Avatar student={above} sizeClass="h-11 w-11 text-xs" imgSize={88} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold text-muted-foreground">#{above.rank}</p>
                <p className="text-sm font-black text-foreground truncate leading-tight">
                  {cleanStudentName(above.name)}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground tabular-nums">
                  {metricValueFor(above, metric)}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5">
              <Crown className="h-6 w-6 shrink-0 text-amber-500/60" />
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">{targetTitle}</p>
                <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                  Continue estudando para construir vantagem.
                </p>
              </div>
            </div>
          )}

          {above && aboveValue !== null && aboveValue > userValue && (
            <p className="mt-3 text-sm font-black text-foreground">
              Faltam{" "}
              <span className="text-primary tabular-nums">
                {formatGap(metric, aboveValue - userValue)}
              </span>{" "}
              para alcançar o #{above.rank}
            </p>
          )}

          {above && (
            <div className="mt-2">
              <ProgressBar
                value={progress}
                ariaLabel={`Progresso para alcançar o ${above.rank}º lugar`}
              />
            </div>
          )}
        </div>

        {/* Quem está atrás (defesa) */}
        {below && belowValue !== null && userValue > belowValue && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <Eye className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <p className="text-xs font-bold text-foreground leading-snug">
              {isTop1 ? (
                <>
                  Defenda a liderança:{" "}
                  <span className="text-amber-600">{cleanStudentName(below.name)}</span> está a{" "}
                  <span className="text-amber-600 tabular-nums">
                    {formatGap(metric, userValue - belowValue)}
                  </span>{" "}
                  de você.
                </>
              ) : (
                <>
                  <span className="text-amber-600">{cleanStudentName(below.name)}</span> (#{below.rank}) está{" "}
                  <span className="text-amber-600 tabular-nums">
                    {formatGap(metric, userValue - belowValue)}
                  </span>{" "}
                  atrás de você.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LINHA DE DISTÂNCIA (entre posições)
──────────────────────────────────────────────────────────────────────────────*/
function GapLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] font-black text-primary">
      {icon}
      <span>{text}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CÉLULA DA FAIXA DE MÉTRICAS (resumo secundário)
──────────────────────────────────────────────────────────────────────────────*/
function MetricCell({
  label,
  value,
  caption,
}: {
  label: string
  value: ReactNode
  caption: ReactNode
}) {
  return (
    <div className="px-4 py-3.5 text-center min-w-0">
      <span className="block text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider truncate">
        {label}
      </span>
      <span className="block text-lg font-black text-foreground tracking-tight tabular-nums leading-tight truncate">
        {value}
      </span>
      <span className="block min-h-4 truncate text-[11px] font-semibold text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PÓDIO (TOP 3)
──────────────────────────────────────────────────────────────────────────────*/
function PodiumCard({
  student,
  metric,
  isYou,
}: {
  student: RankingStudent
  metric: RankingMetric
  isYou: boolean
}) {
  const isFirst = student.rank === 1
  const isSecond = student.rank === 2
  let stepClass = "h-4 bg-gradient-to-r from-orange-400/70 to-orange-600/70"
  if (isFirst) stepClass = "h-5 bg-gradient-to-r from-amber-500 to-yellow-400"
  else if (isSecond) stepClass = "h-4 bg-gradient-to-r from-slate-300 to-slate-400"
  return (
    <div
      className={`relative flex flex-col items-center text-center overflow-hidden rounded-2xl border transition-all duration-200 min-w-0 ${
        isFirst
          ? "border-primary/30 bg-gradient-to-b from-primary/[0.08] to-card shadow-md"
          : "bg-card border-border shadow-sm hover:border-muted"
      } ${isFirst ? "pt-10 pb-0" : "pt-7 pb-0"} px-3`}
    >
      {isFirst && (
        <Crown className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-5 w-5 text-amber-500" />
      )}
      <span
        className={`absolute top-2.5 right-3 font-black leading-none tabular-nums ${
          isFirst ? "text-lg" : "text-base"
        }`}
        style={{ color: medalStyleFor(student.rank).color }}
      >
        {student.rank}º
      </span>

      <div className={`relative ${isFirst ? "mt-0.5" : ""}`}>
        <Avatar
          student={student}
          sizeClass={`${
            isFirst ? "h-16 w-16" : "h-12 w-12"
          } text-sm border-2 border-background shadow-md`}
          imgSize={isFirst ? 128 : 96}
        />
        {isYou && (
          <Badge className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-transparent text-[8px] font-black px-1.5 py-0 rounded-full whitespace-nowrap">
            VOCÊ
          </Badge>
        )}
      </div>

      <span
        className={`mt-2.5 max-w-full truncate leading-tight font-black text-foreground ${
          isFirst ? "text-[15px]" : "text-[13px]"
        }`}
      >
        {cleanStudentName(student.name)}
      </span>
      <span
        className={`mt-0.5 flex items-center justify-center gap-1 text-[10px] font-extrabold uppercase tracking-widest ${
          isFirst ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {ordinalLabelFor(student.rank)}
        {isFirst && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 px-1.5 py-px text-[8px] font-black normal-case tracking-normal">
            <Crown className="h-2.5 w-2.5" /> LÍDER
          </span>
        )}
      </span>
      <span
        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-black tabular-nums ${
          isFirst
            ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-white shadow-sm"
            : "bg-muted text-foreground"
        }`}
      >
        {metricValueFor(student, metric)}
      </span>

      {/* Degrau do pódio */}
      <div className={`mt-3 w-full rounded-t-lg ${stepClass}`} aria-hidden />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LINHA DO RANKING COMPLETO
──────────────────────────────────────────────────────────────────────────────*/
function RankRankingRow({
  student,
  metric,
  isYou,
}: {
  student: RankingStudent
  metric: RankingMetric
  isYou: boolean
}) {
  const inMedal = isMedalRank(student.rank)
  let rankTextClass = "text-muted-foreground"
  if (isYou) rankTextClass = "text-primary"
  else if (inMedal) rankTextClass = ""
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
        isYou
          ? "bg-primary/[0.06] border-primary/30 shadow-sm"
          : "bg-card border-border hover:bg-muted/40 hover:border-muted"
      }`}
    >
      <span
        className={`w-8 shrink-0 text-sm font-black tabular-nums text-right ${rankTextClass}`}
        style={!isYou && inMedal ? { color: medalStyleFor(student.rank).color } : undefined}
      >
        #{student.rank}
      </span>

      <Avatar student={student} sizeClass="h-8 w-8 text-[11px]" imgSize={64} />

      <span
        className={`flex-1 min-w-0 text-sm truncate ${
          isYou ? "font-black text-primary" : "font-semibold text-foreground"
        }`}
      >
        {cleanStudentName(student.name)}
        {isYou && (
          <Badge className="ml-2 bg-primary text-primary-foreground border-transparent text-[8px] font-black px-1.5 py-0 rounded-full align-middle">
            VOCÊ
          </Badge>
        )}
      </span>

      <span className="text-sm font-bold text-foreground min-w-[90px] flex-shrink-0 whitespace-nowrap text-right tabular-nums">
        {metricValueFor(student, metric)}
      </span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   META DA SEMANA (reutiliza a meta existente do perfil)
──────────────────────────────────────────────────────────────────────────────*/
function WeeklyGoalCard({ personal }: { personal: RankingPersonalContext | null }) {
  const goal = personal?.weeklyGoal
  const achieved = goal ? formatGoalTime(goal.achievedMinutes) : "—"
  const target = goal ? formatGoalTime(goal.targetMinutes) : "—"
  const remaining = goal ? formatGap("TEMPO", goal.remainingMinutes) : "—"
  const done = !!goal && goal.remainingMinutes <= 0 && goal.achievedMinutes > 0

  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden min-w-0">
      <div className="p-4 space-y-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-primary" /> Meta da semana
        </p>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-2xl font-black text-foreground leading-none tabular-nums">
              {target}
              {done && <span className="ml-2 text-xs font-black text-emerald-600">✓</span>}
            </p>
            <p className="text-[11px] font-semibold text-muted-foreground mt-1">
              {achieved} estudadas
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums ${
              done ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"
            }`}
          >
            {goal?.percentage ?? 0}%
          </span>
        </div>

        <ProgressBar
          value={goal?.percentage ?? 0}
          ariaLabel="Progresso da meta semanal de estudo"
        />

        <p className="text-xs font-bold text-muted-foreground">
          {done
            ? "Meta concluída! Continue para abrir vantagem."
            : `Faltam ${remaining} para bater a meta.`}
        </p>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTÂNCIA (sequência real)
──────────────────────────────────────────────────────────────────────────────*/
function ConsistencyCard({ personal }: { personal: RankingPersonalContext | null }) {
  const streak = personal?.streak
  const days = streak?.consecutiveDays ?? 0

  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden min-w-0">
      <div className="p-4 space-y-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-amber-500" /> Constância
        </p>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Flame className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black text-foreground leading-none tabular-nums">
              {days}
              <span className="text-sm font-bold text-muted-foreground ml-1">dias</span>
            </p>
            <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 truncate">
              {days > 0
                ? `Estudando há ${days} ${days === 1 ? "dia" : "dias"} seguidos`
                : "Estude hoje para iniciar sua sequência."}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] font-bold text-muted-foreground">
          Recorde:{" "}
          <span className="text-foreground font-black tabular-nums">
            {streak?.longestDays ?? 0}
          </span>{" "}
          dias
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LÍDER DA SEMANA
──────────────────────────────────────────────────────────────────────────────*/
function LeaderOfWeekCard({
  leader,
  metric,
  period,
}: {
  leader: RankingStudent
  metric: RankingMetric
  period: RankingPeriod
}) {
  const suffix = period === "this_week" ? "esta semana" : "no período"
  let phrase = `É o aluno que mais estudou ${suffix}.`
  if (metric === "QUESTOES") phrase = `É o aluno que mais respondeu questões ${suffix}.`
  if (metric === "PAGINAS") phrase = `É o aluno que mais leu ${suffix}.`

  return (
    <section className="relative rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] to-card shadow-sm overflow-hidden min-w-0">
      <div className="p-4 space-y-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
          <Crown className="h-4 w-4" /> Líder {period === "this_week" ? "da semana" : "do período"}
        </p>

        <div className="flex items-center gap-3">
          <Avatar
            student={leader}
            sizeClass="h-11 w-11 text-sm border-2 border-amber-400/60 shadow-md"
            imgSize={88}
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-foreground truncate">
              {cleanStudentName(leader.name)}
            </p>
            <p className="text-xs font-black text-amber-600 tabular-nums">
              {metricValueFor(leader, metric)}
            </p>
          </div>
          <span className="text-2xl leading-none" aria-hidden>
            👑
          </span>
        </div>

        <p className="text-xs font-semibold text-muted-foreground leading-snug">{phrase}</p>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   VENCEDORES DAS SEMANAS ANTERIORES (dados reais, compacto)
──────────────────────────────────────────────────────────────────────────────*/
interface WeekWinners {
  offset: number
  rangeLabel: string
  podium: RankingStudent[]
  list: RankingStudent[]
}

function WeeklyWinnersCard() {
  const [weeks, setWeeks] = useState<Record<number, WeekWinners>>({})
  const [navOffset, setNavOffset] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWeek = async (offset: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGlobalRankingAction("this_week", -offset)
      if (res?.error) {
        setError(res.error)
        return
      }
      const ranking = (res?.data as GlobalRankingData | undefined)?.rankingTempo ?? []
      setWeeks((prev) => ({
        ...prev,
        [offset]: {
          offset,
          rangeLabel: formatWeekRange(-offset),
          podium: ranking.slice(0, 3),
          list: ranking.slice(3, 7),
        },
      }))
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function initWeek() {
      try {
        const res = await getGlobalRankingAction("this_week", -1)
        if (cancelled || res?.error) return
        const ranking = (res?.data as GlobalRankingData | undefined)?.rankingTempo ?? []
        setWeeks({
          1: {
            offset: 1,
            rangeLabel: formatWeekRange(-1),
            podium: ranking.slice(0, 3),
            list: ranking.slice(3, 7),
          },
        })
      } catch (err: unknown) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    initWeek()

    return () => {
      cancelled = true
    }
  }, [])

  const current = weeks[navOffset]
  const showRight = navOffset > 1

  const goOlder = () => {
    const next = navOffset + 1
    setNavOffset(next)
    if (!weeks[next]) loadWeek(next)
  }

  const goNewer = () => {
    if (navOffset <= 1) return
    setNavOffset(navOffset - 1)
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden min-w-0">
      <div className="p-4 space-y-3">
        <div className="relative">
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground pr-24 leading-none">
            Vencedores anteriores
          </p>

          <button
            onClick={goOlder}
            disabled={loading}
            aria-label="Semana anterior"
            className={`absolute top-0 right-8 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} rounded-md`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="absolute top-0.5 right-0 text-[11px] font-bold text-primary/70 whitespace-nowrap">
            {current?.rangeLabel ?? "—"}
          </span>

          <button
            onClick={goNewer}
            disabled={!showRight || loading}
            aria-label="Semana mais recente"
            className={`absolute top-0 right-14 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} rounded-md`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading && !current && (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-9 rounded-lg" />
            ))}
          </div>
        )}

        {error && !loading && !current && (
          <div className="p-3.5 rounded-xl bg-destructive/5 border border-destructive/20 text-[11px] font-bold text-destructive">
            Falha ao carregar vencedores: {error}
          </div>
        )}

        {current && (current.podium.length > 0 || current.list.length > 0) && (
          <>
            <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-1.5 items-end">
              {[current.podium[1], current.podium[0], current.podium[2]].map((student, index) =>
                student ? (
                  <PodiumStep key={`${student.id}-${index}`} student={student} />
                ) : (
                  <div key={index} className="h-[92px] rounded-t-xl bg-muted/40" />
                ),
              )}
            </div>

            <div className="space-y-1" aria-label="Demais colocados da semana">
              {current.list.map((student) => (
                <div
                  key={student.id || student.rank}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] hover:bg-primary/5 transition-colors"
                >
                  <span className="w-6 shrink-0 font-extrabold text-muted-foreground text-center text-xs">
                    {student.rank}º
                  </span>
                  <Avatar student={student} sizeClass="h-6 w-6 text-[9px]" imgSize={48} />
                  <span className="flex-1 min-w-0 font-semibold text-primary truncate">
                    {cleanStudentName(student.name)}
                  </span>
                  <span className="text-[11px] font-bold text-primary/80 tabular-nums whitespace-nowrap">
                    {student.hours}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {current && current.podium.length === 0 && current.list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-1.5">
            <Crown className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-sm font-bold text-foreground">Sem registros nesta semana</p>
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Não houve registros suficientes nesta semana ({current.rangeLabel}).
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function PodiumStep({ student }: { student: RankingStudent }) {
  const isGold = student.rank === 1
  const heightClass = podiumHeightClass(student.rank)
  const gradient = podiumGradientFor(student.rank)
  return (
    <div
      className={`relative px-1.5 pt-6 pb-3 text-center text-white rounded-t-xl min-w-0 ${heightClass}`}
      style={{ background: gradient }}
    >
      {isGold && (
        <Crown
          className="absolute top-[-36px] left-1/2 -translate-x-1/2 h-[16px] w-[16px]"
          style={{ color: "#FFB200", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}
        />
      )}
      <div className="absolute top-[-20px] left-1/2 -translate-x-1/2">
        <Avatar
          student={student}
          sizeClass="h-10 w-10 text-xs border-[3px] border-white shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
          imgSize={80}
        />
      </div>
      <span className="absolute top-1 right-1.5 text-lg font-black text-white/75 leading-none">
        {student.rank}º
      </span>
      <span className="block mt-1 text-[13px] font-bold leading-[1.3] truncate">
        {cleanStudentName(student.name)}
      </span>
      <span className="block text-[11px] font-semibold opacity-95">{student.hours}</span>
    </div>
  )
}

function podiumHeightClass(rank: number): string {
  if (rank === 1) return "h-[110px]"
  if (rank === 2) return "h-[92px]"
  return "h-[86px]"
}

function podiumGradientFor(rank: number): string {
  if (rank === 1) return "linear-gradient(180deg, #3B82F6 0%, #1E40AF 100%)"
  if (rank === 2) return "linear-gradient(180deg, #7FA8F5 0%, #2563EB 100%)"
  return "linear-gradient(180deg, #1E40AF 0%, #12215C 100%)"
}

function ordinalLabelFor(rank: number): string {
  if (rank === 1) return "1º lugar"
  if (rank === 2) return "2º lugar"
  return "3º lugar"
}

/* ─────────────────────────────────────────────────────────────────────────────
   SKELETON / ERRO
──────────────────────────────────────────────────────────────────────────────*/
function RankingSkeleton() {
  return (
    <div className="space-y-4 pb-16" aria-busy="true" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="skeleton h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-36" />
            <div className="skeleton h-3 w-60 max-w-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-[170px] rounded-lg" />
          <div className="skeleton h-9 w-[170px] rounded-lg" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {[0, 1].map((item) => (
            <div key={item} className="skeleton h-8 w-40 rounded-full" />
          ))}
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton h-8 w-32 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card shadow-sm">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="px-4 py-3.5">
            <div className="skeleton h-3 w-16 mx-auto" />
            <div className="skeleton h-5 w-20 mx-auto mt-2" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[6fr_4fr] gap-4">
        <div className="skeleton h-52 rounded-2xl" />
        <div className="skeleton h-52 rounded-2xl" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="skeleton h-56 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] items-start gap-4">
        <div className="rounded-xl border border-border bg-card shadow-sm space-y-1.5 p-4">
          <div className="skeleton h-4 w-40 mb-2" />
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="skeleton h-36 rounded-xl" />
          <div className="skeleton h-28 rounded-xl" />
          <div className="skeleton h-32 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function RankingErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-black text-foreground">Não foi possível carregar o ranking</h2>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors ${FOCUS_RING}`}
      >
        <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
      </button>
    </div>
  )
}
