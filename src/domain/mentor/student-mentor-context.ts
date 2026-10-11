/**
 * G2.15 — StudentMentorContext: o CONTEXTO ESTRUTURADO do aluno.
 *
 * Fluxo: dados reais → métricas determinísticas (serviços existentes) →
 * este contexto → insights/evidências → (futuro) interpretação por um LLM.
 *
 * Regras de contrato (valem para todo campo):
 *   - Sem fonte → `null` (nunca 0 ou estimativa). O motivo fica no `status`
 *     da seção: "NO_DATA" (o banco respondeu e não há registro) ou
 *     "UNAVAILABLE" (a leitura falhou).
 *   - 0 só aparece quando É o fato (ex.: o aluno tem histórico e não estudou
 *     nos últimos 7 dias → 0 min).
 *   - Toda disciplina já vem na IDENTIDADE CANÔNICA (G2.12/G2.13); o nome é o
 *     exibido ao aluno (custom_name da canônica, senão global).
 *   - Nada aqui decide ciclo, revisões, plano, metas ou identidade: só lê.
 */

export const MENTOR_CONTEXT_VERSION = "g2.15-v1"

export type MentorSectionStatus = "OK" | "NO_DATA" | "UNAVAILABLE"
export type MentorTrend = "UP" | "STABLE" | "DOWN"
export type ContextQualityLevel = "EMPTY" | "LOW" | "MEDIUM" | "HIGH"

export interface MentorPeriodTotals {
  minutes: number
  sessions: number
  studiedDays: number
}

export interface MentorDisciplineSummary {
  /** Identidade canônica. */
  disciplineId: string
  name: string
  /** Outras entradas do catálogo somadas nesta identidade (aliases). */
  mergedNames: string[]
  studyMinutesLast28: number | null
  studyMinutesTotal: number | null
  sessionsTotal: number | null
  lastStudyDate: string | null
  simuladosCount: number
  simuladoAverage: number | null
  simuladoFirst: number | null
  simuladoLast: number | null
  simuladoEvolutionPp: number | null
  simuladoTrend: MentorTrend | null
  /** Classificação G2.11 (estudo × desempenho, últimas 4 semanas). */
  studyPerformanceStatus: string | null
  /** Status no edital (user_disciplines). */
  editalStatus: string | null
  overdueReviews: number | null
}

export interface MentorStudySection {
  status: MentorSectionStatus
  totalMinutes: number | null
  totalSessions: number | null
  last7: MentorPeriodTotals | null
  /** Os 7 dias anteriores aos últimos 7 (dias 8–14) — base da evolução. */
  previous7: MentorPeriodTotals | null
  last28: MentorPeriodTotals | null
  currentWeekMinutes: number | null
  streak: { current: number; longest: number } | null
  lastStudyDate: string | null
  daysSinceLastStudy: number | null
}

export interface MentorSimulationsSection {
  status: MentorSectionStatus
  count: number | null
  averageAccuracy: number | null
  firstAccuracy: number | null
  lastAccuracy: number | null
  bestAccuracy: number | null
  worstAccuracy: number | null
  firstToLastPp: number | null
  /** null com menos de 3 simulados (regra G2.10). */
  trend: MentorTrend | null
  lastDate: string | null
  bottleneck: {
    disciplineId: string | null
    name: string
    accuracy: number | null
    reasons: string[]
    simuladosCount: number
    lowData: boolean
  } | null
}

export interface MentorReviewsSection {
  status: MentorSectionStatus
  activeItems: number | null
  overdue: number | null
  dueToday: number | null
  upcoming: number | null
  completedLast30: number | null
}

export interface MentorCycleSection {
  status: MentorSectionStatus
  name: string | null
  currentRound: number | null
  totalRoundsDone: number | null
  roundProgressPct: number | null
  currentItem: { disciplineId: string; name: string; studiedMinutesInRound: number; plannedMinutes: number } | null
  nextItem: { disciplineId: string; name: string } | null
}

export interface MentorPlanningSection {
  status: MentorSectionStatus
  /** Carga semanal do plano ativo (minutos). Planejado ≠ realizado. */
  weeklyTargetMinutes: number | null
  /** "configured" = o aluno definiu; "suggested" = soma dos blocos do plano. */
  targetSource: "configured" | "suggested" | null
  actualWeekMinutes: number | null
  adherencePct: number | null
}

