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
import { getGlobalRankingAction } from "@/application/study-analytics/study-analytics.actions"
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

const SECTION_TITLE: Record<RankingPeriod, string> = {
  today: "Ranking de Hoje",
  this_week: "Ranking Desta Semana",
  last_week: "Ranking da Semana Passada",
  this_month: "Ranking Deste Mês",
  general: "Ranking Geral",
}

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

export function EstudeiRankingView() {
  const [activeTab, setActiveTab] = useState<RankingMetric>("TEMPO")
  const [period, setPeriod] = useState<RankingPeriod>("this_week")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<GlobalRankingData | null>(null)
  const [prevWeekData, setPrevWeekData] = useState<GlobalRankingData | null>(null)

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

  const positionDelta = useMemo(() => {
    const current = currentUserStats?.rank
    const previous = prevUserStats?.rank
    if (typeof current !== "number" || typeof previous !== "number") return null
    return previous - current
  }, [currentUserStats, prevUserStats])

  const isCurrentUserId = currentUserStats?.id ?? null

  let positionCaption: ReactNode = (
    <span className="text-[11px] font-bold text-muted-foreground">Ranking Global</span>
  )
  if (positionDelta !== null) {
    if (positionDelta > 0) {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-600">
          <TrendingUp className="h-3.5 w-3.5" />
          {positionDelta} {positionDelta === 1 ? "posição" : "posições"}
        </span>
      )
    } else if (positionDelta < 0) {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-destructive">
          <TrendingDown className="h-3.5 w-3.5" />
          {Math.abs(positionDelta)} {Math.abs(positionDelta) === 1 ? "posição" : "posições"}
        </span>
      )
    } else {
      positionCaption = (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
          <Minus className="h-3.5 w-3.5" /> posição mantida
        </span>
      )
    }
  }

  if (loading && !data) return <RankingSkeleton />

  if (error && !data) {
    return <RankingErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
  }

  const rankDisplay = currentUserStats ? `#${currentUserStats.rank}` : "#--"
  const totalParticipants = data?.totalParticipants ?? 0
  const periodInfo = periodRangeFor(period)
  const isOnlyParticipant = totalParticipants <= 1 && rankedStudents.length === 1
  const isFirst = typeof currentUserStats?.rank === "number" && currentUserStats.rank === 1
  const outsideTop10 = typeof currentUserStats?.rank === "number" && currentUserStats.rank > 10

  return (
    <div className="space-y-5 pb-16">
      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight leading-none">
              Ranking
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
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
        className={`space-y-5 transition-opacity duration-300 ${
          loading && data ? "opacity-70" : "opacity-100"
        }`}
      >
        {/* Período atual */}
        <div className="flex items-center gap-2 w-fit rounded-full border bg-card px-3.5 py-1.5 shadow-sm">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-foreground">
            {periodInfo.label}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">{periodInfo.range}</span>
        </div>

        {/* Resumo */}
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <SummaryCard
            label="Tempo de estudo"
            value={data?.userStats.tempo?.hours || "0min"}
            caption="no período"
            icon={Timer}
            iconClass="bg-emerald-500/10 text-emerald-500"
          />
          <SummaryCard
            label="Questões"
            value={data?.userStats.tempo?.questions ?? 0}
            caption="respondidas"
            icon={ListChecks}
            iconClass="bg-violet-500/10 text-violet-500"
          />
          <SummaryCard
            label="Páginas lidas"
            value={data?.userStats.tempo?.pages ?? 0}
            caption="no período"
            icon={BookOpen}
            iconClass="bg-sky-500/10 text-sky-500"
          />
          <SummaryCard
            label="Sua posição"
            value={rankDisplay}
            caption={positionCaption}
            icon={Trophy}
            iconClass="bg-primary/10 text-primary"
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[13fr_7fr] items-start gap-5">
          {/* Ranking principal */}
          <section className="rounded-xl border bg-card shadow-sm overflow-hidden min-w-0">
            <div className="p-4 sm:p-5 pb-4 border-b bg-muted/30">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
                  {SECTION_TITLE[period]}
                </h2>
                <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                  {totalParticipants} aluno{totalParticipants === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Compare seu desempenho com todos os alunos do Mentor IA.
              </p>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Abas de métrica */}
              <div
                className="flex flex-wrap gap-x-7 gap-y-1 border-b border-border pb-2"
                role="group"
                aria-label="Métrica do ranking"
              >
                {METRICS.map(({ id, label }) => {
                  const selected = activeTab === id
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      aria-pressed={selected}
                      className={`pb-1.5 text-[13px] font-bold relative transition-colors ${FOCUS_RING} rounded-sm ${
                        selected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-0 left-0 h-[3px] w-full rounded-full transition-colors ${
                          selected ? "bg-primary" : "bg-transparent"
                        }`}
                      />
                    </button>
                  )
                })}
              </div>

              {/* Sua posição */}
              {currentUserStats && (
                <div
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 sm:px-5 py-3 ${
                    isFirst
                      ? "bg-amber-500/5 border-amber-500/30"
                      : "bg-primary/[0.04] border-primary/25"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[28px] sm:text-[34px] leading-none font-black text-primary tabular-nums whitespace-nowrap">
                      {rankDisplay}
                      {isMedalRank(currentUserStats.rank) && (
                        <Medal
                          className="inline h-5 w-5 ml-1.5 -mt-1"
                          style={medalStyleFor(currentUserStats.rank)}
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-wider text-foreground truncate">
                        {isFirst ? "Você está em primeiro!" : "Sua posição"}
                      </p>
                      <p className="text-[11px] font-semibold text-muted-foreground truncate">
                        Ranking Global · {metricLabelFor(activeTab)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base sm:text-lg font-black text-foreground leading-none tabular-nums">
                      {metricValueFor(currentUserStats, activeTab)}
                    </p>
                    {positionCaption && <div className="mt-1">{positionCaption}</div>}
                  </div>
                </div>
              )}

              {/* Avisos */}
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
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-muted/20 rounded-2xl border border-dashed animate-fade-in">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                      <Users className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-foreground">Ranking começando</h3>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                        Comece a estudar para aparecer no ranking.
                      </p>
                    </div>
                  </div>
                )}

                {!loading && isOnlyParticipant && rankedStudents.length === 1 && (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in">
                    <Crown className="h-5 w-5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-black text-foreground truncate">
                        #1 {cleanStudentName(rankedStudents[0]?.name ?? "Você")}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">
                        Você é o primeiro participante deste ranking.
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
                        selecionado.
                      </p>
                    </div>
                  )}
              </div>

              {/* TOP 3 */}
              {top3.length > 0 && (
                <div
                  key={`podium-${activeTab}`}
                  className="grid grid-cols-3 gap-2.5 sm:gap-3 animate-fade-in-up"
                >
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
              )}

              {/* Lista completa */}
              {others.length > 0 && (
                <div
                  key={`list-${activeTab}`}
                  className="space-y-1.5 animate-fade-in-up"
                  aria-label="Classificação completa"
                >
                  {others.map((student) => (
                    <RankRankingRow
                      key={student.id || `pos-${student.rank}`}
                      student={student}
                      metric={activeTab}
                      isYou={isCurrentUserStudent(student, isCurrentUserId)}
                    />
                  ))}
                </div>
              )}

              {/* Posição do usuário quando está fora do TOP 10 */}
              {currentUserStats && outsideTop10 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Sua posição
                  </p>
                  <RankRankingRow student={currentUserStats} metric={activeTab} isYou />
                </div>
              )}
            </div>
          </section>

          {/* Vencedores das semanas anteriores */}
          {period === "this_week" && <WeeklyWinnersCard />}
        </div>
      </main>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  caption,
  icon: Icon,
  iconClass,
}: {
  label: string
  value: ReactNode
  caption: ReactNode
  icon: LucideIcon
  iconClass: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3 min-w-0">
      <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <span className="block text-[10px] font-extrabold uppercase text-muted-foreground tracking-wider truncate">
          {label}
        </span>
        <span className="block text-xl font-black text-foreground tracking-tight tabular-nums leading-tight truncate">
          {value}
        </span>
        <div className="min-h-4 truncate">{caption}</div>
      </div>
    </div>
  )
}

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
  return (
    <div
      className={`relative flex flex-col items-center text-center px-2 pt-3.5 pb-3 rounded-xl border transition-all duration-200 ${
        isFirst
          ? "bg-gradient-to-b from-primary/[0.06] to-card border-primary/30 shadow-md"
          : "bg-card border-border shadow-sm hover:border-muted"
      }`}
    >
      {isFirst && (
        <Crown className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 text-amber-500" />
      )}
      <div className="absolute top-2 right-2">
        <Medal
          className="h-4.5 w-4.5"
          style={medalStyleFor(student.rank)}
        />
      </div>

      <div className="relative mb-2">
        <Avatar
          student={student}
          sizeClass={`${isFirst ? "h-14 w-14" : "h-11 w-11"} text-sm border-2 border-background shadow-md`}
          imgSize={isFirst ? 112 : 88}
        />
        {isYou && (
          <Badge className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-transparent text-[8px] font-black px-1.5 py-0 rounded-full whitespace-nowrap">
            VOCÊ
          </Badge>
        )}
      </div>

      <span className="text-[13px] font-black text-foreground max-w-full truncate leading-tight">
        {cleanStudentName(student.name)}
      </span>
      <span
        className={`mt-0.5 text-[10px] font-extrabold uppercase tracking-widest ${
          isFirst ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {ordinalLabelFor(student.rank)}
      </span>
      <span
        className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-black tabular-nums ${
          isFirst ? "bg-primary text-white" : "bg-muted text-foreground"
        }`}
      >
        {metricValueFor(student, metric)}
      </span>
    </div>
  )
}

