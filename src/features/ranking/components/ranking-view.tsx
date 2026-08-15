"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"

import Image from "next/image"

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Crown,
  Eye,
  Flame,
  ListChecks,
  Loader2,
  type LucideIcon,
  Medal,
  Minus,
  RotateCw,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  type RankingPersonalContext,
  getGlobalRankingAction,
  getRankingPersonalContextAction,
} from "@/application/study-analytics/study-analytics.actions"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { PublicStudyProfileModal } from "./public-study-profile-modal"

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
   VIEW PRINCIPAL DO RANKING
──────────────────────────────────────────────────────────────────────────────*/
export function RankingView() {
  const [activeTab, setActiveTab] = useState<RankingMetric>("TEMPO")
  const [period, setPeriod] = useState<RankingPeriod>("this_week")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<GlobalRankingData | null>(null)
  const [prevWeekData, setPrevWeekData] = useState<GlobalRankingData | null>(null)
  const [personal, setPersonal] = useState<RankingPersonalContext | null>(null)
  const [selectedProfileStudent, setSelectedProfileStudent] = useState<RankingStudent | null>(null)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  const handleOpenProfile = (student: RankingStudent) => {
    if (!student?.id) return
    setSelectedProfileStudent(student)
    setIsProfileModalOpen(true)
  }

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

    // Semana anterior: usado no comparativo de posições
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

  // Meta semanal + constância
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

  const myIndex = useMemo(
    () =>
      rankedStudents.findIndex((student) =>
        isCurrentUserStudent(student, currentUserStats?.id ?? null),
      ),
    [rankedStudents, currentUserStats],
  )

  const above = myIndex > 0 ? (rankedStudents[myIndex - 1] ?? null) : null
  const below = myIndex >= 0 ? (rankedStudents[myIndex + 1] ?? null) : null

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
    <span className="text-xs font-semibold text-muted-foreground">Ranking Geral</span>
  )
  if (positionDelta !== null) {
    if (positionDelta > 0) {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <TrendingUp className="h-3.5 w-3.5" />
          Subiu {positionDelta} {positionDelta === 1 ? "posição" : "posições"}
        </span>
      )
    } else if (positionDelta < 0) {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
          <TrendingDown className="h-3.5 w-3.5" />
          Caiu {Math.abs(positionDelta)} {Math.abs(positionDelta) === 1 ? "posição" : "posições"}
        </span>
      )
    } else {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border">
          <Minus className="h-3.5 w-3.5" /> Manteve posição
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
  const isOnlyParticipant = totalParticipants <= 1 && rankedStudents.length === 1 && myIndex >= 0

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* ── CABEÇALHO & FILTROS ────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card/60 backdrop-blur-md p-5 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-amber-500/20 to-primary/20 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
            <Trophy className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Ranking de Estudantes
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                <Users className="h-3 w-3" /> {totalParticipants} alunos
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Acompanhe sua evolução e dispute o topo com a comunidade de concurseiros.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <Select value="global" onValueChange={() => undefined}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl border bg-background text-xs font-bold shadow-sm hover:border-primary/50 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Ranking Global</SelectItem>
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={(value) => setPeriod(value as RankingPeriod)}>
            <SelectTrigger className="h-10 w-[160px] rounded-xl border bg-background text-xs font-bold shadow-sm hover:border-primary/50 transition-colors">
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

      {/* ── BARRA DE STATUS + SELETOR DE MÉTRICA ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/40 p-2.5 rounded-2xl border shadow-xs">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <div className="flex items-center gap-2 rounded-xl bg-background/80 border px-3 py-1.5 shadow-2xs">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              {periodInfo.label}
            </span>
            <span className="text-xs text-muted-foreground">({periodInfo.range})</span>
          </div>
          {period === "this_week" && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
              <Flame className="h-4 w-4 text-amber-500 animate-pulse" />
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Em andamento
              </span>
            </div>
          )}
          {loading && data && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary animate-fade-in pl-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando...
            </div>
          )}
        </div>

        {/* Abas de métricas */}
        <div
          role="group"
          aria-label="Métrica do ranking"
          className="flex items-center gap-1.5 p-1 bg-background/80 rounded-xl border shadow-2xs"
        >
          {METRICS.map(({ id, label, icon: MetricIcon }) => {
            const selected = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-pressed={selected}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all duration-200 ${FOCUS_RING} ${
                  selected
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <MetricIcon
                  className={`h-4 w-4 ${selected ? "text-primary-foreground" : "text-muted-foreground"}`}
                />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── CARDS DE RESUMO DO SEU DESEMPENHO (4 CARDS MODERNOS) ───────────── */}
      <section
        key={`band-${activeTab}`}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in"
        aria-label="Resumo das suas métricas"
      >
        <MetricSummaryCard
          icon={Timer}
          iconColor="text-blue-500 bg-blue-500/10 border-blue-500/20"
          label="Tempo Estudado"
          value={data?.userStats.tempo?.hours || "0min"}
          caption="no período selecionado"
          highlight={activeTab === "TEMPO"}
        />
        <MetricSummaryCard
          icon={ListChecks}
          iconColor="text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
          label="Questões Feitas"
          value={data?.userStats.tempo?.questions ?? 0}
          caption="questões resolvidas"
          highlight={activeTab === "QUESTOES"}
        />
        <MetricSummaryCard
          icon={BookOpen}
          iconColor="text-purple-500 bg-purple-500/10 border-purple-500/20"
          label="Páginas Lidas"
          value={data?.userStats.tempo?.pages ?? 0}
          caption="páginas concluídas"
          highlight={activeTab === "PAGINAS"}
        />
        <MetricSummaryCard
          icon={Flame}
          iconColor="text-amber-500 bg-amber-500/10 border-amber-500/20"
          label="Sequência Atual"
          value={`${personal?.streak.consecutiveDays ?? 0} dias`}
          caption={`Recorde: ${personal?.streak.longestDays ?? 0} dias`}
          highlight={false}
        />
      </section>

      {/* ── ÁREA DE BATALHA: SUA POSIÇÃO & PRÓXIMO ALVO ─────────────────────── */}
      <section
        key={`duel-${activeTab}`}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in"
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

      {/* ── AVISOS E FEEDBACKS ─────────────────────────────────────────────── */}
      {data &&
        rankedStudents.length > 0 &&
        (!currentUserStats || !currentUserStats.hasActivity) && (
          <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 animate-fade-in">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs sm:text-sm font-semibold leading-relaxed">
              Você ainda não registrou {metricLabelFor(activeTab).toLowerCase()} no período
              selecionado. Estude hoje para pontuar e subir no ranking!
            </p>
          </div>
        )}

      {/* ── PÓDIO TOP 3 GLORIOSO ───────────────────────────────────────────── */}
      {top3.length > 0 && (
        <section key={`podium-${activeTab}-${period}`} className="animate-fade-in space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" /> Pódio dos Campeões
            </h2>
            <span className="text-xs text-muted-foreground font-medium">
              Top 3 melhores desempenhos
            </span>
          </div>

          <div className="bg-gradient-to-b from-card/80 to-card border rounded-3xl p-4 sm:p-6 shadow-sm">
            <div className="grid grid-cols-3 gap-2 sm:gap-6 items-end max-w-3xl mx-auto pt-4 pb-2">
              {/* 2º Lugar */}
              <PodiumPedestal
                rank={2}
                student={top3[1] ?? null}
                metric={activeTab}
                isYou={top3[1] ? isCurrentUserStudent(top3[1], isCurrentUserId) : false}
                onSelect={handleOpenProfile}
              />
              {/* 1º Lugar (Centro, mais alto) */}
              <PodiumPedestal
                rank={1}
                student={top3[0] ?? null}
                metric={activeTab}
                isYou={top3[0] ? isCurrentUserStudent(top3[0], isCurrentUserId) : false}
                onSelect={handleOpenProfile}
              />
              {/* 3º Lugar */}
              <PodiumPedestal
                rank={3}
                student={top3[2] ?? null}
                metric={activeTab}
                isYou={top3[2] ? isCurrentUserStudent(top3[2], isCurrentUserId) : false}
                onSelect={handleOpenProfile}
              />
            </div>
          </div>
        </section>
      )}

      {/* ── GRID PRINCIPAL: LISTA GERAL + SIDEBAR ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: LISTA COMPLETA DE PARTICIPANTES (8 cols) */}
        <section className="lg:col-span-8 rounded-3xl border bg-card shadow-sm overflow-hidden min-w-0">
          <div className="px-5 py-4 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" /> Classificação Geral
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Todos os alunos participantes ordenados por{" "}
                {metricLabelFor(activeTab).toLowerCase()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                {rankedStudents.length}{" "}
                {rankedStudents.length === 1 ? "aluno ativo" : "alunos ativos"}
              </span>
              {myIndex >= 0 && (
                <button
                  onClick={scrollToMyRow}
                  className={`inline-flex items-center gap-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 text-xs font-extrabold transition-colors ${FOCUS_RING}`}
                  aria-label="Ir para a minha posição na lista"
                >
                  <Crosshair className="h-3.5 w-3.5" /> Minha posição
                </button>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-2">
            {rankedStudents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                  <Users className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">Nenhum registro ainda</h3>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Seja o primeiro a estudar e garantir o topo do pódio!
                  </p>
                </div>
              </div>
            )}

            <div key={`list-${activeTab}`} className="space-y-2 animate-fade-in">
              {rankedStudents.map((student, idx) => {
                const isYou = isCurrentUserStudent(student, isCurrentUserId)
                const prevStudent = idx > 0 ? (rankedStudents[idx - 1] ?? null) : null
                const nextStudent =
                  idx < rankedStudents.length - 1 ? (rankedStudents[idx + 1] ?? null) : null

                return (
                  <div
                    key={student.id || `pos-${student.rank}`}
                    id={isYou ? "minha-posicao-ranking" : undefined}
                    className="scroll-mt-8"
                  >
                    {isYou &&
                      prevStudent &&
                      metricNumber(prevStudent, activeTab) > metricNumber(student, activeTab) && (
                        <GapLine
                          icon={<ArrowUp className="h-3.5 w-3.5" />}
                          text={`Faltam ${formatGap(
                            activeTab,
                            metricNumber(prevStudent, activeTab) - metricNumber(student, activeTab),
                          )} para ultrapassar #${prevStudent.rank} ${cleanStudentName(prevStudent.name)}`}
                        />
                      )}
                    <RankRankingRow
                      student={student}
                      metric={activeTab}
                      isYou={isYou}
                      onSelect={handleOpenProfile}
                    />
                    {isYou &&
                      nextStudent &&
                      metricNumber(student, activeTab) > metricNumber(nextStudent, activeTab) && (
                        <GapLine
                          icon={<ArrowDown className="h-3.5 w-3.5" />}
                          text={`Você tem ${formatGap(
                            activeTab,
                            metricNumber(student, activeTab) - metricNumber(nextStudent, activeTab),
                          )} de vantagem sobre #${nextStudent.rank} ${cleanStudentName(nextStudent.name)}`}
                        />
                      )}
                  </div>
                )
              })}
            </div>

            {/* Usuário fora do ranking ativo */}
            {currentUserStats && myIndex < 0 && (
              <div
                id="minha-posicao-ranking"
                className="pt-4 mt-4 border-t border-dashed border-border space-y-2 scroll-mt-8"
              >
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground px-1">
                  Sua posição atual (sem atividade no período)
                </p>
                <RankRankingRow
                  student={currentUserStats}
                  metric={activeTab}
                  isYou
                  onSelect={handleOpenProfile}
                />
              </div>
            )}
          </div>
        </section>

        {/* COLUNA DIREITA: WIDGETS DE ENGAJAMENTO (4 cols) */}
        <aside className="lg:col-span-4 space-y-5 min-w-0">
          <WeeklyGoalCard personal={personal} />
          <ConsistencyCard personal={personal} />
          {period === "this_week" && <WeeklyWinnersCard onSelectStudent={handleOpenProfile} />}
        </aside>
      </div>

      {/* Modal de Perfil Público de Estudos */}
      <PublicStudyProfileModal
        open={isProfileModalOpen}
        onOpenChange={setIsProfileModalOpen}
        userId={selectedProfileStudent?.id ?? null}
        initialName={
          selectedProfileStudent ? cleanStudentName(selectedProfileStudent.name) : undefined
        }
        initialAvatar={selectedProfileStudent?.avatar}
        initialInitials={selectedProfileStudent?.initials}
        initialBgColor={selectedProfileStudent?.bgColor}
        initialRank={selectedProfileStudent?.rank}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CARD: RESUMO DE MÉTRICA INDIVIDUAL
──────────────────────────────────────────────────────────────────────────────*/
function MetricSummaryCard({
  icon: Icon,
  iconColor,
  label,
  value,
  caption,
  highlight,
}: {
  icon: LucideIcon
  iconColor: string
  label: string
  value: ReactNode
  caption: string
  highlight: boolean
}) {
  return (
    <div
      className={`relative p-4 rounded-2xl border transition-all duration-200 overflow-hidden bg-card ${
        highlight ? "border-primary/40 shadow-sm ring-1 ring-primary/20" : "hover:border-border/80"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconColor}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </span>
          <span className="block text-lg sm:text-xl font-black text-foreground tracking-tight tabular-nums truncate">
            {value}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground font-medium mt-2 truncate">{caption}</p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CARD: SUA POSIÇÃO
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
      message = "Você é o líder absoluto do Ranking Global agora!"
      goalLabel = "Continue estudando para manter sua liderança."
      progress = value > 0 ? 100 : 0
    } else if (rank === 1) {
      message = "Parabéns! Você está no topo da liderança."
      goalLabel =
        belowValue !== null && below
          ? `Vantagem de ${formatGap(metric, value - belowValue)} sobre o 2º`
          : "Defenda seu primeiro lugar"
      progress = 100
    } else if (rank === 2) {
      message =
        aboveValue !== null && aboveValue > value
          ? `Faltam apenas ${formatGap(metric, aboveValue - value)} para assumir a liderança.`
          : "Você é o 2º colocado. Falta pouco para o topo!"
      goalLabel = "Objetivo: Conquistar o 1º lugar"
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 0
    } else if (rank === 3) {
      message =
        aboveValue !== null && aboveValue > value
          ? `Faltam ${formatGap(metric, aboveValue - value)} para alcançar o 2º lugar.`
          : "Você está no pódio! Mantenha a dedicação."
      goalLabel = "Objetivo: Subir para o 2º lugar"
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 100
    } else if (rank <= 10) {
      message =
        aboveValue !== null && aboveValue > value
          ? `Você está a ${formatGap(metric, aboveValue - value)} de passar o #${above?.rank}.`
          : "Você está no TOP 10! Acelere para entrar no pódio."
      goalLabel = `Objetivo: Ultrapassar o #${above?.rank ?? rank - 1}`
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 0
    } else {
      const positionsToTop10 = rank - 10
      message = `Suba ${positionsToTop10} ${
        positionsToTop10 === 1 ? "posição" : "posições"
      } para conquistar uma vaga no TOP 10.`
      goalLabel =
        aboveValue !== null && aboveValue > value
          ? `Faltam ${formatGap(metric, aboveValue - value)} para o #${above?.rank}`
          : "Mantenha o foco nos estudos diários"
      progress =
        aboveValue !== null && aboveValue > 0
          ? Math.min(100, Math.round((value / aboveValue) * 100))
          : 0
    }
  } else if (student && !hasActivity && totalParticipants > 0) {
    message = "Cadastre suas sessões de estudo para pontuar e disputar o pódio."
    goalLabel = "Registre seu primeiro estudo do período"
  }

  return (
    <div className="relative rounded-3xl border bg-card p-6 shadow-sm overflow-hidden flex flex-col justify-between gap-5">
      <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
            <Trophy className="h-4 w-4" /> Sua Classificação
          </span>
          <div className="flex items-baseline gap-3 pt-1">
            <span className="text-4xl sm:text-5xl font-black tracking-tight text-primary leading-none tabular-nums">
              {rank > 0 ? `#${rank}` : "#--"}
            </span>
            <div>
              <p className="text-base font-black text-foreground flex items-center gap-1.5">
                {rankLabel}
                {isMedalRank(rank) && <Medal className="h-4 w-4" style={medalStyleFor(rank)} />}
              </p>
              <p className="text-xs font-bold text-muted-foreground mt-0.5 tabular-nums">
                {student ? metricValueFor(student, metric) : "0"} acumulados
              </p>
            </div>
          </div>
        </div>

        {positionCaption && <div className="shrink-0">{positionCaption}</div>}
      </div>

      <div className="space-y-2.5 pt-2 border-t border-border/60">
        <p className="text-xs sm:text-sm font-bold text-foreground leading-snug">{message}</p>

        {goalLabel && (
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary" /> {goalLabel}
            </span>
            <span className="font-bold text-foreground">{progress}%</span>
          </div>
        )}

        <ProgressBar
          value={progress}
          ariaLabel="Progresso em direção ao próximo objetivo no ranking"
        />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CARD: PRÓXIMO ALVO / DEFESA
──────────────────────────────────────────────────────────────────────────────*/
function renderAboveTargetBanner(
  above: RankingStudent | null,
  metric: RankingMetric,
  userValue: number,
  isTop1: boolean,
) {
  if (above) {
    return (
      <div className="mt-3 flex items-center gap-3.5 rounded-2xl border border-primary/20 bg-primary/[0.03] p-3.5">
        <Avatar student={above} sizeClass="h-12 w-12 text-sm shadow-sm" imgSize={96} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-primary">#{above.rank}</span>
            <p className="text-sm font-black text-foreground truncate">
              {cleanStudentName(above.name)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            {metricValueFor(above, metric)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-muted-foreground block">
            Faltam
          </span>
          <span className="text-sm font-black text-primary tabular-nums">
            {formatGap(metric, metricNumber(above, metric) - userValue)}
          </span>
        </div>
      </div>
    )
  }

  if (isTop1) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5">
        <Crown className="h-6 w-6 text-amber-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Você está no topo!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mantenha o ritmo para defender sua posição.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border bg-muted/20 p-3.5">
      <Target className="h-6 w-6 text-muted-foreground/50 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">Disputa aberta</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Estude para registrar seu tempo e definir o próximo alvo.
        </p>
      </div>
    </div>
  )
}

function renderBelowDefenseBanner(
  below: RankingStudent | null,
  belowValue: number | null,
  userValue: number,
  metric: RankingMetric,
  isOnlyParticipant: boolean,
) {
  if (below && belowValue !== null && userValue >= belowValue) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5">
        <Eye className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs font-bold text-foreground leading-snug truncate">
          Atenção:{" "}
          <span className="text-amber-600 dark:text-amber-400">{cleanStudentName(below.name)}</span>{" "}
          (#{below.rank}) está a apenas{" "}
          <span className="text-amber-600 dark:text-amber-400 tabular-nums font-black">
            {formatGap(metric, userValue - belowValue)}
          </span>{" "}
          de você.
        </p>
      </div>
    )
  }

  if (isOnlyParticipant) {
    return (
      <p className="text-xs text-muted-foreground font-semibold px-1">
        Chame outros concurseiros para medir o nível de preparação!
      </p>
    )
  }

  return (
    <p className="text-xs text-muted-foreground font-semibold px-1">
      Continue firme para garantir sua melhor colocação histórica.
    </p>
  )
}

function ProximoAlvoCard({
  student,
  metric,
  above,
  below,
  totalParticipants: _totalParticipants,
  isOnlyParticipant,
}: {
  student: RankingStudent | null
  metric: RankingMetric
  above: RankingStudent | null
  below: RankingStudent | null
  totalParticipants?: number
  isOnlyParticipant: boolean
}) {
  const isTop1 = student?.rank === 1
  const userValue = student ? metricNumber(student, metric) : 0
  const belowValue = below ? metricNumber(below, metric) : null

  return (
    <div className="relative rounded-3xl border bg-card p-6 shadow-sm overflow-hidden flex flex-col justify-between gap-5">
      <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      <div>
        <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Crosshair className="h-4 w-4 text-primary" />
          {isTop1 ? "Defesa da Liderança" : "Próximo Adversário à Frente"}
        </span>

        {renderAboveTargetBanner(above, metric, userValue, isTop1)}
      </div>

      {renderBelowDefenseBanner(below, belowValue, userValue, metric, isOnlyParticipant)}
    </div>
  )
}

function getPedestalBorderClass(rank: 1 | 2 | 3): string {
  if (rank === 1) return "border-amber-400 shadow-amber-500/20"
  if (rank === 2) return "border-slate-300 shadow-slate-400/20"
  return "border-amber-600 shadow-amber-700/20"
}

function getPedestalOrderClass(rank: 1 | 2 | 3): string {
  if (rank === 1) return "order-2"
  if (rank === 2) return "order-1"
  return "order-3"
}

function getRankMetalName(rank: 1 | 2 | 3): string {
  if (rank === 1) return "Ouro"
  if (rank === 2) return "Prata"
  return "Bronze"
}

function getRowRankBadge(rank: number) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 font-black text-xs">
        1º
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-400/20 text-slate-600 dark:text-slate-300 font-black text-xs">
        2º
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-700 dark:text-amber-400 font-black text-xs">
        3º
      </span>
    )
  }
  return <span className="text-xs font-black text-muted-foreground tabular-nums">#{rank}</span>
}

function getMetricValueClass(isYou: boolean, inMedal: boolean): string {
  if (isYou) return "bg-primary text-primary-foreground"
  if (inMedal) return "bg-muted/80 text-foreground font-extrabold"
  return "text-muted-foreground font-bold"
}

/* ─────────────────────────────────────────────────────────────────────────────
   PÓDIO: PEDESTAL MODERNO (TOP 1, 2, 3)
──────────────────────────────────────────────────────────────────────────────*/
function PodiumPedestal({
  rank,
  student,
  metric,
  isYou,
  onSelect,
}: {
  rank: 1 | 2 | 3
  student: RankingStudent | null
  metric: RankingMetric
  isYou: boolean
  onSelect?: (student: RankingStudent) => void
}) {
  const isFirst = rank === 1

  // Configurações visuais por posição
  const pedestalHeights = {
    1: "h-40 sm:h-44",
    2: "h-32 sm:h-36",
    3: "h-24 sm:h-28",
  }

  const pedestalGradients = {
    1: "bg-gradient-to-t from-amber-500/30 via-amber-500/15 to-transparent border-amber-500/40 text-amber-500",
    2: "bg-gradient-to-t from-slate-400/30 via-slate-400/15 to-transparent border-slate-400/40 text-slate-400",
    3: "bg-gradient-to-t from-amber-700/30 via-amber-700/15 to-transparent border-amber-700/40 text-amber-700",
  }

  const crownColors = {
    1: "text-amber-500 fill-amber-500",
    2: "text-slate-400 fill-slate-400",
    3: "text-amber-700 fill-amber-700",
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-end text-center">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/40 mb-3">
          <span className="text-xs font-black">{rank}º</span>
        </div>
        <div
          className={`w-full rounded-t-2xl border-t border-x border-dashed border-border/60 bg-muted/10 flex items-center justify-center ${pedestalHeights[rank]}`}
        >
          <span className="text-[11px] font-bold text-muted-foreground/60">Vago</span>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ver perfil de estudos de ${cleanStudentName(student.name)}`}
      onClick={() => onSelect?.(student)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect?.(student)
        }
      }}
      className={`flex flex-col items-center justify-end text-center transition-transform hover:-translate-y-1 duration-200 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-3xl ${getPedestalOrderClass(
        rank,
      )}`}
    >
      {/* Coroa / Medalha no topo */}
      <div className="relative mb-2 flex flex-col items-center">
        {isFirst && (
          <Crown
            className={`h-6 w-6 mb-1 filter drop-shadow-md animate-bounce ${crownColors[1]}`}
          />
        )}
        {!isFirst && <Medal className={`h-5 w-5 mb-1 ${crownColors[rank]}`} />}

        <div className="relative">
          <Avatar
            student={student}
            sizeClass={`${
              isFirst ? "h-16 w-16 sm:h-20 sm:w-20" : "h-12 w-12 sm:h-16 sm:w-16"
            } text-base font-black border-4 ${getPedestalBorderClass(rank)} shadow-lg`}
            imgSize={isFirst ? 160 : 128}
          />
          {isYou && (
            <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-background text-[9px] font-black px-2 py-0 rounded-full shadow-sm">
              VOCÊ
            </Badge>
          )}
        </div>
      </div>

      {/* Nome e Pontuação */}
      <div className="mb-2 max-w-full px-1">
        <p
          className={`font-black text-foreground truncate ${isFirst ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}
        >
          {cleanStudentName(student.name)}
        </p>
        <span
          className={`inline-block font-black tabular-nums mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] sm:text-xs ${
            isFirst
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-extrabold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {metricValueFor(student, metric)}
        </span>
      </div>

      {/* Pedestal estilizado */}
      <div
        className={`w-full rounded-t-2xl sm:rounded-t-3xl border-t border-x flex flex-col items-center justify-start pt-3 shadow-inner ${pedestalHeights[rank]} ${pedestalGradients[rank]}`}
      >
        <span className="text-2xl sm:text-4xl font-black tabular-nums tracking-tighter opacity-80">
          {rank}º
        </span>
        <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest opacity-70 mt-0.5">
          {getRankMetalName(rank)}
        </span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LINHA DA TABELA DE RANKING
──────────────────────────────────────────────────────────────────────────────*/
function RankRankingRow({
  student,
  metric,
  isYou,
  onSelect,
}: {
  student: RankingStudent
  metric: RankingMetric
  isYou: boolean
  onSelect?: (student: RankingStudent) => void
}) {
  const inMedal = isMedalRank(student.rank)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ver perfil de estudos de ${cleanStudentName(student.name)}`}
      onClick={() => onSelect?.(student)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect?.(student)
        }
      }}
      className={`flex items-center gap-3 sm:gap-4 px-4 py-3 rounded-2xl border transition-all duration-150 cursor-pointer group select-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
        isYou
          ? "bg-primary/[0.08] border-primary/40 shadow-xs ring-1 ring-primary/20 hover:bg-primary/[0.14]"
          : "bg-card/70 border-border/70 hover:bg-muted/60 hover:border-border/90 hover:shadow-xs"
      }`}
    >
      {/* Posição */}
      <div className="w-8 shrink-0 text-center">{getRowRankBadge(student.rank)}</div>

      {/* Avatar */}
      <Avatar student={student} sizeClass="h-9 w-9 text-xs font-bold shrink-0" imgSize={72} />

      {/* Nome + Identificação */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm truncate ${
              isYou ? "font-black text-primary" : "font-bold text-foreground"
            }`}
          >
            {cleanStudentName(student.name)}
          </p>
          {isYou && (
            <Badge className="bg-primary text-primary-foreground text-[9px] font-black px-1.5 py-0 rounded-md">
              VOCÊ
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {student.targetContest || "Concurseiro Focado"}
        </p>
      </div>

      {/* Valor da Métrica */}
      <div className="text-right shrink-0">
        <span
          className={`text-xs sm:text-sm font-black tabular-nums px-2.5 py-1 rounded-xl ${getMetricValueClass(
            isYou,
            inMedal,
          )}`}
        >
          {metricValueFor(student, metric)}
        </span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LINHA DE DISTÂNCIA
──────────────────────────────────────────────────────────────────────────────*/
function GapLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-[11px] font-bold text-primary bg-primary/[0.04] rounded-xl border border-dashed border-primary/20 my-1">
      {icon}
      <span>{text}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   WIDGET: META DA SEMANA
──────────────────────────────────────────────────────────────────────────────*/
function WeeklyGoalCard({ personal }: { personal: RankingPersonalContext | null }) {
  const goal = personal?.weeklyGoal
  const achieved = goal ? formatGoalTime(goal.achievedMinutes) : "0h"
  const target = goal ? formatGoalTime(goal.targetMinutes) : "20h"
  const remaining = goal ? formatGap("TEMPO", goal.remainingMinutes) : "—"
  const percentage = goal?.percentage ?? 0
  const done = !!goal && goal.remainingMinutes <= 0 && goal.achievedMinutes > 0

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Target className="h-4 w-4 text-primary" /> Meta de Estudo
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums ${
            done
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-primary/10 text-primary border border-primary/20"
          }`}
        >
          {percentage}%
        </span>
      </div>

      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-2xl sm:text-3xl font-black text-foreground leading-none tabular-nums">
            {achieved}
            <span className="text-xs text-muted-foreground font-semibold ml-1">/ {target}</span>
          </p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">
            {done ? "Meta semanal atingida!" : `Faltam ${remaining} para atingir a meta`}
          </p>
        </div>
      </div>

      <ProgressBar value={percentage} ariaLabel="Progresso da meta semanal de estudo" />
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   WIDGET: CONSTÂNCIA / DIAS SEGUIDOS
──────────────────────────────────────────────────────────────────────────────*/
function ConsistencyCard({ personal }: { personal: RankingPersonalContext | null }) {
  const streak = personal?.streak
  const days = streak?.consecutiveDays ?? 0

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
      <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Flame className="h-4 w-4 text-amber-500" /> Fogo da Constância
      </span>

      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
          <Flame className="h-6 w-6 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl sm:text-3xl font-black text-foreground leading-none tabular-nums">
            {days}{" "}
            <span className="text-sm font-bold text-muted-foreground">
              {days === 1 ? "dia" : "dias"}
            </span>
          </p>
          <p className="text-xs font-semibold text-muted-foreground mt-1 truncate">
            {days > 0 ? "Estudando consecutivamente" : "Estude hoje para começar"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border text-xs font-semibold text-muted-foreground">
        <span>Melhor sequência:</span>
        <span className="text-foreground font-black tabular-nums">
          🔥 {streak?.longestDays ?? 0} dias
        </span>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   WIDGET: VENCEDORES DAS SEMANAS ANTERIORES
──────────────────────────────────────────────────────────────────────────────*/
interface WeekData {
  offset: number
  rangeLabel: string
  podium: RankingStudent[]
  list: RankingStudent[]
}

function WeeklyWinnersCard({
  onSelectStudent,
}: {
  onSelectStudent?: (student: RankingStudent) => void
} = {}) {
  const [weeks, setWeeks] = useState<Record<number, WeekData>>({})
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
    <section className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Crown className="h-4 w-4 text-amber-500" /> Histórico de Campeões
        </span>

        {/* Navegação entre semanas */}
        <div className="flex items-center gap-1">
          <button
            onClick={goOlder}
            disabled={loading}
            aria-label="Semana anterior"
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[11px] font-bold text-muted-foreground px-1">
            {current?.rangeLabel ?? "—"}
          </span>
          <button
            onClick={goNewer}
            disabled={!showRight || loading}
            aria-label="Semana mais recente"
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && !current && (
        <div className="space-y-2 py-4">
          <div className="skeleton h-14 rounded-2xl" />
        </div>
      )}

      {!loading && error && !current && (
        <p className="text-xs text-muted-foreground italic py-2 text-center">{error}</p>
      )}

      {current && current.podium.length > 0 && (
        <div className="space-y-2">
          {/* Campeão da Semana passada */}
          {(() => {
            const champion = current.podium[0]
            if (!champion) return null
            return (
              <div
                role="button"
                tabIndex={0}
                aria-label={`Ver perfil de estudos de ${cleanStudentName(champion.name)}`}
                onClick={() => onSelectStudent?.(champion)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelectStudent?.(champion)
                  }
                }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 cursor-pointer group hover:bg-amber-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <div className="relative">
                  <Avatar
                    student={champion}
                    sizeClass="h-10 w-10 text-xs border border-amber-400"
                    imgSize={80}
                  />
                  <Crown className="absolute -top-2 -right-1 h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-extrabold uppercase text-amber-600 dark:text-amber-400 block">
                    1º Lugar da Semana
                  </span>
                  <p className="text-sm font-black text-foreground truncate group-hover:text-amber-600 transition-colors">
                    {cleanStudentName(champion.name)}
                  </p>
                </div>
                <span className="text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  {champion.hours}
                </span>
              </div>
            )
          })()}

          {/* 2º e 3º lugares */}
          {current.podium.slice(1, 3).map((student) => (
            <div
              key={student.id || student.rank}
              role="button"
              tabIndex={0}
              aria-label={`Ver perfil de estudos de ${cleanStudentName(student.name)}`}
              onClick={() => onSelectStudent?.(student)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelectStudent?.(student)
                }
              }}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/20 text-xs cursor-pointer group hover:bg-muted/40 transition-all focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="font-bold text-muted-foreground">{student.rank}º</span>
                <span className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {cleanStudentName(student.name)}
                </span>
              </div>
              <span className="font-bold text-muted-foreground tabular-nums">{student.hours}</span>
            </div>
          ))}
        </div>
      )}

      {current && current.podium.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Sem registros de campeões para {current.rangeLabel}.
        </div>
      )}
    </section>
  )
}

function ordinalLabelFor(rank: number): string {
  if (rank === 1) return "1º lugar (Líder)"
  if (rank === 2) return "2º lugar (Vice-líder)"
  return "3º lugar (Pódio)"
}

/* ─────────────────────────────────────────────────────────────────────────────
   SKELETON / ERRO
──────────────────────────────────────────────────────────────────────────────*/
function RankingSkeleton() {
  return (
    <div className="space-y-6 pb-16" aria-busy="true" role="status">
      <div className="skeleton h-24 rounded-2xl w-full" />
      <div className="skeleton h-14 rounded-2xl w-full" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="skeleton h-48 rounded-3xl" />
        <div className="skeleton h-48 rounded-3xl" />
      </div>
      <div className="skeleton h-64 rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 skeleton h-96 rounded-3xl" />
        <div className="lg:col-span-4 skeleton h-96 rounded-3xl" />
      </div>
    </div>
  )
}

function RankingErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 animate-fade-in">
      <div className="w-16 h-16 rounded-3xl bg-destructive/10 flex items-center justify-center text-destructive">
        <AlertCircle className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-black text-foreground">Não foi possível carregar o ranking</h2>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:bg-primary/90 transition-colors shadow-sm ${FOCUS_RING}`}
      >
        <RotateCw className="h-4 w-4" /> Tentar novamente
      </button>
    </div>
  )
}