export interface MentorGoal {
  target: number
  realized: number
  /** realizado − meta (negativo = abaixo). */
  difference: number
  unit: "minutes" | "questions" | "days"
}

export interface MentorGoalsSection {
  status: MentorSectionStatus
  /** Meta semanal de horas do perfil (sem valor padrão no banco → sempre do aluno). */
  weeklyStudy: (MentorGoal & { expectedByToday: number; daysElapsed: number }) | null
  /** Só quando difere do padrão do banco (100); igual ao padrão não dá para afirmar que o aluno escolheu. */
  weeklyQuestions: MentorGoal | null
  /** Só quando difere do padrão do banco (6). */
  weeklyDays: MentorGoal | null
  notes: string[]
}

export interface MentorEditalSection {
  status: MentorSectionStatus
  total: number | null
  completed: number | null
  studying: number | null
  revising: number | null
  notStarted: number | null
  percentage: number | null
}

export interface MentorTargetSection {
  status: MentorSectionStatus
  examName: string | null
  examDate: string | null
  daysToExam: number | null
}

export interface ContextQuality {
  level: ContextQualityLevel
  /** Sinais objetivos que levaram ao nível (documentados em docs/mentor-ai-context.md). */
  signals: {
    totalSessions: number
    sessionsLast28: number
    simulados: number
    activeReviewItems: number
    hasCycle: boolean
    hasPlan: boolean
    hasGoal: boolean
  }
  reasons: string[]
}

export type MentorInsightType =
  | "STUDY_LAST_7_DAYS"
  | "STUDY_TREND_WEEK"
  | "NO_RECENT_STUDY"
  | "LAST_SIMULADO"
  | "SIMULADO_EVOLUTION"
  | "DISCIPLINE_ATTENTION"
  | "DECLINING_DISCIPLINE"
  | "IMPROVING_DISCIPLINE"
  | "OVERDUE_REVIEWS"
  | "GOAL_PROGRESS"
  | "CYCLE_POSITION"
  | "EDITAL_PROGRESS"
  | "INSUFFICIENT_DATA"

export type MentorPriority = "HIGH" | "MEDIUM" | "LOW"

export interface MentorPeriod {
  /** Rótulo estável: "last_7_days" | "last_28_days" | "current_week" | "all_time" | "today". */
  key: string
  startDate: string | null
  endDate: string | null
}

export type MentorEvidence = Record<string, number | string | boolean | null | string[]>

export interface MentorInsight {
  id: string
  type: MentorInsightType
  priority: MentorPriority
  disciplineId: string | null
  disciplineName: string | null
  period: MentorPeriod
  /** Métricas que sustentam a frase, prontas para uma IA futura. */
  evidence: MentorEvidence
  /** Frase factual em português (sem causalidade, sem diagnóstico). */
  message: string
}

export type MentorRecommendationType =
  | "LOW_STUDY_VOLUME"
  | "HIGH_OVERDUE_REVIEWS"
  | "LOW_SIMULADO_PERFORMANCE"
  | "DECLINING_DISCIPLINE"
  | "HIGH_PROGRESS"
  | "STUDY_BELOW_GOAL"
  | "INSUFFICIENT_DATA"

/** Candidata: NUNCA é executada; é material para a interpretação futura. */
export interface MentorRecommendationCandidate {
  id: string
  type: MentorRecommendationType
  priority: MentorPriority
  disciplineId: string | null
  disciplineName: string | null
  period: MentorPeriod
  evidence: MentorEvidence
  reason: string
}

export interface StudentMentorContext {
  version: typeof MENTOR_CONTEXT_VERSION
  generatedAt: string
  timezone: string
  todayKey: string
  /** Vínculos alias → canônica conhecidos nesta leitura (0 sem a migration G2.12). */
  identity: { knownAliases: number }
  target: MentorTargetSection
  study: MentorStudySection
  simulations: MentorSimulationsSection
  reviews: MentorReviewsSection
  cycle: MentorCycleSection
  planning: MentorPlanningSection
  goals: MentorGoalsSection
  edital: MentorEditalSection
  disciplines: MentorDisciplineSummary[]
  contextQuality: ContextQuality
  insights: MentorInsight[]
  recommendations: MentorRecommendationCandidate[]
  /** Leituras que alimentaram o contexto (auditoria/performance). */
  sources: string[]
}
