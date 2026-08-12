import { test } from "node:test"
import assert from "node:assert/strict"
import {
  currentRetrievability,
  isLeech,
  isMasteredByEvidence,
  memoryStrengthFromStability,
  scheduleNextState,
  type FsrsItemSnapshot,
} from "./fsrs-engine"
import { FSRS_D0, MASTERY_MIN_CONSECUTIVE, MASTERY_MIN_REVIEWS, MASTERY_MIN_STABILITY } from "@/domain/reviews/models"

const NOW = new Date("2026-08-11T12:00:00.000Z")

function snapshot(partial: Partial<FsrsItemSnapshot> = {}): FsrsItemSnapshot {
  return {
    review_stage: "NEW",
    stability: 0,
    difficulty: FSRS_D0,
    review_count: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    last_review_at: null,
    next_review_at: null,
    lapses_count: 0,
    ...partial,
  }
}

// ─── Retenção / recuperabilidade ─────────────────────────────────────────────

test("retrievability: item novo tem R = 1", () => {
  assert.equal(currentRetrievability(snapshot(), NOW), 1)
})

test("retrievability: R decai com o tempo para estabilidade finita", () => {
  const item = snapshot({
    review_count: 1,
    stability: 10,
    last_review_at: new Date(NOW.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
  })
  const R = currentRetrievability(item, NOW)
  assert.ok(R > 0 && R < 1)
  const expected = 1 / (1 + 5 / (9 * 10))
  assert.ok(Math.abs(R - expected) < 0.001)
})

// ─── Primeira revisão ────────────────────────────────────────────────────────

test("primeira revisão: NOVAMENTE → LEARNING com passo de 10 min", () => {
  const next = scheduleNextState(snapshot(), { grade: 1, now: NOW.toISOString() })
  assert.equal(next.review_stage, "LEARNING")
  assert.equal(next.interval_days, 10 / (24 * 60))
  assert.ok(new Date(next.next_review_at).getTime() - NOW.getTime() === 10 * 60 * 1000)
  assert.equal(next.difficulty > FSRS_D0 - 0.001 && next.difficulty < FSRS_D0 + 0.001, true)
})

test("primeira revisão: DIFÍCIL → LEARNING com intervalo >= 1 dia", () => {
  const next = scheduleNextState(snapshot(), { grade: 2, now: NOW.toISOString() })
  assert.equal(next.review_stage, "LEARNING")
  assert.ok(next.interval_days >= 1)
  assert.equal(next.stability, 0.6)
})

test("primeira revisão: FÁCIL tem intervalo maior que DIFÍCIL", () => {
  const hard = scheduleNextState(snapshot(), { grade: 2, now: NOW.toISOString() })
  const easy = scheduleNextState(snapshot(), { grade: 4, now: NOW.toISOString() })
  assert.ok(easy.interval_days > hard.interval_days)
})

// ─── Revisões de revisão (R < 1) ─────────────────────────────────────────────

test("revisão recordada: estabilidade cresce e D varia conforme a nota", () => {
  const base = snapshot({
    review_stage: "REVIEW",
    review_count: 3,
    stability: 30,
    difficulty: 5,
    last_review_at: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
  })
  const good = scheduleNextState(base, { grade: 3, now: NOW.toISOString() })
  assert.ok(good.stability > 30, `esperado S > 30, recebido ${good.stability}`)
  assert.equal(good.review_stage, "REVIEW")
  const interval = 9 * good.stability * (1 / 0.9 - 1)
  assert.ok(Math.abs(good.interval_days - interval) < 0.5, `intervalo ${good.interval_days} vs ${interval}`)
  assert.equal(good.difficulty, 5)
})

test("revisão NOVAMENTE de item REVISION → LAPSED com falha de estabilidade", () => {
  const base = snapshot({
    review_stage: "REVIEW",
    review_count: 3,
    stability: 30,
    difficulty: 5,
    last_review_at: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
  })
  const next = scheduleNextState(base, { grade: 1, now: NOW.toISOString() })
  assert.equal(next.review_stage, "LAPSED")
  assert.ok(next.stability < 30)
  assert.equal(next.difficulty, 6)
})

test("NOVIDADE com review_count >= 2 que falha vira LAPSED", () => {
  const base = snapshot({
    review_stage: "LEARNING",
    review_count: 2,
    stability: 3,
    difficulty: 4,
    last_review_at: new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
  })
  const next = scheduleNextState(base, { grade: 1, now: NOW.toISOString() })
  assert.equal(next.review_stage, "LAPSED")
})

// ─── Evidência de domínio ────────────────────────────────────────────────────

test("item com 5+ revisões, estabilidade 21+ dias e 3 acertos seguidos vira MASTERED", () => {
  const base = snapshot({
    review_stage: "REVIEW",
    review_count: 4,
    stability: 25,
    difficulty: 4,
    consecutive_correct: 2,
    last_review_at: new Date(NOW.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
  })
  const next = scheduleNextState(base, { grade: 3, now: NOW.toISOString() })
  assert.equal(next.review_stage, "MASTERED")
})

test("item dominado que falha volta a LAPSED", () => {
  const base = snapshot({
    review_stage: "MASTERED",
    review_count: 12,
    stability: 60,
    difficulty: 3,
    consecutive_correct: 5,
    last_review_at: new Date(NOW.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
  })
  const next = scheduleNextState(base, { grade: 1, now: NOW.toISOString() })
  assert.equal(next.review_stage, "LAPSED")
})

test("DIFÍCIL conta como lembrado (sucesso) — acumula consecutivos", () => {
  const base = snapshot({
    review_stage: "REVIEW",
    review_count: 4,
    stability: 22,
    difficulty: 5,
    consecutive_correct: 2,
    last_review_at: new Date(NOW.getTime() - 6 * 24 * 3600 * 1000).toISOString(),
  })
  const next = scheduleNextState(base, { grade: 2, now: NOW.toISOString() })
  assert.equal(next.review_stage, "MASTERED") // 2+3 consecutivos + 5 revisões + S>=21
})

test("DIFÍCIL não é lapso/repetição: intervalo cresce", () => {
  const base = snapshot({
    review_stage: "REVIEW",
    review_count: 5,
    stability: 15,
    difficulty: 6,
    consecutive_correct: 0,
    last_review_at: new Date(NOW.getTime() - 3 * 24 * 3600 * 1000).toISOString(),
  })
  const next = scheduleNextState(base, { grade: 2, now: NOW.toISOString() })
  assert.equal(next.review_stage, "REVIEW")
  assert.ok(next.interval_days > 1)
})

// ─── Leech ───────────────────────────────────────────────────────────────────

test("leech: 5+ lapsos ou 4+ erros consecutivos", () => {
  assert.equal(isLeech({ lapses_count: 5, consecutive_wrong: 0 }), true)
  assert.equal(isLeech({ lapses_count: 4, consecutive_wrong: 4 }), true)
  assert.equal(isLeech({ lapses_count: 4, consecutive_wrong: 3 }), false)
})

// ─── Dominância por evidência (função pura) ─────────────────────────────────

test("isMasteredByEvidence respeita critérios mínimos", () => {
  const good = snapshot({ review_count: MASTERY_MIN_REVIEWS, stability: MASTERY_MIN_STABILITY, consecutive_correct: MASTERY_MIN_CONSECUTIVE })
  assert.equal(isMasteredByEvidence(good), true)
  const few = snapshot({ review_count: MASTERY_MIN_REVIEWS - 1, stability: MASTERY_MIN_STABILITY, consecutive_correct: MASTERY_MIN_CONSECUTIVE })
  assert.equal(isMasteredByEvidence(few), false)
  const lowStability = snapshot({ review_count: MASTERY_MIN_REVIEWS, stability: MASTERY_MIN_STABILITY - 0.1, consecutive_correct: MASTERY_MIN_CONSECUTIVE })
  assert.equal(isMasteredByEvidence(lowStability), false)
  const noConsecutive = snapshot({ review_count: MASTERY_MIN_REVIEWS, stability: MASTERY_MIN_STABILITY, consecutive_correct: MASTERY_MIN_CONSECUTIVE - 1 })
  assert.equal(isMasteredByEvidence(noConsecutive), false)
  const lapsed = snapshot({ review_stage: "LAPSED", review_count: 8, stability: 30, consecutive_correct: 4 })
  assert.equal(isMasteredByEvidence(lapsed), false)
})

// ─── Força da memória (display) ──────────────────────────────────────────────

test("memoryStrengthFromStability: clamp em 0..100", () => {
  assert.equal(memoryStrengthFromStability(-5), 0)
  assert.equal(memoryStrengthFromStability(150), 100)
  assert.equal(memoryStrengthFromStability(40), 40)
})

// ─── Retenção desejada altera intervalo ──────────────────────────────────────

test("retenção desejada maior → intervalo menor", () => {
  const base = snapshot({
    review_stage: "REVIEW",
    review_count: 3,
    stability: 30,
    difficulty: 5,
    last_review_at: new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
  })
  const low = scheduleNextState(base, { grade: 3, now: NOW.toISOString() }, { desiredRetention: 0.85 })
  const high = scheduleNextState(base, { grade: 3, now: NOW.toISOString() }, { desiredRetention: 0.95 })
  assert.ok(high.interval_days < low.interval_days)
})