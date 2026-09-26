import { type CycleBlock, type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"
import type { HeatmapDay, RankingItem, TimeSeriesDataPoint, GoalProgress } from "@/application/study-analytics/types"

export interface DashboardProfile {
  name: string | null
  weekly_study_hours: number | null
  weekly_questions_goal: number | null
  weekly_revisions_goal: number | null
  weekly_study_days_goal: number | null
  week_start_day: number | null
  work_regime: string | null
  experience_level: string | null
}

export interface DashboardTarget {
  id?: string
  target_exam: string
  target_role: string
  main_study_source: string | null
  exam_date?: string | null
  exam_time?: string | null
  exam_location?: string | null
  exam_name?: string | null
}

export interface DashboardDisciplinesStats {
  total: number
  completed: number
  revising: number
  studying: number
}

export interface RecentActivityItem {
  id: string
  discipline_name: string
  subject_name?: string | null
  duration_minutes: number
  study_source: string
  started_at: string
  completed: boolean
  focus_score?: number | null
  energy_level?: number | null
  score?: number | null
}


// O novo formato aninhado de analytics
export interface DashboardAnalytics {
  heatmap: HeatmapDay[]
  evolution: TimeSeriesDataPoint[]
  rankings: {
    disciplines: RankingItem[]
    areas: RankingItem[]
  }
  goals: {
    weekly: GoalProgress
    daily: GoalProgress
    questions?: GoalProgress
    revisions?: GoalProgress
    studyDays?: GoalProgress
  }
  stats: {
    dailyMinutes: number
    weeklyMinutes: number
    monthlyMinutes: number
    longestSession: number
    consecutiveStreak: number
    longestStreak: number
    averageFocus: number | null
    averageEnergy: number | null
    averageDifficulty: number | null
  }
}

export interface WidgetConfigItem {
  widget_id: string
  position_order: number
  col_span: 1 | 2 | 3
  row_span?: number
  visible: boolean
}

export interface DashboardRawDiscipline {
  id: string
  discipline_id: string | undefined
  name: string
  tempoFormatted: string
  correctCount: number
  wrongCount: number
  notebookCount: number
  accuracyPercentage: number
}

/** Contexto consolidado PLANO + CICLO + 30D para o widget Desempenho por Matéria. */
export interface DashboardSubjectContext {
  discipline_id: string
  name: string
  planned: boolean
  inCycle: boolean
  cycleOrder: number | null
  isCurrentInCycle: boolean
  recent30d: boolean
  lastStudiedAt: string | null
}

export type PerformancePeriod = "HOJE" | "SEMANA" | "MES" | "ANO" | "TOTAL"

export interface PeriodPerformanceData {
  totalQuestions: number
  correctQuestions: number
  wrongQuestions: number
  accuracyPercentage: number
}

export type PerformanceByPeriod = Record<PerformancePeriod, PeriodPerformanceData>

/**
 * Fase I.8 — quais leituras do Dashboard falharam nesta carga.
 *
 * `true` significa "a leitura falhou", não "não há dado": os campos correspondentes
 * do snapshot (stats vindos do histórico, disciplinas, plano ativo, atividades
 * recentes etc.) usam um valor seguro (vazio/zero) só para não quebrar os
 * cálculos, e widgets que dependem deles devem tratar essa flag como "dado
 * indisponível", nunca como "zero real". Ausente/`false` = leitura ok (ou,
 * genuinamente, sem dado).
 */
export interface DashboardDataIssues {
  /** Leitura de `profiles` (nome, metas semanais, dia de início da semana). */
  profile: boolean
  /** Leitura de `user_targets` (meta ativa: prova, cargo, data). */
  target: boolean
  /** `getCycleOverviewData` — ciclo de estudo ativo (Cycle Engine). */
  cycle: boolean
  /** `getTodayStudyItems` — itens planejados para hoje. */
  todayPlan: boolean
  /** `getStudyHistoryForAnalytics` — histórico de estudo (alimenta a maior parte de `stats`/`analytics`). */
  history: boolean
  /** `getRecentActivities` — últimas atividades. */
  activities: boolean
  /** Leitura paginada de `question_attempts`. */
  attempts: boolean
  /** `getUserDisciplines` — disciplinas do edital do usuário. */
  disciplines: boolean
}

export interface DashboardSnapshot {
  user: DashboardProfile | null
  activeTarget: DashboardTarget | null
  stats: DashboardAnalytics["stats"] & {
    /** Minutos de todo o histórico (Fase H). */
    totalMinutes?: number
    totalQuestions?: number
    correctQuestions?: number
    wrongQuestions?: number
    accuracyPercentage?: number
    performanceByPeriod?: PerformanceByPeriod
    completedTopics?: number
    pendingTopics?: number
    editalProgress?: number
  }
  disciplinesStats: DashboardDisciplinesStats
  todayPlanItems: StudyPlanItemWithDetails[]
  cycleBlocks?: CycleBlock[] | null
  rawDisciplines: DashboardRawDiscipline[]
  subjectContexts?: DashboardSubjectContext[]
  recentActivities: RecentActivityItem[]
  analytics: DashboardAnalytics
  /**
   * Fase I.8: mapa de quais leituras falharam nesta carga (erro ≠ ausência).
   * Opcional por compatibilidade com fixtures de teste existentes; em
   * produção `getDashboardData` sempre preenche os 8 campos.
   */
  dataIssues?: DashboardDataIssues
}

// Compatibilidade durante refatoração
export type DashboardData = DashboardSnapshot

