// ============================================================================
// Implementação da porta ReviewScheduler com a biblioteca ts-fsrs (MIT,
// open-spaced-repetition) — decisão D7.
//
// Nada de fórmula própria aqui: este arquivo só traduz o estado guardado em
// `review_items` para o formato da biblioteca e de volta. Determinístico:
// `enable_fuzz` fica desligado (padrão) e o instante vem sempre por parâmetro.
//
// Mapa de estados: NEW/LEARNING/REVIEW/RELEARNING ↔ State.New/Learning/Review/
// Relearning. Mapa de notas: 1..4 ↔ Rating.Again/Hard/Good/Easy.
// ============================================================================

import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from "ts-fsrs"

import type { ReviewGrade, ReviewMemory, ReviewState } from "@/domain/reviews/models"
import {
  DEFAULT_DESIRED_RETENTION,
  type ReviewGradeForecast,
  type ReviewScheduleInput,
  type ReviewScheduleResult,
  type ReviewScheduler,
} from "@/domain/reviews/review-scheduler"

const DAY_MS = 24 * 60 * 60 * 1000

const STATE_TO_FSRS: Record<ReviewState, State> = {
  NEW: State.New,
  LEARNING: State.Learning,
  REVIEW: State.Review,
  RELEARNING: State.Relearning,
}

const FSRS_TO_STATE: Record<State, ReviewState> = {
  [State.New]: "NEW",
  [State.Learning]: "LEARNING",
  [State.Review]: "REVIEW",
  [State.Relearning]: "RELEARNING",
}

const GRADE_TO_RATING: Record<ReviewGrade, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
}

/** Uma instância por retenção pedida (a biblioteca guarda os parâmetros). */
const instances = new Map<number, FSRS>()

function engine(desiredRetention: number): FSRS {
  const key = Math.round(desiredRetention * 1000) / 1000
  const cached = instances.get(key)
  if (cached) return cached
  const created = fsrs(generatorParameters({ request_retention: key }))
  instances.set(key, created)
  return created
}

function toCard(memory: ReviewMemory): Card {
  const card: Card = {
    due: new Date(memory.dueAt),
    stability: memory.stability,
    difficulty: memory.difficulty,
    // Campo marcado como deprecado na biblioteca: ela deriva o tempo decorrido
    // de `last_review` + `now`, então não é a fonte de nada aqui.
    elapsed_days: 0,
    scheduled_days: memory.scheduledDays,
    learning_steps: memory.learningSteps,
    reps: memory.reps,
    lapses: memory.lapses,
    state: STATE_TO_FSRS[memory.state],
  }
  if (memory.lastReviewAt) card.last_review = new Date(memory.lastReviewAt)
  return card
}

function fromCard(card: Card): ReviewMemory {
  return {
    state: FSRS_TO_STATE[card.state],
    stability: round(card.stability, 4),
    difficulty: round(card.difficulty, 4),
    scheduledDays: round(card.scheduled_days, 4),
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewAt: card.last_review ? card.last_review.toISOString() : null,
    dueAt: card.due.toISOString(),
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Dias decorridos desde a última revisão (calculado aqui, não pela biblioteca). */
function elapsedDaysOf(memory: ReviewMemory, now: Date): number {
  if (!memory.lastReviewAt) return 0
  const elapsed = (now.getTime() - new Date(memory.lastReviewAt).getTime()) / DAY_MS
  return round(Math.max(0, elapsed), 4)
}

export class FsrsReviewScheduler implements ReviewScheduler {
  newMemory(now: string): ReviewMemory {
    // Vence agora: o item entra na fila do dia sem intervalo inventado.
    return fromCard(createEmptyCard(new Date(now)))
  }

  schedule(input: ReviewScheduleInput): ReviewScheduleResult {
    const now = new Date(input.now)
    const retention = input.desiredRetention ?? DEFAULT_DESIRED_RETENTION
    const before = input.memory
    const { card } = engine(retention).next(toCard(before), now, GRADE_TO_RATING[input.grade])
    const after = fromCard(card)

    return {
      memory: after,
      event: {
        grade: input.grade,
        reviewedAt: now.toISOString(),
        elapsedDays: elapsedDaysOf(before, now),
        scheduledDays: after.scheduledDays,
        early: new Date(before.dueAt).getTime() > now.getTime(),
        stateBefore: before.state,
        stateAfter: after.state,
        stabilityBefore: before.stability,
        stabilityAfter: after.stability,
        difficultyBefore: before.difficulty,
        difficultyAfter: after.difficulty,
        dueBefore: new Date(before.dueAt).toISOString(),
        dueAfter: after.dueAt,
      },
    }
  }

  forecast(memory: ReviewMemory, now: string, desiredRetention?: number): ReviewGradeForecast[] {
    const retention = desiredRetention ?? DEFAULT_DESIRED_RETENTION
    const preview = engine(retention).repeat(toCard(memory), new Date(now))
    return ([1, 2, 3, 4] as const).map((grade) => {
      const next = fromCard(preview[GRADE_TO_RATING[grade]].card)
      return { grade, dueAt: next.dueAt, scheduledDays: next.scheduledDays }
    })
  }
}

/** Instância única usada pela aplicação. */
export const reviewScheduler: ReviewScheduler = new FsrsReviewScheduler()
