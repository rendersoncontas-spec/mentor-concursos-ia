// ============================================================================
// Tipos do módulo de Revisões (Mentor Concursos IA) — Sprint 14
// Reutiliza a estrutura da Sprint 6 (review_items/review_queue/review_history)
// e adiciona flashcards, sessões persistentes e configurações.
// ============================================================================

export type ReviewStage = "NEW" | "LEARNING" | "REVIEW" | "MASTERED" | "LAPSED"
export type ReviewSourceType = "QUESTION" | "TOPIC" | "FLASHCARD" | "STUDY_SESSION"

export type ReviewGrade = 1 | 2 | 3 | 4

export const REVIEW_GRADE_LABEL: Record<ReviewGrade, string> = {
  1: "Novamente",
  2: "Difícil",
  3: "Bom",
  4: "Fácil",
}

export const REVIEW_GRADE_TAG = { 1: "again", 2: "hard", 3: "good", 4: "easy" } as const

export type FlashcardType = "QA" | "CLOZE" | "TRUE_FALSE" | "MULTIPLE_CHOICE" | "OPEN" | "QUESTION"

export const FLASHCARD_TYPE_LABEL: Record<FlashcardType, string> = {
  QA: "Pergunta → Resposta",
  CLOZE: "Lacuna (Cloze)",
  TRUE_FALSE: "Verdadeiro ou Falso",
  MULTIPLE_CHOICE: "Múltipla Escolha",
  OPEN: "Pergunta Aberta",
  QUESTION: "Questão de Concurso → Explicação",
}

export type ReviewProfile = "EQUILIBRADO" | "ALTA_RETENCAO" | "RETA_FINAL" | "LEVE"

export const REVIEW_PROFILE_LABEL: Record<ReviewProfile, string> = {
  EQUILIBRADO: "Concurso — Equilibrado",
  ALTA_RETENCAO: "Concurso — Alta Retenção",
  RETA_FINAL: "Concurso — Reta Final",
  LEVE: "Revisão Leve",
}

/** Estudo de memória conforme o FSRS v4 (determinístico). */
export interface SrsState {
  review_stage: ReviewStage
  stability: number        // S em dias
  difficulty: number       // D (1 a 10)
  retrievability: number   // R (0 a 1) no momento
  interval_days: number    // próximo intervalo (dias; <1 para minutos)
  next_review_at: string
  memory_strength: number  // 0 a 100 (display)
  forget_probability: number
  /** Contadores para a ação persistir junto (auto-save). */
  review_count: number
  consecutive_correct: number
  consecutive_wrong: number
  lapses_count: number
}

/** Linha da tabela review_items. */
export interface ReviewItem {
  id: string
  user_id: string
  discipline_id: string
  topic_id: string | null

  source_type: ReviewSourceType
  source_id: string

  review_stage: ReviewStage
  ease_factor: number
  stability_score: number
  memory_strength: number
  forget_probability: number

  last_review_at: string | null
  next_review_at: string | null
  review_count: number
  lapses_count: number

  base_priority: number

  card_type: FlashcardType
  card_front: string | null
  card_back: string | null
  tags: string[]
  difficulty: number
  last_interval_days: number
  consecutive_correct: number
  consecutive_wrong: number
  is_suspended: boolean
  is_favorite: boolean
  deleted_at: string | null

  created_at: string
  updated_at: string
}

/** payload de resposta para o player (sem gabarito até revelar). */
export interface ReviewCardFront {
  reviewItemId: string
  cardType: FlashcardType
  front: string
  disciplineName: string
  topicName: string | null
  lapsesCount: number
  isFavorite: boolean
  reviewCount: number
  /** Riscos exibidos no player (leech etc). */
  flag: "LEECH" | "LAPSE_RISK" | null
}

export interface ReviewCardReveal extends ReviewCardFront {
  back: string
  /** Apenas para MULTIPLE_CHOICE: alternativas ao lado do gabarito. */
  alternatives: { label: string; text: string; correct: boolean }[]
  /** Intervalos previstos pelo FSRS para cada botão (min/dias reais). */
  intervals: { grade: ReviewGrade; label: string; preview: string }[]
}

