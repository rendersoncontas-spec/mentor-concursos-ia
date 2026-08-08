import { type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"
import { HeatmapDay, Insight, RankingItem, TimeSeriesDataPoint, GoalProgress } from "@/application/study-analytics/types"

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

export interface PendingReviewsSummary {
  count: number
  overdue: number
  today: number
  highPriority: number
  nextReview: string | null
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
  insights: Insight[]
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

export interface DashboardSnapshot {
  user: DashboardProfile | null
  activeTarget: DashboardTarget | null
  stats: DashboardAnalytics["stats"] & {
    totalQuestions?: number
    correctQuestions?: number
    wrongQuestions?: number
    accuracyPercentage?: number
    completedTopics?: number
    pendingTopics?: number
    editalProgress?: number
  }
  disciplinesStats: DashboardDisciplinesStats
  todayPlanItems: StudyPlanItemWithDetails[]
  rawDisciplines: any[]
  reviews: PendingReviewsSummary
  recentActivities: RecentActivityItem[]
  analytics: DashboardAnalytics
}

// Compatibilidade durante refatoração
export type DashboardData = DashboardSnapshot

