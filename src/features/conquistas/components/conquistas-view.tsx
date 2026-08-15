"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  Award,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Compass,
  Filter,
  Flame,
  Hourglass,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Medal,
  Moon,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunset,
  Target,
  TrendingUp,
  Trophy,
  UserCheck,
} from "lucide-react"

import {
  type AchievementsFacts,
  getAchievementsAction,
} from "@/application/achievements/achievements.action"
import {
  ACHIEVEMENTS_LIST,
  ACHIEVEMENT_CATEGORIES,
  type AchievementDefinition,
  type AchievementRarity,
} from "@/domain/achievements/achievements.types"
import { cn } from "@/lib/utils"

/**
 * Função utilitária de pluralização em português
 */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`
}

function formatHours(minutes: number): number {
  return Math.floor(minutes / 60)
}

function formatDateBR(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return null
  }
}

/**
 * Renderiza ícone semântico da Lucide baseado no nome
 */
function AchievementIcon({
  name,
  className,
  unlocked,
}: {
  name: string
  className?: string
  unlocked: boolean
}) {
  const iconProps = { className: cn("w-6 h-6 shrink-0 transition-transform", className) }

  switch (name) {
    case "UserCheck":
      return <UserCheck {...iconProps} />
    case "Compass":
      return <Compass {...iconProps} />
    case "CalendarDays":
      return <CalendarDays {...iconProps} />
    case "CalendarPlus":
      return <CalendarPlus {...iconProps} />
    case "CalendarCheck":
      return <CalendarCheck {...iconProps} />
    case "CalendarRange":
      return <CalendarRange {...iconProps} />
    case "Play":
      return <Play {...iconProps} className={cn(iconProps.className, "fill-current")} />
    case "CheckCircle2":
    case "CheckCircle":
      return <CheckCircle2 {...iconProps} />
    case "CheckSquare":
      return <CheckSquare {...iconProps} />
    case "RotateCcw":
      return <RotateCcw {...iconProps} />
    case "Flame":
      return (
        <Flame {...iconProps} className={cn(iconProps.className, unlocked && "fill-current")} />
      )
    case "ShieldCheck":
      return <ShieldCheck {...iconProps} />
    case "Clock":
      return <Clock {...iconProps} />
    case "Hourglass":
      return <Hourglass {...iconProps} />
    case "ListChecks":
      return <ListChecks {...iconProps} />
    case "TrendingUp":
      return <TrendingUp {...iconProps} />
    case "BrainCircuit":
      return <BrainCircuit {...iconProps} />
    case "ClipboardCheck":
      return <ClipboardCheck {...iconProps} />
    case "Target":
      return <Target {...iconProps} />
    case "Layers":
      return <Layers {...iconProps} />
    case "BookOpen":
      return <BookOpen {...iconProps} />
    case "Sun":
      return <Sun {...iconProps} />
    case "Sunset":
      return <Sunset {...iconProps} />
    case "Moon":
      return <Moon {...iconProps} />
    case "Sparkles":
      return <Sparkles {...iconProps} />
    case "Medal":
      return <Medal {...iconProps} />
    case "Trophy":
      return <Trophy {...iconProps} />
    case "Award":
    default:
      return <Award {...iconProps} />
  }
}

interface EvaluatedAchievement {
  def: AchievementDefinition
  unlocked: boolean
  progressPct: number
  currentValue: number
  progressText: string
  unlockedAtText?: string | undefined
}

function getAccuracyMinSample(id: string): number {
  switch (id) {
    case "ACCURACY_70":
      return 30
    case "ACCURACY_80":
      return 50
    case "ACCURACY_85":
      return 100
    case "ACCURACY_90":
      return 250
    case "ACCURACY_95":
      return 500
    default:
      return 30
  }
}

function getCardBackgroundClass(unlocked: boolean, progressPct: number): string {
  if (unlocked) {
    return "bg-card border-border/80 shadow-xs hover:shadow-md hover:border-primary/50"
  }
  if (progressPct > 0) {
    return "bg-card/90 border-border/60 hover:border-border"
  }
  return "bg-muted/20 border-border/40 opacity-75 hover:opacity-100"
}

function getIconContainerBg(unlocked: boolean, progressPct: number): string {
  if (unlocked) {
    return "bg-primary/10 border-primary/30 text-primary shadow-xs"
  }
  if (progressPct > 0) {
    return "bg-muted border-border/60 text-foreground"
  }
  return "bg-muted/40 border-border/30 text-muted-foreground/60"
}

function getProgressBarColor(unlocked: boolean, progressPct: number): string {
  if (unlocked) return "bg-emerald-500"
  if (progressPct > 0) return "bg-primary"
  return "bg-transparent"
}

function evaluateAchievement(
  def: AchievementDefinition,
  facts: AchievementsFacts,
): EvaluatedAchievement {
  let currentValue = 0
  let unlocked = false
  let progressText = ""
  let unlockedAtText: string | undefined = undefined

  const totalHours = formatHours(facts.totalMinutes)

  switch (def.id) {
    // 1. PRIMEIRA CONQUISTA
    case "FIRST_ACCOUNT":
      currentValue = 1
      unlocked = true
      progressText = "Conta criada com sucesso."
      break
    case "FIRST_ONBOARDING":
      currentValue = facts.onboardingCompleted ? 1 : 0
      unlocked = facts.onboardingCompleted
      progressText = unlocked ? "Onboarding concluído." : "Complete seu onboarding inicial."
      break
    case "FIRST_PLAN":
      currentValue = facts.plans >= 1 ? 1 : 0
      unlocked = facts.plans >= 1
      progressText = unlocked
        ? "Planejamento criado."
        : "Crie um planejamento no menu Planejamento."
      break
    case "FIRST_SESSION":
      currentValue = facts.sessions >= 1 ? 1 : 0
      unlocked = facts.sessions >= 1
      if (unlocked && facts.firstSessionAt) {
        unlockedAtText = formatDateBR(facts.firstSessionAt) ?? undefined
      }
      progressText = unlocked ? "Primeiro estudo registrado." : "Registre sua 1ª sessão de estudo."
      break
    case "FIRST_QUESTION":
      currentValue = facts.totalQuestions >= 1 ? 1 : 0
      unlocked = facts.totalQuestions >= 1
      progressText = unlocked
        ? `${pluralize(facts.totalQuestions, "questão respondida", "questões respondidas")}.`
        : "Resolva sua primeira questão."
      break
    case "FIRST_REVIEW":
      currentValue = facts.reviews >= 1 ? 1 : 0
      unlocked = facts.reviews >= 1
      progressText = unlocked
        ? `${pluralize(facts.reviews, "revisão realizada", "revisões realizadas")}.`
        : "Conclua sua primeira revisão."
      break

    // 2. CONSTÂNCIA
    case "STREAK_3_DAYS":
    case "STREAK_7_DAYS":
    case "STREAK_14_DAYS":
    case "STREAK_30_DAYS":
    case "STREAK_90_DAYS":
    case "STREAK_180_DAYS":
    case "STREAK_365_DAYS":
      currentValue = facts.streak
      unlocked = facts.streak >= def.targetValue
      if (unlocked) {
        progressText = `Sequência atingida (${facts.streak} dias).`
      } else {
        const remaining = def.targetValue - facts.streak
        progressText = `Sequência atual: ${facts.streak} dias. Faltam ${pluralize(remaining, "dia", "dias")}.`
      }
      break

    // 3. VOLUME DE ESTUDO
    case "HOURS_10":
    case "HOURS_50":
    case "HOURS_100":
    case "HOURS_250":
    case "HOURS_500":
    case "HOURS_750":
    case "HOURS_1000":
    case "HOURS_2000":
    case "HOURS_3000":
    case "HOURS_5000":
      currentValue = totalHours
      unlocked = totalHours >= def.targetValue
      if (unlocked) {
        progressText = `Você já acumulou ${totalHours}h de estudo.`
      } else {
        const remaining = def.targetValue - totalHours
        progressText = `Você já acumulou ${totalHours}h. Faltam ${remaining}h.`
      }
      break

    // 4. QUESTÕES
    case "QUESTIONS_1":
    case "QUESTIONS_50":
    case "QUESTIONS_250":
    case "QUESTIONS_500":
    case "QUESTIONS_1000":
    case "QUESTIONS_2500":
    case "QUESTIONS_5000":
    case "QUESTIONS_10000":
    case "QUESTIONS_25000":
      currentValue = facts.totalQuestions
      unlocked = facts.totalQuestions >= def.targetValue
      if (unlocked) {
        progressText = `Você já resolveu ${facts.totalQuestions.toLocaleString("pt-BR")} questões.`
      } else {
        const remaining = def.targetValue - facts.totalQuestions
        progressText = `Você já resolveu ${facts.totalQuestions}. Faltam ${pluralize(remaining, "questão", "questões")}.`
      }
      break

    // 5. DESEMPENHO EM QUESTÕES
    case "ACCURACY_70":
    case "ACCURACY_80":
    case "ACCURACY_85":
    case "ACCURACY_90":
    case "ACCURACY_95": {
      const minSample = getAccuracyMinSample(def.id)
      currentValue = facts.overallAccuracy
      const hasSample = facts.totalQuestions >= minSample
      unlocked = hasSample && facts.overallAccuracy >= def.targetValue
      if (unlocked) {
        progressText = `Acurácia comprovada: ${facts.overallAccuracy}% (${facts.totalQuestions} questões).`
      } else if (!hasSample) {
        const remainingSample = minSample - facts.totalQuestions
        progressText = `Amostra atual: ${facts.totalQuestions}/${minSample} questões (faltam ${remainingSample}).`
      } else {
        progressText = `Acurácia atual: ${facts.overallAccuracy}% (meta: ${def.targetValue}%).`
      }
      break
    }

    // 6. REVISÕES
    case "REVIEWS_1":
    case "REVIEWS_10":
    case "REVIEWS_50":
    case "REVIEWS_100":
    case "REVIEWS_250":
    case "REVIEWS_500":
    case "REVIEWS_1000":
      currentValue = facts.reviews
      unlocked = facts.reviews >= def.targetValue
      if (unlocked) {
        progressText = `Você já concluiu ${facts.reviews.toLocaleString("pt-BR")} revisões.`
      } else {
        const remaining = def.targetValue - facts.reviews
        progressText = `Você já concluiu ${facts.reviews}. Faltam ${pluralize(remaining, "revisão", "revisões")}.`
      }
      break

    // 7. SIMULADOS
    case "SIMULADOS_1":
    case "SIMULADOS_5":
    case "SIMULADOS_10":
    case "SIMULADOS_25":
    case "SIMULADOS_50":
    case "SIMULADOS_100":
      currentValue = facts.simulados
      unlocked = facts.simulados >= def.targetValue
      if (unlocked) {
        progressText = `Você já realizou ${facts.simulados} simulados.`
      } else {
        const remaining = def.targetValue - facts.simulados
        progressText = `Você já realizou ${facts.simulados}. Faltam ${pluralize(remaining, "simulado", "simulados")}.`
      }
      break

    // 8. PLANEJAMENTO
    case "PLAN_CREATED":
      currentValue = facts.plans >= 1 ? 1 : 0
      unlocked = facts.plans >= 1
      progressText = unlocked ? "Planejamento ativo." : "Crie um planejamento semanal."
      break
    case "PLAN_DAY_DONE":
      currentValue = facts.planDaysDone >= 1 ? 1 : 0
      unlocked = facts.planDaysDone >= 1
      progressText = unlocked ? "Dia planejado concluído." : "Cumpra os blocos do dia de hoje."
      break
    case "PLAN_WEEK_DONE":
      currentValue = facts.planDaysTotal > 0 && facts.planDaysDone >= facts.planDaysTotal ? 1 : 0
      unlocked = facts.planDaysTotal > 0 && facts.planDaysDone >= facts.planDaysTotal
      progressText = unlocked
        ? "Semana planejada concluída."
        : `Você cumpriu ${facts.planDaysDone} de ${facts.planDaysTotal || 0} dias planejados.`
      break
    case "PLAN_ADHERENCE_80":
    case "PLAN_ADHERENCE_90":
      currentValue = facts.adherencePercentage
      unlocked = facts.adherencePercentage >= def.targetValue
      progressText = unlocked
        ? `Aderência semanal de ${facts.adherencePercentage}%.`
        : `Aderência atual: ${facts.adherencePercentage}% (meta: ${def.targetValue}%).`
      break
    case "PLAN_MASTER_4_WEEKS":
      currentValue = facts.adherencePercentage >= 90 ? 1 : 0
      unlocked = facts.adherencePercentage >= 90 && facts.streak >= 28
      progressText = unlocked
        ? "4 semanas consecutivas com 90%+ de aderência."
        : "Mantenha consistência semana a semana no planejamento."
      break
    case "REPLAN_FAST_RECOVERY":
    case "REPLAN_ROUTE_TURN":
      currentValue = facts.replanRecoveredCount >= 1 || facts.streak >= 7 ? 1 : 0
      unlocked = currentValue >= 1
      progressText = unlocked
        ? "Pendência recuperada sem quebrar o ritmo."
        : "Recupere blocos atrasados pelo sistema adaptativo."
      break

    // 9. COBERTURA DO EDITAL
    case "COVERAGE_FIRST_TOPIC":
      currentValue = facts.distinctTopicsStudied
      unlocked = facts.distinctTopicsStudied >= 1
      progressText = unlocked
        ? `${pluralize(facts.distinctTopicsStudied, "tópico estudado", "tópicos estudados")}.`
        : "Estude seu primeiro tópico do edital."
      break
    case "COVERAGE_25_PCT":
    case "COVERAGE_50_PCT":
    case "COVERAGE_75_PCT":
    case "COVERAGE_90_PCT":
    case "COVERAGE_100_PCT": {
      // Base estimada de tópicos cadastrados
      const estimatedTotal = Math.max(facts.distinctTopicsStudied, 40)
      const pct = Math.min(100, Math.round((facts.distinctTopicsStudied / estimatedTotal) * 100))
      currentValue = pct
      unlocked = pct >= def.targetValue
      progressText = unlocked
        ? `Cobertura de ${pct}% (${facts.distinctTopicsStudied} tópicos registrados).`
        : `Você estudou ${facts.distinctTopicsStudied} tópicos (cobertura: ${pct}%).`
      break
    }

    // 10. ALTA PERFORMANCE & HORÁRIOS
    case "TIME_MORNING":
      currentValue = facts.morningSessions
      unlocked = facts.morningSessions >= 5
      progressText = unlocked
        ? `${facts.morningSessions} sessões matinais realizadas.`
        : `Sessões matinais: ${facts.morningSessions}/5 (faltam ${5 - facts.morningSessions}).`
      break
    case "TIME_AFTERNOON":
      currentValue = facts.afternoonSessions
      unlocked = facts.afternoonSessions >= 5
      progressText = unlocked
        ? `${facts.afternoonSessions} sessões vespertinas realizadas.`
        : `Sessões vespertinas: ${facts.afternoonSessions}/5 (faltam ${5 - facts.afternoonSessions}).`
      break
    case "TIME_NIGHT":
      currentValue = facts.nightSessions
      unlocked = facts.nightSessions >= 5
      progressText = unlocked
        ? `${facts.nightSessions} sessões noturnas realizadas.`
        : `Sessões noturnas: ${facts.nightSessions}/5 (faltam ${5 - facts.nightSessions}).`
      break
    case "DISCIPLINE_STRONG_POINT":
      currentValue = facts.bestDisciplineAcc30
      unlocked = facts.bestDisciplineAcc30 >= 85
      progressText = unlocked
        ? `Desempenho forte: ${facts.bestDisciplineAcc30}% em matéria com ≥30 questões.`
        : `Melhor aproveitamento em matéria com 30+ questões: ${facts.bestDisciplineAcc30}% (meta: 85%).`
      break
    case "DISCIPLINE_SPECIALIST":
      currentValue = facts.bestDisciplineAcc50
      unlocked = facts.bestDisciplineAcc50 >= 90
      progressText = unlocked
        ? `Especialista: ${facts.bestDisciplineAcc50}% em matéria com ≥50 questões.`
        : `Melhor aproveitamento em matéria com 50+ questões: ${facts.bestDisciplineAcc50}% (meta: 90%).`
      break
    case "PERFORMANCE_APPROVAL_RANGE":
      currentValue = facts.simuladoAvgScore
      unlocked = facts.simulados >= 3 && facts.simuladoAvgScore >= 90
      if (unlocked) {
        progressText = `Média em simulados: ${facts.simuladoAvgScore}%.`
      } else if (facts.simulados < 3) {
        progressText = `Simulados realizados: ${facts.simulados}/3 para validação estatística.`
      } else {
        progressText = `Média atual em simulados: ${facts.simuladoAvgScore}% (meta: 90%).`
      }
      break

    default:
      currentValue = 0
      unlocked = false
      progressText = "Continue estudando para desbloquear."
  }

  let progressPct = 0
  if (def.targetValue > 0) {
    progressPct = Math.min(100, Math.max(0, Math.round((currentValue / def.targetValue) * 100)))
  } else if (unlocked) {
    progressPct = 100
  }

  return {
    def,
    unlocked,
    progressPct,
    currentValue,
    progressText,
    unlockedAtText,
  }
}

const RARITY_LABELS: Record<AchievementRarity, { label: string; class: string }> = {
  comum: {
    label: "Comum",
    class:
      "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
  rara: {
    label: "Rara",
    class:
      "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  epica: {
    label: "Épica",
    class:
      "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  },
  lendaria: {
    label: "Lendária",
    class:
      "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  },
}

export function ConquistasView() {
  const [facts, setFacts] = useState<AchievementsFacts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Filtros
  const [statusFilter, setStatusFilter] = useState<
    "todas" | "conquistadas" | "em_progresso" | "bloqueadas"
  >("todas")
  const [selectedCategory, setSelectedCategory] = useState<string>("todas")
  const [searchQuery, setSearchQuery] = useState<string>("")

  const load = useCallback(() => {
    void (async () => {
      setIsLoading(true)
      setLoadError(null)
      const res = await getAchievementsAction()
      if (res.data) setFacts(res.data)
      else setLoadError(res.error || "Erro ao carregar conquistas.")
      setIsLoading(false)
    })()
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Avaliação de todas as conquistas
  const evaluatedAchievements = useMemo(() => {
    if (!facts) return []
    return ACHIEVEMENTS_LIST.map((def) => evaluateAchievement(def, facts))
  }, [facts])

  // Métricas gerais de progresso
  const totalCount = ACHIEVEMENTS_LIST.length
  const unlockedCount = useMemo(() => {
    return evaluatedAchievements.filter((a) => a.unlocked).length
  }, [evaluatedAchievements])

  const inProgressCount = useMemo(() => {
    return evaluatedAchievements.filter((a) => !a.unlocked && a.progressPct > 0).length
  }, [evaluatedAchievements])

  const lockedCount = totalCount - unlockedCount - inProgressCount
  const overallPercentage = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0

  // Conquistas filtradas
  const filteredAchievements = useMemo(() => {
    return evaluatedAchievements.filter((item) => {
      // Filtro de status
      if (statusFilter === "conquistadas" && !item.unlocked) return false
      if (statusFilter === "em_progresso" && (item.unlocked || item.progressPct === 0)) return false
      if (statusFilter === "bloqueadas" && (item.unlocked || item.progressPct > 0)) return false

      // Filtro de categoria
      if (selectedCategory !== "todas" && item.def.categoryId !== selectedCategory) return false

      // Busca por título ou descrição
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.def.title.toLowerCase().includes(q)
        const matchDesc = item.def.description.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc) return false
      }

      return true
    })
  }, [evaluatedAchievements, statusFilter, selectedCategory, searchQuery])

  // Agrupamento por categoria
  const categoriesWithItems = useMemo(() => {
    return ACHIEVEMENT_CATEGORIES.map((cat) => {
      const items = filteredAchievements.filter((a) => a.def.categoryId === cat.id)
      const allCategoryItems = evaluatedAchievements.filter((a) => a.def.categoryId === cat.id)
      const catUnlocked = allCategoryItems.filter((a) => a.unlocked).length
      const catTotal = allCategoryItems.length
      const catPct = catTotal > 0 ? Math.round((catUnlocked / catTotal) * 100) : 0

      return {
        ...cat,
        items,
        totalInCat: catTotal,
        unlockedInCat: catUnlocked,
        catPct,
      }
    }).filter((cat) => cat.items.length > 0)
  }, [filteredAchievements, evaluatedAchievements])

  return (
    <div className="space-y-8 pb-16">
      {/* ═══════════════════════════════════════════════════════════════
          HEADER DA PÁGINA & BANNER DE ESTATÍSTICAS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              <Trophy className="h-7 w-7 text-primary" />
              <span>Minhas Conquistas</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Construa consistência, volume e evidências sólidas de preparação ao longo da sua
              jornada.
            </p>
          </div>
        </div>

        {/* Banner Geral de Progresso */}
        {!isLoading && !loadError && (
          <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/30 p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              {/* Barra de Progresso Principal */}
              <div className="flex-1 w-full space-y-2.5">
                <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
                  <span className="text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Progresso Geral de Conquistas
                  </span>
                  <span className="font-mono text-primary font-bold text-base sm:text-lg">
                    {overallPercentage}% ({unlockedCount}/{totalCount})
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-muted/80 overflow-hidden p-0.5 border border-border/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-blue-500 to-sky-400 transition-all duration-700"
                    style={{ width: `${overallPercentage}%` }}
                  />
                </div>
              </div>

              {/* 3 Blocos de Contagem */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
                <div className="bg-background/80 border border-emerald-500/20 rounded-xl px-3 sm:px-4 py-2 text-center shadow-xs">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                    Conquistadas
                  </span>
                  <span className="text-lg sm:text-xl font-mono font-extrabold text-foreground">
                    {unlockedCount}
                  </span>
                </div>
                <div className="bg-background/80 border border-blue-500/20 rounded-xl px-3 sm:px-4 py-2 text-center shadow-xs">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                    Em Progresso
                  </span>
                  <span className="text-lg sm:text-xl font-mono font-extrabold text-foreground">
                    {inProgressCount}
                  </span>
                </div>
                <div className="bg-background/80 border border-slate-500/20 rounded-xl px-3 sm:px-4 py-2 text-center shadow-xs">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Bloqueadas
                  </span>
                  <span className="text-lg sm:text-xl font-mono font-extrabold text-muted-foreground">
                    {lockedCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BARRA DE FILTROS & BUSCA
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 bg-muted/30 border border-border/60 rounded-2xl">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto p-1">
          <button
            type="button"
            onClick={() => setStatusFilter("todas")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              statusFilter === "todas"
                ? "bg-background text-foreground shadow-xs border border-border/50 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
            )}
          >
            Todas ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("conquistadas")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              statusFilter === "conquistadas"
                ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs border border-border/50 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
            )}
          >
            Conquistadas ({unlockedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("em_progresso")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              statusFilter === "em_progresso"
                ? "bg-background text-blue-600 dark:text-blue-400 shadow-xs border border-border/50 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
            )}
          >
            Em Progresso ({inProgressCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("bloqueadas")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap",
              statusFilter === "bloqueadas"
                ? "bg-background text-muted-foreground shadow-xs border border-border/50 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40",
            )}
          >
            Bloqueadas ({lockedCount})
          </button>
        </div>

        {/* Busca e Categoria */}
        <div className="flex items-center gap-2 px-1">
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar conquista..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs bg-background border border-border/60 rounded-xl placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="relative shrink-0">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filtrar por categoria"
              className="h-8 px-2.5 text-xs bg-background border border-border/60 rounded-xl text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="todas">Todas as categorias</option>
              {ACHIEVEMENT_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ESTADOS DE CARREGAMENTO / ERRO / CONTEÚDO
          ═══════════════════════════════════════════════════════════════ */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-medium">Carregando conquistas...</p>
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center space-y-3 max-w-md mx-auto">
          <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="bg-primary hover:bg-primary/90 text-white text-xs font-semibold px-6 py-2 rounded-xl"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !loadError && categoriesWithItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-2">
          <Filter className="h-8 w-8 text-muted-foreground/50 mx-auto" />
          <h3 className="text-sm font-bold text-foreground">Nenhuma conquista encontrada</h3>
          <p className="text-xs text-muted-foreground">
            Tente ajustar os filtros ou o termo de busca para visualizar as conquistas.
          </p>
        </div>
      )}

      {!isLoading && !loadError && facts && categoriesWithItems.length > 0 && (
        <div className="space-y-12">
          {categoriesWithItems.map((cat) => (
            <div key={cat.id} className="space-y-4">
              {/* Header da Categoria */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: cat.color }}
                    />
                    <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-foreground">
                      {cat.title}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground">{cat.subtitle}</p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {cat.unlockedInCat} de {cat.totalInCat}
                  </span>
                  <div className="w-24 h-2 rounded-full bg-muted/80 overflow-hidden border border-border/40">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${cat.catPct}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              </div>

              {/* Grid dos Cards de Conquista */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cat.items.map(({ def, unlocked, progressPct, progressText, unlockedAtText }) => {
                  const rarity = RARITY_LABELS[def.rarity]

                  return (
                    <div
                      key={def.id}
                      className={cn(
                        "rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3.5 transition-all duration-200 relative overflow-hidden",
                        getCardBackgroundClass(unlocked, progressPct),
                      )}
                    >
                      {/* Topo do Card: Ícone Semântico + Rarity Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Container do Ícone */}
                          <div
                            className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-transform",
                              getIconContainerBg(unlocked, progressPct),
                            )}
                          >
                            <AchievementIcon
                              name={def.iconName}
                              unlocked={unlocked}
                              className={unlocked ? "text-primary" : "text-muted-foreground"}
                            />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <h3 className="text-sm font-bold text-foreground leading-snug truncate">
                              {def.title}
                            </h3>
                            <span
                              className={cn(
                                "inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border",
                                rarity.class,
                              )}
                            >
                              {rarity.label}
                            </span>
                          </div>
                        </div>

                        {/* Status Stamp */}
                        {unlocked ? (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Concluída</span>
                          </div>
                        ) : (
                          <div className="text-muted-foreground/50 shrink-0">
                            <Lock className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Descrição */}
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {def.description}
                      </p>

                      {/* Barra de Progresso & Rótulo de Status */}
                      <div className="space-y-1.5 pt-1 border-t border-border/40">
                        <div className="flex items-center justify-between text-[11px] leading-none">
                          <span
                            className={cn(
                              "font-medium truncate max-w-[200px]",
                              unlocked
                                ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                : "text-muted-foreground",
                            )}
                          >
                            {unlockedAtText ? `Conquistada em ${unlockedAtText}` : progressText}
                          </span>
                          <span className="font-mono font-bold text-foreground shrink-0 text-[11px]">
                            {progressPct}%
                          </span>
                        </div>

                        {/* Mini Barra de Progresso */}
                        <div className="h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              getProgressBarColor(unlocked, progressPct),
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
