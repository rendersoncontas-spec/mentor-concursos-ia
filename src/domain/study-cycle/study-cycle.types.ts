export type CycleStatus = "ACTIVE" | "PAUSED" | "CONCLUDED"
export type CycleItemPriority = "ALTA" | "MEDIA" | "BAIXA"
export type CycleItemStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO"

export interface StudyCycle {
  id: string
  user_id: string
  name: string
  contest_name: string | null
  edital_name: string | null
  status: CycleStatus
  current_item_index: number
  created_at: string
  updated_at: string
}

export interface StudyCycleItem {
  id: string
  cycle_id: string
  discipline_id: string
  order: number
  priority: CycleItemPriority
  planned_minutes: number
  completed_minutes: number
  status: CycleItemStatus
  last_studied_at: string | null
  created_at: string
  updated_at: string
}

export interface StudyCycleSession {
  id: string
  cycle_id: string
  cycle_item_id: string
  study_history_id: string
  created_at: string
}

export interface StudyCycleWithItems extends StudyCycle {
  items: StudyCycleItemWithDetails[]
}

export interface StudyCycleItemWithDetails extends StudyCycleItem {
  discipline: {
    id: string
    name: string
    area: string | null
    color_hex: string | null
  }
}

export interface CycleProgress {
  totalPlannedMinutes: number
  totalCompletedMinutes: number
  progressPercentage: number
  currentItemIndex: number
  totalItems: number
  completedItems: number
}

export interface CycleIntelligence {
  disciplineId: string
  disciplineName: string
  accuracy: number | null
  recentErrors: number
  overdueReviews: number
  attentionScore: number
  suggestion: string | null
}

export type CreateCycleInput = {
  name: string
  contestName?: string | null
  editalName?: string | null
  items: {
    disciplineId: string
    priority: CycleItemPriority
    plannedMinutes: number
  }[]
}
