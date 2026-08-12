// ============================================================================
// FSRS Engine (Free Spaced Repetition Scheduler) — determinístico
//
// Implementação do modelo DSR (Difficulty, Stability, Retrievability) do FSRS,
// conforme a formulação pública do FSRS v4:
//
//   R(t,S) = (1 + t / (9·S))^(-1)                       → retrievability
//   S'(sucesso) = S · (1 + e^w8 · (11−D) · S^(−w9) · (e^(w10·(1−R)) − 1))
//   S'(falha)   = w11 · D^(−w12) · ((S+1)^w13 − 1)
//   D0          = w4 − e^(w5·(R−1)) + 1  (aprox. 4.93 na primeira revisão)
//   D'(sucesso) = D − w6·(g−3)
//   D'(falha)   = D + 1  (aproximação determinística do ramo de dificuldade)
//
// O intervalo é derivado invertendo R para a retenção desejada do usuário:
//   interval = 9·S·(1/retencao_desejada − 1)
//
// Regras de negócio:
//   - NOVAMENTE (grade 1) = não lembrou → passo curto (10 min) e estabilidade de falha
//   - DIFÍCIL (grade 2)   = lembrou com dificuldade → conta como SUCESSO
//   - BOM (grade 3) / FÁCIL (grade 4) = sucesso
//   - MASTERED exige evidência: revisões >= 5, estabilidade >= 21d e 3 acertos seguidos
//   - LAPSO só ocorre quando um item REVISION/MASTERED volta a falhar
// ============================================================================

import {
  FSRS_WEIGHTS,
  FSRS_MINUTES_REVIEW_STEP,
  MASTERY_MIN_CONSECUTIVE,
  MASTERY_MIN_REVIEWS,
  MASTERY_MIN_STABILITY,
} from "@/domain/reviews/models"
import type { ReviewItem, ReviewStage, SrsState } from "@/domain/reviews/models"

export interface FsrsItemSnapshot {
  review_stage: ReviewStage
  stability: number
  difficulty: number
  review_count: number
  consecutive_correct: number
  consecutive_wrong: number
  last_review_at: string | null
  next_review_at: string | null
  lapses_count: number
}

export interface FsrsRating {
  grade: 1 | 2 | 3 | 4
  now?: string
  responseTimeSeconds?: number
}

export interface FsrsSettings {
  desiredRetention: number // 0.80 a 0.95
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 1
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}

/** R atual de um item (dias decorridos desde a última revisão). */
export function currentRetrievability(item: FsrsItemSnapshot, now = new Date()): number {
  if (!item.last_review_at) return 1
  const t = (now.getTime() - new Date(item.last_review_at).getTime()) / (1000 * 3600 * 24)
  return clamp(retrievability(item.stability || 0, Math.max(0, t)), 0, 1)
}

/** Adapta uma linha do banco (review_items) para o snapshot do FSRS. */
export function reviewItemToSnapshot(item: ReviewItem): FsrsItemSnapshot {
  return {
    review_stage: item.review_stage,
    stability: item.stability_score,
    difficulty: item.difficulty,
    review_count: item.review_count,
    consecutive_correct: item.consecutive_correct,
    consecutive_wrong: item.consecutive_wrong,
    last_review_at: item.last_review_at,
    next_review_at: item.next_review_at,
    lapses_count: item.lapses_count,
  }
}

/** Inverte R(t,S) para obter o intervalo em dias na retenção desejada. */
export function intervalForRetention(stability: number, desiredRetention: number): number {
  if (stability <= 0 || desiredRetention <= 0 || desiredRetention >= 1) return 1
  return 9 * stability * (1 / desiredRetention - 1)
}

/** Primeira estabilidade conforme a nota dada (pesos w0..w3 do FSRS). */
export function initialStability(grade: 1 | 2 | 3 | 4): number {
  const index = (grade - 1) as 0 | 1 | 2 | 3
  return FSRS_WEIGHTS[index]
}

export function isLeech(item: { lapses_count: number; consecutive_wrong: number }): boolean {
  return item.lapses_count >= 5 || item.consecutive_wrong >= 4
}

export function isMasteredByEvidence(item: FsrsItemSnapshot): boolean {
  return (
    item.review_stage !== "LAPSED" &&
    item.review_count >= MASTERY_MIN_REVIEWS &&
    item.stability >= MASTERY_MIN_STABILITY &&
    item.consecutive_correct >= MASTERY_MIN_CONSECUTIVE
  )
}

export function memoryStrengthFromStability(stability: number): number {
  return Math.round(clamp(stability, 0, 100))
}

