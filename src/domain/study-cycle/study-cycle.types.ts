export type CycleStatus = "ACTIVE" | "PAUSED" | "CONCLUDED" | "ARCHIVED"
export type CycleItemPriority = "ALTA" | "MEDIA" | "BAIXA"
export type CycleItemDifficulty = "FACIL" | "MEDIA" | "DIFICIL"
export type CycleItemProgressStatus = "CONCLUIDO" | "ATUAL" | "PULADO" | "PENDENTE"

export function normalizeDifficulty(val?: string | null): CycleItemDifficulty {
  if (!val) return "MEDIA"
  const upper = val.toUpperCase().trim()
  if (
    upper === "FACIL" ||
    upper === "FÁCIL" ||
    upper === "BAIXA" ||
    upper === "EASY" ||
    upper === "LOW"
  ) {
    return "FACIL"
  }
  if (
    upper === "DIFICIL" ||
    upper === "DIFÍCIL" ||
    upper === "ALTA" ||
    upper === "HARD" ||
    upper === "HIGH"
  ) {
    return "DIFICIL"
  }
  return "MEDIA"
}

export function mapDifficultyToPriority(difficulty?: CycleItemDifficulty | string): CycleItemPriority {
  const norm = normalizeDifficulty(difficulty)
  if (norm === "FACIL") return "BAIXA"
  if (norm === "DIFICIL") return "ALTA"
  return "MEDIA"
}

/** Minutos padrão sugeridos por dificuldade da matéria no ciclo. */
export const DEFAULT_MINUTES_BY_DIFFICULTY: Record<CycleItemDifficulty, number> = {
  FACIL: 30,
  MEDIA: 60,
  DIFICIL: 90,
}

/**
 * Retorna o tempo sugerido (em minutos) para uma dificuldade:
 * FACIL → 30, MEDIA → 60, DIFICIL → 90.
 */
export function getDefaultMinutesByDifficulty(
  difficulty?: CycleItemDifficulty | string
): number {
  return DEFAULT_MINUTES_BY_DIFFICULTY[normalizeDifficulty(difficulty)]
}

/** Formata minutos no formato digital HH:MM (ex: 30 -> "00:30", 60 -> "01:00", 90 -> "01:30"). */
export function formatMinutesDigital(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60)
  const min = Math.max(0, minutes) % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

export interface StudyCycle {
  id: string
  user_id: string
  name: string
  contest_name: string | null
  edital_name: string | null
  status: CycleStatus
  current_item_index: number
  current_round: number
  total_rounds_done: number
  current_item_progress_min: number
  created_at: string
  updated_at: string
}

export interface StudyCycleItem {
  id: string
  cycle_id: string
  discipline_id: string
  order: number
  priority: CycleItemPriority
  difficulty?: CycleItemDifficulty | string
  planned_minutes: number
  completed_minutes?: number // Legado mantido para compatibilidade
  status?: string // Legado
  last_studied_at: string | null
  created_at: string
  updated_at: string
}

export interface StudyCycleSession {
  id: string
  cycle_id: string
  cycle_item_id: string
  study_history_id?: string | null
  round_number: number
  minutes_contributed: number
  extra_minutes: number
  discipline_id?: string | null
  is_skip?: boolean
  created_at: string
}

export interface StudyCycleItemWithDetails extends StudyCycleItem {
  discipline: {
    id: string
    name: string
    area: string | null
    color_hex: string | null
  }
}

export interface StudyCycleWithItems extends StudyCycle {
  items: StudyCycleItemWithDetails[]
}

/** Progresso computado de um item dentro da volta atual do ciclo */
export interface CycleItemProgress {
  itemId: string
  disciplineId: string
  disciplineName: string
  disciplineArea: string | null
  disciplineColorHex: string | null
  order: number
  priority: CycleItemPriority
  difficulty: CycleItemDifficulty | string
  plannedMinutes: number
  studiedMinutesInRound: number
  remainingMinutesInRound: number
  extraMinutesInRound: number
  isCompletedInRound: boolean
  isSkippedInRound: boolean
  isCurrent: boolean
  status: CycleItemProgressStatus
  totalStudiedHistoricalMinutes: number
}

/** Visão completa e computada do ciclo rotativo contínuo */
export interface CycleOverview {
  cycle: StudyCycle
  items: CycleItemProgress[]
  totalPlannedMinutesPerRound: number
  totalStudiedMinutesInRound: number
  totalExtraMinutesInRound: number
  roundProgressPercentage: number
  totalHistoricalMinutes: number
  currentRound: number
  totalRoundsDone: number
  currentItem: CycleItemProgress | null
  nextItem: CycleItemProgress | null
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
  contestName?: string | null | undefined
  editalName?: string | null | undefined
  items: {
    disciplineId?: string | undefined
    disciplineName?: string | undefined
    priority?: CycleItemPriority | undefined
    difficulty?: CycleItemDifficulty | undefined
    plannedMinutes: number
  }[]
}

export type UpdateCycleInput = {
  id: string
  name: string
  contestName?: string | null | undefined
  editalName?: string | null | undefined
  items: {
    id?: string | undefined
    disciplineId?: string | undefined
    disciplineName?: string | undefined
    priority?: CycleItemPriority | undefined
    difficulty?: CycleItemDifficulty | undefined
    plannedMinutes: number
    order: number
  }[]
}
