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
  isFinalSprint?: boolean // Modo Reta Final: Desativa penalidades de interleaving
  /**
   * G2.1 (Opção A) — ritmo escolhido no wizard. Molda o TAMANHO dos blocos
   * (fatiamento), nunca a distribuição por pesos, os dias disponíveis ou a
   * soma total. Ausente = comportamento legado (blocos 30–60).
   */
  rhythm?: BlockRhythm | undefined
}

/**
 * G2.1 — ritmo de sessões (mesmo vocabulário do wizard: SessionStyle).
 * `curtas`/`equilibradas`/`longas` usam a tabela canônica abaixo (iguais aos
 * PRESETS de planning-form.ts); `personalizado` usa min/max explícitos.
 */
export type BlockRhythmStyle = "curtas" | "equilibradas" | "longas" | "personalizado"

export interface BlockRhythm {
  style: BlockRhythmStyle
  /** Só usado com style "personalizado" (minutos, min <= max). */
  minMinutes?: number
  /** Só usado com style "personalizado" (minutos, min <= max). */
  maxMinutes?: number
}

/** Tabela canônica de limites por estilo (iguais aos PRESETS do wizard). */
export const RHYTHM_BLOCK_BOUNDS: Record<
  Exclude<BlockRhythmStyle, "personalizado">,
  { min: number; max: number }
> = {
  curtas: { min: 30, max: 60 },
  equilibradas: { min: 45, max: 90 },
  longas: { min: 60, max: 120 },
}

/** Comportamento legado (pré-ritmo): idêntico a `curtas`. */
export const LEGACY_RHYTHM_BOUNDS = { min: 30, max: 60 } as const

const RHYTHM_ABS_MIN = 15
const RHYTHM_ABS_MAX = 240

/**
 * Resolve os limites [min, max] de fatiamento para um ritmo.
 * Retorna null quando inválido (chamador usa o legado + erro honesto no boundary).
 */
export function resolveRhythmBounds(rhythm: BlockRhythm | null | undefined): {
  min: number
  max: number
} | null {
  if (!rhythm) return { ...LEGACY_RHYTHM_BOUNDS }
  if (rhythm.style === "curtas" || rhythm.style === "equilibradas" || rhythm.style === "longas") {
    return { ...RHYTHM_BLOCK_BOUNDS[rhythm.style] }
  }
  if (rhythm.style !== "personalizado") return null
  const min = rhythm.minMinutes
  const max = rhythm.maxMinutes
  if (typeof min !== "number" || typeof max !== "number") return null
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null
  if (min < RHYTHM_ABS_MIN || max > RHYTHM_ABS_MAX || min > max) return null
  return { min, max }
}

export type ParsedRhythm =
  | { ok: true; rhythm: BlockRhythm; bounds: { min: number; max: number }; style: BlockRhythmStyle; explicit: boolean }
  | { ok: false; error: string }

/**
 * G2.1 — valida o ritmo vindo do cliente (payload) no boundary.
 * Ausente/nulo = legado (explicit: false → caminho single-pass bit-idêntico).
 * Estilo fora do enum ou personalizado sem min/max válidos = erro honesto.
 */
export function parseRhythmConfig(raw: unknown): ParsedRhythm {
  if (raw === undefined || raw === null) {
    return {
      ok: true,
      rhythm: { style: "curtas" },
      bounds: { ...LEGACY_RHYTHM_BOUNDS },
      style: "curtas",
      explicit: false,
    }
  }
  if (typeof raw !== "object") return { ok: false, error: "Ritmo de sessões inválido." }
  const style = (raw as { style?: unknown }).style
  if (style !== "curtas" && style !== "equilibradas" && style !== "longas" && style !== "personalizado") {
    return { ok: false, error: "Ritmo de sessões inválido. Escolha entre curtas, equilibradas, longas ou personalizado." }
  }
  const rhythm: BlockRhythm = { style }
  if (style === "personalizado") {
    const min = (raw as { minMinutes?: unknown }).minMinutes
    const max = (raw as { maxMinutes?: unknown }).maxMinutes
    if (typeof min !== "number" || typeof max !== "number") {
      return { ok: false, error: "Ritmo personalizado exige duração mínima e máxima." }
    }
    rhythm.minMinutes = min
    rhythm.maxMinutes = max
  }
  const bounds = resolveRhythmBounds(rhythm)
  if (!bounds) {
    return { ok: false, error: "Ritmo personalizado inválido. A duração mínima não pode ser maior que a máxima." }
  }
  return { ok: true, rhythm, bounds, style, explicit: true }
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
