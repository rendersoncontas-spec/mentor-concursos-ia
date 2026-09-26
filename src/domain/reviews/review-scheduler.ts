// ============================================================================
// Porta de domínio do agendador de revisões (decisão D7).
//
// O resto do sistema fala SOMENTE com esta interface: nenhuma fórmula, peso ou
// detalhe do FSRS aparece em serviços, actions, repositório ou UI. A
// implementação real (biblioteca ts-fsrs) vive em
// src/infrastructure/reviews/fsrs-scheduler.ts.
// ============================================================================

import type { ReviewGrade, ReviewMemory, ReviewState } from "./models"

/** Retenção pretendida (probabilidade de lembrar no vencimento). Padrão da biblioteca. */
export const DEFAULT_DESIRED_RETENTION = 0.9

/**
 * Tudo o que aconteceu numa resposta — o suficiente para reproduzir o cálculo
 * depois, sem recorrer ao estado atual do item.
 */
export interface ReviewScheduleEvent {
  grade: ReviewGrade
  reviewedAt: string
  /** Dias decorridos entre a última revisão e esta (0 na primeira). */
  elapsedDays: number
  /** Intervalo em dias agendado por esta resposta (0 quando o passo é em minutos). */
  scheduledDays: number
  /** A resposta veio antes do vencimento. */
  early: boolean
  stateBefore: ReviewState
  stateAfter: ReviewState
  stabilityBefore: number
  stabilityAfter: number
  difficultyBefore: number
  difficultyAfter: number
  dueBefore: string
  dueAfter: string
}

export interface ReviewScheduleInput {
  memory: ReviewMemory
  grade: ReviewGrade
  /** Momento da resposta (ISO). Nunca usar `new Date()` dentro do agendador. */
  now: string
  desiredRetention?: number
}

export interface ReviewScheduleResult {
  memory: ReviewMemory
  event: ReviewScheduleEvent
}

export interface ReviewGradeForecast {
  grade: ReviewGrade
  dueAt: string
  scheduledDays: number
}

export interface ReviewScheduler {
  /** Estado inicial de um item recém-adicionado: vence agora, sem histórico. */
  newMemory(now: string): ReviewMemory
  /** Aplica a nota e devolve o novo estado + o evento correspondente. */
  schedule(input: ReviewScheduleInput): ReviewScheduleResult
  /** Quando o item voltaria para cada nota, sem alterar nada. */
  forecast(memory: ReviewMemory, now: string, desiredRetention?: number): ReviewGradeForecast[]
}
