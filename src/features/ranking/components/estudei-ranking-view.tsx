"use client"

import { useState, useEffect, useMemo, type ReactNode } from "react"
import {
  Trophy,
  Users,
  Timer,
  ListChecks,
  BookOpen,
  Crown,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCw,
  Bug,
  Loader2,
  HelpCircle,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { getGlobalRankingAction, testGlobalRankingRpc } from "@/application/study-analytics/study-analytics.actions"
import { toast } from "sonner"

export interface RankingStudent {
  rank: number
  id: string
  name: string
  avatar: string
  targetContest: string
  hours: string
  questions: number
  pages: number
  initials: string
  bgColor: string
  hasActivity: boolean
}

type RankingPeriod = "this_week" | "last_week" | "general"
type RankingMetric = "TEMPO" | "QUESTOES" | "PAGINAS"
type MetricKey = "tempo" | "questoes" | "paginas"

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

const METRIC_KEY: Record<RankingMetric, MetricKey> = {
  TEMPO: "tempo",
  QUESTOES: "questoes",
  PAGINAS: "paginas",
}

const PERIOD_LABEL: Record<RankingPeriod, string> = {
  this_week: "Esta semana",
  last_week: "Semana passada",
  general: "Geral",
}

const PERIODS: RankingPeriod[] = ["this_week", "last_week", "general"]

const METRICS: { id: RankingMetric; label: string; icon: LucideIcon }[] = [
  { id: "TEMPO", label: "Tempo de estudo", icon: Timer },
  { id: "QUESTOES", label: "Questões", icon: ListChecks },
  { id: "PAGINAS", label: "Páginas", icon: BookOpen },
]

const PODIUM_POSITION_LABEL: Record<number, string> = {
  1: "1º lugar",
  2: "2º lugar",
  3: "3º lugar",
}

const PODIUM_ORDER_CLASSES = ["sm:order-1", "sm:order-2", "sm:order-3"]

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

const CARD_DELAYS = ["", "delay-75", "delay-150", "delay-200"]

function cleanStudentName(name: string): string {
  return name.replace(/\s*\(Você\)\s*$/i, "")
}

// Key estável e sempre string, independente da shape devolvida pela RPC
// (alguns retornos não incluem "id"; "rank" é sempre único por lista).
function studentKeyFor(student: RankingStudent): string {
  return student.id ? `student-${student.id}` : `position-${student.rank}`
}

// Identifica o usuário logado: por id quando a RPC devolve o campo,
// ou pelo marcador "(Você)" que o servidor anexa ao nome.
function isCurrentUserStudent(student: RankingStudent, currentUserId: string | null): boolean {
  if (currentUserId && student.id === currentUserId) return true
  return /\(você\)$/i.test(student.name)
}

function metricActivityLabelFor(metric: RankingMetric): string {
  if (metric === "TEMPO") return "tempo de estudo"
  if (metric === "QUESTOES") return "questões"
  return "páginas lidas"
}

function periodFallbackCaption(period: RankingPeriod): string {
  if (period === "this_week") return "sua posição atual"
  if (period === "last_week") return "na semana passada"
  return "no histórico geral"
}

function periodActivitySuffix(period: RankingPeriod): string {
  if (period === "general") return "no histórico"
  if (period === "last_week") return "na semana passada"
  return "nesta semana"
}

function medalBadgeClassFor(student: RankingStudent): string {
  if (student.rank === 1) return "bg-amber-400"
  if (student.rank === 2) return "bg-slate-300"
  return "bg-amber-700"
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function metricValueFor(student: RankingStudent, metric: RankingMetric): string {
  if (metric === "TEMPO") return student.hours
  if (metric === "QUESTOES") return `${student.questions} q.`
  return `${student.pages} pág.`
}

function podiumValueFor(student: RankingStudent, metric: RankingMetric): string {
  if (metric === "TEMPO") return student.hours
  if (metric === "QUESTOES") return `${student.questions} questões`
  return `${student.pages} páginas`
}

function listAuxFor(student: RankingStudent, metric: RankingMetric): string {
  if (metric === "TEMPO") return `${student.questions} questões · ${student.pages} páginas`
  return `${student.hours} de estudo`
}

export function EstudeiRankingView() {
  const [activeTab, setActiveTab] = useState<RankingMetric>("TEMPO")
  const [period, setPeriod] = useState<RankingPeriod>("this_week")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [data, setData] = useState<GlobalRankingData | null>(null)
  const [prevWeekRanks, setPrevWeekRanks] = useState<Record<MetricKey, number | null> | null>(null)

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

    // Apenas em "Esta semana": posição na semana passada (leitura, dados reais)
    // usada exclusivamente para o comparativo do card "Minha Posição".
    async function loadPreviousWeek() {
      if (period !== "this_week") {
        setPrevWeekRanks(null)
        return
      }
      try {
        const res = await getGlobalRankingAction("last_week")
        if (cancelled) return
        const prev = res?.data?.userStats as GlobalRankingData["userStats"] | undefined
        setPrevWeekRanks({
          tempo: prev?.tempo?.rank ?? null,
          questoes: prev?.questoes?.rank ?? null,
          paginas: prev?.paginas?.rank ?? null,
        })
      } catch {
        if (!cancelled) setPrevWeekRanks(null)
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

  const rankedStudents = useMemo(
    () => currentRanking.filter((student) => student.hasActivity !== false),
    [currentRanking],
  )

  const top3 = useMemo(() => rankedStudents.slice(0, 3), [rankedStudents])
  const others = useMemo(() => rankedStudents.slice(3), [rankedStudents])

  const positionDelta = useMemo(() => {
    const current = currentUserStats?.rank
    const previous = prevWeekRanks?.[METRIC_KEY[activeTab]]
    if (typeof current !== "number" || typeof previous !== "number") return null
    return previous - current
  }, [currentUserStats, prevWeekRanks, activeTab])

  const isCurrentUserId = currentUserStats?.id ?? null

  const metricActivityLabel = metricActivityLabelFor(activeTab)

  let positionCaption: ReactNode = (
    <span className="text-[11px] font-bold text-muted-foreground">{periodFallbackCaption(period)}</span>
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
          <Minus className="h-3.5 w-3.5" /> posição mantida
        </span>
      )
    }
  }

  if (loading && !data) return <RankingSkeleton />

  if (error && !data) {
    return <RankingErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
  }

  const rankDisplay = currentUserStats ? `#${currentUserStats.rank}` : "—"

  return (
    <div className="space-y-6 pb-20">
      {/* Cabeçalho */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Ranking Global</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compare seu desempenho com todos os estudantes do Mentor IA.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-muted border rounded-xl shadow-sm">
            {PERIODS.map((option) => (
              <button
                key={option}
                onClick={() => setPeriod(option)}
                className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                  period === option
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABEL[option]}
              </button>
            ))}
          </div>

          <button
            onClick={async () => {
              setDebugInfo("Testando RPC...")
              const res = await testGlobalRankingRpc()
              setDebugInfo(res.success ? "OK - veja console do servidor" : `Erro: ${res.error}`)
            }}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-amber-600 hover:bg-amber-50 border border-amber-200/70 transition-colors"
            title="Testar RPC do Ranking"
          >
            <Bug className="h-3.5 w-3.5" /> Debug RPC
          </button>
        </div>
      </header>

      {debugInfo && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-mono animate-fade-in">
          <span className="font-bold">Debug RPC: </span> {debugInfo}
        </div>
      )}

      {loading && data && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-primary animate-fade-in">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando ranking...
        </div>
      )}

      <main
        className={`space-y-6 transition-opacity duration-300 ${
          loading && data ? "opacity-70" : "opacity-100"
        }`}
      >
        {/* Cards de resumo */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard
            label="Minha Posição"
            value={rankDisplay}
            caption={positionCaption}
            icon={Trophy}
            iconClass="bg-primary/10 text-primary"
            delay={0}
          />
          <SummaryCard
            label="Participantes"
            value={data?.totalParticipants ?? 0}
            caption={<span className="text-[11px] font-bold text-muted-foreground">alunos ativos</span>}
            icon={Users}
            iconClass="bg-sky-500/10 text-sky-500"
            delay={1}
          />
          <SummaryCard
            label="Estudado"
            value={currentUserStats?.hours || "0min"}
            caption={
              <span className="text-[11px] font-bold text-muted-foreground">{PERIOD_LABEL[period].toLowerCase()}</span>
            }
            icon={Timer}
            iconClass="bg-emerald-500/10 text-emerald-500"
            delay={2}
          />
          <SummaryCard
            label="Questões"
            value={currentUserStats?.questions ?? 0}
            caption={<span className="text-[11px] font-bold text-muted-foreground">respondidas</span>}
            icon={ListChecks}
            iconClass="bg-violet-500/10 text-violet-500"
            delay={3}
          />
        </section>

        {/* Ranking */}
        <section className="rounded-3xl border bg-card shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b bg-muted/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black uppercase tracking-tighter">Classificação</h2>
                  <Badge
                    variant="outline"
                    className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold"
                  >
                    TEMPO REAL
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {period === "this_week" && "Resultados parciais da semana atual (Segunda a Domingo)."}
                  {period === "last_week" && "Consolidado da semana passada."}
                  {period === "general" && "Ranking histórico desde o início."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-xl border shadow-sm w-fit">
                {METRICS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-lg transition-all duration-200 ${
                      activeTab === id
                        ? "bg-background text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 md:p-8">
            {error && (
              <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-destructive/5 border border-destructive/20 animate-fade-in">
                <div className="flex items-center gap-3 text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-xs font-bold">Falha ao atualizar o ranking: {error}</p>
                </div>
                <button
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-bold hover:opacity-90 transition-opacity"
                >
                  <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
                </button>
              </div>
            )}

            {/* Aviso para usuário sem atividade na métrica atual */}
            {data && (!currentUserStats || !currentUserStats.hasActivity) && (
              <div className="mb-8 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left animate-fade-in">
                <div className="flex items-center gap-3 text-amber-600">
                  <HelpCircle className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-bold">
                    Você ainda não registrou {metricActivityLabel}{" "}
                    {periodActivitySuffix(period)}.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Comece a estudar hoje mesmo para aparecer no ranking global e ganhar seu lugar no pódio!
                </p>
              </div>
            )}

            {/* Pódio dos 3 primeiros */}
            {top3.length > 0 ? (
              <div
                key={`podium-${activeTab}`}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-10 animate-fade-in-up"
              >
                {[top3[1], top3[0], top3[2]].map((student, index) =>
                  student ? (
                    <PodiumCard
                      key={studentKeyFor(student)}
                      student={student}
                      metric={activeTab}
                      isYou={isCurrentUserStudent(student, isCurrentUserId)}
                      orderClass={PODIUM_ORDER_CLASSES[index] ?? ""}
                    />
                  ) : null,
                )}
              </div>
            ) : (
              !loading && (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 bg-muted/20 rounded-3xl border border-dashed animate-fade-in">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground">Sem participantes ainda</h3>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Nenhum aluno registrou atividades para os critérios selecionados neste período.
                    </p>
                  </div>
                </div>
              )
            )}

            {/* Lista completa */}
            {others.length > 0 && (
              <div key={`list-${activeTab}`} className="space-y-3 animate-fade-in-up">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                    Todos os participantes
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {data?.totalParticipants ?? 0} alunos
                  </span>
                </div>

                <div className="hidden sm:grid grid-cols-[3.5rem_1fr_auto] gap-3 px-4 py-2 text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                  <span>Pos.</span>
                  <span>Estudante</span>
                  <span className="text-right">Desempenho</span>
                </div>

                <div className="lg:max-h-[560px] lg:overflow-y-auto lg:pr-1 space-y-2">
                  {others.map((student, index) => (
                    <RankingRow
                      key={studentKeyFor(student)}
                      student={student}
                      metric={activeTab}
                      isYou={isCurrentUserStudent(student, isCurrentUserId)}
                      delay={index}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

/* ─────────────────────────────────────────
   Componentes visuais auxiliares
───────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  caption,
  icon: Icon,
  iconClass,
  delay,
}: {
  label: string
  value: ReactNode
  caption: ReactNode
  icon: LucideIcon
  iconClass: string
  delay: number
}) {
  return (
    <div
      className={`rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all animate-fade-in-up ${
        CARD_DELAYS[delay] ?? ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <span className="block text-[10px] font-extrabold uppercase text-muted-foreground tracking-widest">
            {label}
          </span>
          <span className="block text-3xl font-black text-foreground tracking-tight tabular-nums">{value}</span>
          <div className="min-h-4">{caption}</div>
        </div>
        <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${iconClass}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  )
}

function PodiumCard({
  student,
  metric,
  isYou,
  orderClass,
}: {
  student: RankingStudent
  metric: RankingMetric
  isYou: boolean
  orderClass: string
}) {
  const isFirst = student.rank === 1
  return (
    <div
      className={`relative flex flex-col items-center text-center p-6 rounded-3xl border transition-all duration-300 hover:-translate-y-1 ${
        isFirst
          ? "bg-gradient-to-b from-primary/[0.08] to-card border-primary/30 shadow-md sm:pt-10"
          : "bg-card border-border shadow-sm"
      } ${orderClass}`}
    >
      {isFirst && <Crown className="absolute top-4 left-1/2 -translate-x-1/2 h-5 w-5 text-amber-500" />}

      <div className="relative mb-5">
        <div
          className={`flex items-center justify-center text-white font-black ring-4 ring-background shadow-lg rounded-full ${student.bgColor} ${
            isFirst ? "w-24 h-24 text-3xl" : "w-20 h-20 text-2xl"
          }`}
        >
          {student.avatar ? (
            <Image
              src={student.avatar}
              alt={student.name}
              width={96}
              height={96}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            student.initials
          )}
        </div>
        <div
          className={`absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-full flex items-center justify-center text-base border-4 border-background shadow-md ${medalBadgeClassFor(student)}`}
        >
          {MEDALS[student.rank] ?? student.rank}
        </div>
      </div>

      <span className="text-base font-black text-foreground line-clamp-1 max-w-full">
        {cleanStudentName(student.name)}
      </span>
      <span
        className={`mt-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] ${
          isFirst ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {PODIUM_POSITION_LABEL[student.rank] ?? `${student.rank}º lugar`}
      </span>

      {isYou && (
        <Badge className="mt-2 bg-primary text-primary-foreground border-transparent text-[9px] font-black px-2 py-0.5 rounded-full">
          VOCÊ
        </Badge>
      )}

      <div
        className={`mt-4 font-mono font-black rounded-full px-4 py-2 text-sm ${
          isFirst ? "bg-primary text-white" : "bg-muted text-foreground"
        }`}
      >
        {podiumValueFor(student, metric)}
      </div>
    </div>
  )
}

function RankingRow({
  student,
  metric,
  isYou,
  delay,
}: {
  student: RankingStudent
  metric: RankingMetric
  isYou: boolean
  delay: number
}) {
  return (
    <div
      className={`group grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 animate-fade-in-up ${
        isYou
          ? "bg-primary/[0.06] border-primary/30 shadow-sm"
          : "bg-card border-border hover:bg-muted/40 hover:border-muted"
      }`}
      style={{ animationDelay: `${Math.min(delay, 12) * 40}ms` }}
    >
      <span
        className={`text-sm font-black tabular-nums ${
          isYou ? "text-primary" : "text-muted-foreground group-hover:text-primary transition-colors"
        }`}
      >
        #{student.rank}
      </span>

      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm ${student.bgColor}`}
        >
          {student.avatar ? (
            <Image
              src={student.avatar}
              alt={student.name}
              width={36}
              height={36}
              className="w-full h-full rounded-xl object-cover"
            />
          ) : (
            student.initials
          )}
        </div>
        <div className="min-w-0">
          <span className="block font-bold text-sm text-foreground truncate leading-tight">
            {cleanStudentName(student.name)}
          </span>
          {isYou ? (
            <Badge className="mt-1 bg-primary/10 text-primary border-primary/20 text-[9px] font-black rounded-full">
              VOCÊ
            </Badge>
          ) : (
            <span className="block text-[10px] text-muted-foreground/70 font-semibold uppercase tracking-wide truncate">
              {listAuxFor(student, metric)}
            </span>
          )}
        </div>
      </div>

      <span className="text-sm font-black font-mono tabular-nums text-right text-foreground">
        {metricValueFor(student, metric)}
      </span>
    </div>
  )
}

function RankingSkeleton() {
  return (
    <div className="space-y-6 pb-20" aria-busy="true" role="status">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="skeleton h-11 w-11 rounded-2xl" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-44" />
            <div className="skeleton h-3.5 w-64 max-w-full" />
          </div>
        </div>
        <div className="skeleton h-10 w-72 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton h-[120px] rounded-2xl" />
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-56" />
          </div>
          <div className="skeleton h-10 w-64 rounded-xl" />
        </div>
        <div className="p-6 md:p-8 space-y-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex flex-col items-center gap-3">
                <div className={`skeleton ${item === 1 ? "h-24 w-24" : "h-20 w-20"} rounded-full`} />
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-9 w-24 rounded-full" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="skeleton h-14 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function RankingErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-black text-foreground">Não foi possível carregar o ranking</h2>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
      >
        <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
      </button>
    </div>
  )
}