/**
 * Calcula o próximo estado do item com base no FSRS v4.
 * Grade 1 = não lembrou (única falha); grades 2-4 = lembrou (sucesso).
 */
export function scheduleNextState(
  item: FsrsItemSnapshot,
  rating: FsrsRating,
  settings: FsrsSettings = { desiredRetention: 0.9 }
): SrsState {
  const w = FSRS_WEIGHTS
  const now = rating.now ? new Date(rating.now) : new Date()
  const grade = rating.grade
  const retention = clamp(settings.desiredRetention, 0.8, 0.95)

  const firstReview = item.review_count === 0
  const R = currentRetrievability(item, now)
  const D0 = w[4] - Math.exp(w[5] * (R - 1)) + 1

  let stability: number
  let difficulty: number
  let stage: ReviewStage
  let intervalDays: number

  if (grade === 1) {
    // ── Falha (não lembrou) ────────────────────────────────────────────────
    if (firstReview) {
      stability = initialStability(1)
      difficulty = D0
    } else {
      stability = w[11] * Math.pow(difficultyGuard(item.difficulty || D0), -w[12]) * (Math.pow(item.stability + 1, w[13]) - 1)
      stability = Math.max(stability, 0.1)
      difficulty = clamp((item.difficulty || D0) + 1, 1, 10)
    }

    // Item que já estava além do aprendizado volta a LAPSED; novos/itens leves
    // retornam ao aprendizado com passo curto.
    const wasBeyondLearning = item.review_stage === "REVIEW" || item.review_stage === "MASTERED" || item.review_count >= 2
    stage = wasBeyondLearning ? "LAPSED" : "LEARNING"

    intervalDays = FSRS_MINUTES_REVIEW_STEP / (24 * 60) // 10 minutos em dias
  } else {
    // ── Sucesso (Difícil/Bom/Fácil contam como lembrado) ───────────────────
    if (firstReview) {
      stability = initialStability(grade)
      difficulty = D0
    } else {
      const sGrowth =
        Math.exp(w[8]) *
        (11 - difficultyGuard(item.difficulty || D0)) *
        Math.pow(item.stability || 0.1, -w[9]) *
        (Math.exp(w[10] * (1 - R)) - 1)
      stability = clamp(item.stability + item.stability * sGrowth, 0.1, 36500)
      difficulty = clamp(difficultyGuard(item.difficulty || D0) - w[6] * (grade - 3), 1, 10)
    }

    stage = firstReview || item.review_stage === "LEARNING" || item.review_stage === "LAPSED" ? "LEARNING" : "REVIEW"
    intervalDays = intervalForRetention(stability, retention)
  }

  // Intervalo mínimo: 1 dia para sucesso (o passo curto de 10min é só na falha).
  if (grade !== 1) intervalDays = Math.max(1, intervalDays)
  // Só arredonda intervalos ≥ 1 dia; passo de minutos mantém precisão.
  if (grade !== 1) intervalDays = Math.round(intervalDays * 10) / 10

  const next = new Date(now.getTime() + intervalDays * 24 * 3600 * 1000)

  // Contadores persistidos a cada resposta (auto-save da sessão).
  const wasBeyondLearning = item.review_stage === "REVIEW" || item.review_stage === "MASTERED" || item.review_count >= 2
  const reviewCount = item.review_count + 1
  const consecutiveCorrect = grade === 1 ? 0 : item.consecutive_correct + 1
  const consecutiveWrong = grade === 1 ? item.consecutive_wrong + 1 : 0
  const lapsesCount = item.lapses_count + (grade === 1 && wasBeyondLearning ? 1 : 0)

  const nextItem: FsrsItemSnapshot = { ...item, review_count: reviewCount }

  // Estágio final com evidência de retenção.
  if (
    grade !== 1 &&
    stage === "REVIEW" &&
    isMasteredByEvidence({
      ...nextItem,
      stability,
      review_stage: "REVIEW",
      consecutive_correct: consecutiveCorrect,
      consecutive_wrong: consecutiveWrong,
    })
  ) {
    stage = "MASTERED"
  }

  return {
    review_stage: stage,
    stability: Math.round(stability * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
    retrievability: grade === 1 ? R : retention,
    interval_days: intervalDays,
    next_review_at: next.toISOString(),
    memory_strength: memoryStrengthFromStability(stability),
    forget_probability: Math.round((1 - (grade === 1 ? R : retention)) * 100) / 100,
    review_count: reviewCount,
    consecutive_correct: consecutiveCorrect,
    consecutive_wrong: consecutiveWrong,
    lapses_count: lapsesCount,
  }
}

function difficultyGuard(d: number): number {
  return clamp(d, 1, 10)
}