function RankRankingRow({
  student,
  metric,
  isYou,
}: {
  student: RankingStudent
  metric: RankingMetric
  isYou: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
        isYou
          ? "bg-primary/[0.06] border-primary/30 shadow-sm"
          : "bg-card border-border hover:bg-muted/40 hover:border-muted"
      }`}
    >
      <span
        className={`w-8 shrink-0 text-sm font-black tabular-nums text-right ${
          isYou ? "text-primary" : "text-muted-foreground"
        }`}
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

/* ─────────────────────────────────────────
   Vencedores das semanas anteriores
   Dados reais: RPC get_global_ranking com p_week_offset (offset < 0).
   Cada semana mostra o top 7 do ranking de tempo de estudo daquela semana.
───────────────────────────────────────── */

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
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden min-w-0 h-fit">
      <div className="p-4 sm:p-5 space-y-4">
        <div className="relative">
          <p className="text-sm font-black uppercase tracking-wider text-foreground pr-28 leading-none">
            Vencedores das Semanas anteriores
          </p>

          <button
            onClick={goOlder}
            disabled={loading}
            aria-label="Semana anterior"
            className={`absolute top-0 right-9 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} rounded-md`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="absolute top-0.5 right-1 text-[11px] font-bold text-primary/70 whitespace-nowrap">
            {current?.rangeLabel ?? "—"}
          </span>

          <button
            onClick={goNewer}
            disabled={!showRight || loading}
            aria-label="Semana mais recente"
            className={`absolute top-0 right-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING} rounded-md`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading && !current && (
          <div className="space-y-2">
            <div className="skeleton h-20 rounded-xl" />
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
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <Crown className="h-7 w-7 text-muted-foreground/30" />
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
  if (rank === 1) return "h-[122px]"
  if (rank === 2) return "h-[98px]"
  return "h-[92px]"
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

function RankingSkeleton() {
  return (
    <div className="space-y-5 pb-16" aria-busy="true" role="status">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-36" />
            <div className="skeleton h-3.5 w-60 max-w-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-[170px] rounded-lg" />
          <div className="skeleton h-9 w-[170px] rounded-lg" />
        </div>
      </div>

      <div className="skeleton h-7 w-64 rounded-full" />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton h-[78px] rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[13fr_7fr] items-start gap-5">
        <div className="rounded-xl border border-border bg-card shadow-sm space-y-4 p-5">
          <div className="skeleton h-3.5 w-44" />
          <div className="flex gap-7 border-b border-border pb-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-4 w-24" />
            ))}
          </div>
          <div className="skeleton h-[60px] rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="skeleton h-[118px] rounded-xl" />
            ))}
          </div>
          <div className="space-y-1.5">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="skeleton h-9 rounded-lg" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm space-y-4 p-5">
          <div className="skeleton h-3.5 w-48" />
          <div className="skeleton h-[92px] rounded-t-xl" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton h-9 rounded-lg" />
          ))}
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