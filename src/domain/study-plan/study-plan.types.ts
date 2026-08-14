// Dias da semana (0 = Domingo, 1 = Segunda ... 6 = Sábado)
import type { AdaptiveDecision } from "@/domain/adaptive-learning/models"

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
}

export const DAY_SHORT: Record<DayOfWeek, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
}

export type PlanType = "CICLO_ROTATIVO" | "CRONOGRAMA_SEMANAL"
export type PlanStatus = "ACTIVE" | "PAUSED" | "ARCHIVED" | "COMPLETED"
export type BlockStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO"

// Plano de estudos (cabeçalho)
export interface StudyPlan {
  id: string
  user_id: string
  version: number
  plan_type: PlanType
  status: PlanStatus
  name: string | null
  description: string | null
  total_cycle_minutes?: number
  weekly_minutes?: number | null
  start_date?: string | null
  end_date?: string | null
  parent_plan_id?: string | null
  plan_group_id?: string | null
  paused_at?: string | null
  archived_at?: string | null
  generated_reason: string
  active: boolean
  generated_at: string
  created_at: string
}

// Item dentro de um plano (por dia + disciplina)
export interface StudyPlanItem {
  id: string
  study_plan_id: string
  discipline_id: string
  day_of_week: DayOfWeek
  duration_minutes: number
  execution_order?: number
  block_status?: BlockStatus
  priority: number
  priority_score: number
  recommended_sessions: number
  created_at: string
}

// Item enriquecido com o nome da disciplina (para UI)
export interface StudyPlanItemWithDetails extends StudyPlanItem {
  discipline: {
    id: string
    name: string
    area: string | null
    color_hex?: string | null
  }
}

// Bloco do Ciclo Rotativo (independente de dia da semana)
export interface CycleBlock {
  id: string
  studyPlanId: string
  disciplineId: string
  disciplineName: string
  disciplineArea: string | null
  color?: string
  executionOrder: number
  durationMinutes: number
  studiedMinutes?: number
  status: BlockStatus
  priorityScore: number
}

// Resumo e progresso do Ciclo Rotativo
export interface CycleOverviewData {
  planId: string
  version: number
  planType: PlanType
  totalCycleMinutes: number
  completedMinutes: number
  progressPercentage: number
  currentBlockIndex: number
  totalBlocksCount: number
  completedBlocksCount: number
  blocks: CycleBlock[]
  history?: { date: string; disciplineId: string; minutes: number }[]
}

// Configuração para geração do ciclo
export interface CycleConfigInput {
  totalCycleHours: number
  disciplines: {
    disciplineId: string
    name: string
    area: string | null
    weight: number // 1 a 5
    difficulty: number // 1 a 5
  }[]
}

// Agrupamento de itens por dia (para renderização semanal)
export interface StudyPlanDay {
  dayOfWeek: DayOfWeek
  label: string
  shortLabel: string
  totalMinutes: number
  items: StudyPlanItemWithDetails[]
}

// Visão completa da semana (para a página /study-plan)
export interface StudyPlanWeek {
  plan: StudyPlan
  days: StudyPlanDay[]
  totalWeeklyMinutes: number
}

// Resumo semanal por disciplina (para o sumário da página)
export interface StudyPlanDisciplineSummary {
  disciplineId: string
  disciplineName: string
  disciplineArea: string | null
  totalWeeklyMinutes: number
  daysCount: number
  priorityScore: number
}

// Input do algoritmo puro
export interface AlgorithmInput {
  weeklyMinutes: number
  availableDays: DayOfWeek[] // Futuro: dias disponíveis do aluno
  disciplines: AlgorithmDisciplineInput[]
  adaptiveDecisions?: AdaptiveDecision[] // Decisões do Adaptive Learning Engine (ALE)
}

export interface AlgorithmDisciplineInput {
  disciplineId: string
  name: string
  area: string | null
  weight: number
  difficulty?: number
  status: string // Disciplinas COMPLETED podem ter peso reduzido
}

// Output do algoritmo puro (antes de persistir)
export interface AlgorithmItem {
  disciplineId: string
  disciplineName: string
  disciplineArea: string | null
  dayOfWeek: DayOfWeek
  executionOrder?: number
  durationMinutes: number
  priority: number
  priorityScore: number
  recommendedSessions: number
}