export type ReviewSessionMode =
  | "ALL"          // 🔥 Revisar agora (fila inteligente completa)
  | "OVERDUE"      // ⏰ Atrasadas
  | "TODAY"        // 📅 De hoje
  | "NEW"          // 🆕 Novos
  | "HARD"         // 🧠 Difíceis (dificuldade alta / muitas falhas)
  | "AT_RISK"      // ⚠️ Em risco de esquecimento
  | "ERRORS"       // ❌ Meus erros (lapsos de questões)
  | "MASTERED"     // 🏆 Dominados
  | "LAPSED"       // 💥 Lapsos
  | "RAPIDA"       // ⚡ Revisão rápida
  | "DISCIPLINE"   // 📚 Por disciplina
  | "TOPIC"        // 🎯 Por tópico

export interface ReviewSession {
  id: string
  user_id: string
  status: "ACTIVE" | "COMPLETED" | "DISCARDED"
  mode: ReviewSessionMode
  filters: Record<string, unknown>
  queue_ids: string[]
  answered_ids: string[]
  cards_total: number
  started_at: string
  finished_at: string | null
}

export type ReviewFilters = {
  mode: ReviewSessionMode
  disciplineId?: string | null
  topicId?: string | null
  count?: number | null // Revisão rápida
  maxReviews?: number | null // teto do dia (aplicado pelo serviço)
}

export interface ReviewSettings {
  user_id: string
  new_cards_per_day: number
  max_reviews_per_day: number
  desired_retention: number
  max_daily_minutes: number | null
  review_profile: ReviewProfile
  exam_date: string | null
  reta_final: boolean
  auto_add_errors: boolean
}

export interface ReviewReport {
  cardsReviewed: number
  again: number
  hard: number
  good: number
  easy: number
  remembered: number
  retention: number
  totalSeconds: number
  avgSecondsPerCard: number
  worstTopics: { name: string; disciplineName: string; retention: number; reviewed: number }[]
}

export interface RetentionPoint {
  label: string
  retention: number | null
  reviewed: number
}

export interface ReviewCalendarDay {
  date: string
  count: number
}

export interface ReviewLoadForecast {
  todayCount: number
  todayMinutes: number
  tomorrowCount: number
  tomorrowMinutes: number
  week7Count: number
  week7Minutes: number
  week30Count: number
  week30Minutes: number
  loadWarning: string | null
}

export interface ReviewDisciplineSummary {
  disciplineId: string
  name: string
  total: number
  due: number
  retention: number | null
}

export interface ReviewTopicSummary {
  topicId: string | null
  topicName: string
  disciplineName: string
  total: number
  retention: number | null
  lastReviewAt: string | null
  nextReviewAt: string | null
}

export interface LeechItem {
  reviewItemId: string
  cardType: FlashcardType
  front: string
  disciplineName: string
  topicName: string | null
  lapses: number
  consecutiveWrong: number
  reviewCount: number
}

/** Payload completo do dashboard (todos os números vêm do banco). */
export interface ReviewDashboardData {
  retention: number | null
  doneToday: number
  overdue: number
  dueToday: number
  newCount: number
  hardCount: number
  atRiskCount: number
  errorCount: number
  funnel: Record<ReviewStage, number>
  totalItems: number
  calendar: ReviewCalendarDay[]
  forecast: ReviewLoadForecast
  byDiscipline: ReviewDisciplineSummary[]
  byTopic: ReviewTopicSummary[]
  leech: LeechItem[]
  reteFinalActive: boolean
  hasActiveSession: boolean
  retentionByPeriod: { d7: number | null; d30: number | null; d90: number | null; d180: number | null; d365: number | null }
  evolution: RetentionPoint[]
  analyses: string[]
  recommendations: string[]
  recentReviews: { label: string; retention: number | null; reviewed: number }[]
}

// ─── Convenções compartilhadas ─────────────────────────────────────────────────────────

export const FSRS_WEIGHTS = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
] as const

export const FSRS_D0 = 4.93
export const FSRS_MINUTES_REVIEW_STEP = 10 // passo de re-aprendizagem quando "Novamente"
export const MASTERY_MIN_REVIEWS = 5
export const MASTERY_MIN_STABILITY = 21 // dias
export const MASTERY_MIN_CONSECUTIVE = 3
export const LEECH_LAPSES = 5
export const LEECH_CONSECUTIVE_WRONG = 4