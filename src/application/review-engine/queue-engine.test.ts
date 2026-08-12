/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  applyFilters,
  buildAnalysesAndRecommendations,
  buildCalendar,
  buildLoadForecast,
  riskScore,
  smartQueueOrder,
} from "./queue-engine"
import type { ReviewItem, ReviewSettings } from "@/domain/reviews/models"

const NOW = new Date("2026-08-11T12:00:00.000Z")
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * 24 * 3600 * 1000).toISOString()

function item(partial: Partial<ReviewItem> & { id: string }): ReviewItem {
  return {
    user_id: "u1",
    discipline_id: "d1",
    topic_id: "t1",
    source_type: "FLASHCARD",
    source_id: partial.id,
    review_stage: "NEW",
    ease_factor: 2.5,
    stability_score: 0,
    memory_strength: 0,
    forget_probability: 0,
    last_review_at: null,
    next_review_at: null,
    review_count: 0,
    lapses_count: 0,
    base_priority: 1,
    card_type: "QA",
    card_front: null,
    card_back: null,
    tags: [],
    difficulty: 4.93,
    last_interval_days: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    is_suspended: false,
    is_favorite: false,
    deleted_at: null,
    created_at: iso(-10),
    updated_at: iso(-10),
    ...partial,
  }
}

// ─── Fila inteligente ────────────────────────────────────────────────────────

test("smartQueueOrder: atrasados primeiro, por maior atraso", () => {
  const overdue5 = item({ id: "a", next_review_at: iso(-5), review_count: 2, review_stage: "REVIEW", stability_score: 10 })
  const overdue1 = item({ id: "b", next_review_at: iso(-1), review_count: 2, review_stage: "REVIEW", stability_score: 10 })
  const order = smartQueueOrder([overdue1, overdue5], NOW).map((i) => i.id)
  assert.deepEqual(order, ["a", "b"])
})

test("smartQueueOrder: vencidos hoje vêm depois dos atrasados e antes de tudo", () => {
  const overdue = item({ id: "a", next_review_at: iso(-2), review_count: 1, review_stage: "LEARNING", stability_score: 5 })
  const dueToday = item({ id: "b", next_review_at: iso(0), review_count: 1, review_stage: "REVIEW", stability_score: 5 })
  const tomorrow = item({ id: "c", next_review_at: iso(1), review_count: 1, review_stage: "REVIEW", stability_score: 5 })
  const order = smartQueueOrder([tomorrow, dueToday, overdue], NOW).map((i) => i.id)
  assert.deepEqual(order, ["a", "b", "c"])
})

test("smartQueueOrder: maior risco de esquecimento primeiro em estado de revisão", () => {
  const risky = item({ id: "a", next_review_at: iso(739), review_count: 2, review_stage: "REVIEW", stability_score: 1, last_review_at: iso(-30) })
  const safe = item({ id: "c", next_review_at: iso(1), review_count: 2, review_stage: "REVIEW", stability_score: 10, last_review_at: iso(-1) })
  const order = smartQueueOrder([safe, risky], NOW).map((i) => i.id)
  assert.deepEqual(order, ["a", "c"])
})

test("smartQueueOrder: novas ficam por último respeitando prioridade de base", () => {
  const low = item({ id: "n1", base_priority: 1 })
  const high = item({ id: "n2", base_priority: 9 })
  const order = smartQueueOrder([low, high], NOW).map((i) => i.id)
  assert.deepEqual(order, ["n2", "n1"])
})

test("applyFilters: suspenso e excluído saem da fila", () => {
  const suspended = item({ id: "s", is_suspended: true })
  const deleted = item({ id: "d", deleted_at: iso(-1) })
  const normal = item({ id: "n" })
  const r = applyFilters([suspended, deleted, normal], { mode: "ALL" }, NOW).map((i) => i.id)
  assert.deepEqual(r, ["n"])
})

test("applyFilters: modo OVERDUE filtra só atrasadas", () => {
  const overdue = item({ id: "a", next_review_at: iso(-1), review_count: 1, review_stage: "REVIEW" })
  const dueToday = item({ id: "b", next_review_at: iso(0), review_count: 1, review_stage: "REVIEW" })
  const r = applyFilters([dueToday, overdue], { mode: "OVERDUE" }, NOW).map((i) => i.id)
  assert.deepEqual(r, ["a"])
})

test("applyFilters: modo NEW filtra só não revisadas", () => {
  const newCard = item({ id: "a" })
  const reviewed = item({ id: "b", review_count: 1, next_review_at: iso(2), review_stage: "REVIEW" })
  const r = applyFilters([reviewed, newCard], { mode: "NEW" }, NOW).map((i) => i.id)
  assert.deepEqual(r, ["a"])
})

test("applyFilters: modo LAPSED filtra só lapsos", () => {
  const lapsed = item({ id: "a", review_stage: "LAPSED", lapses_count: 2, review_count: 3 })
  const normal = item({ id: "b", review_count: 3, review_stage: "REVIEW" })
  const r = applyFilters([normal, lapsed], { mode: "LAPSED" }, NOW).map((i) => i.id)
  assert.deepEqual(r, ["a"])
})

test("applyFilters: filtros disciplina/tópico", () => {
  const other1 = item({ id: "a", discipline_id: "d2" })
  const other2 = item({ id: "b", topic_id: "t9" })
  const match = item({ id: "c", discipline_id: "d1", topic_id: "t1" })
  const r = applyFilters([other1, other2, match], { mode: "ALL", disciplineId: "d1", topicId: "t1" }, NOW).map((i) => i.id)
  assert.deepEqual(r, ["c"])
})

test("applyFilters: revisão rápida limita quantidade", () => {
  const cards = [1, 2, 3, 4, 5].map((n) => item({ id: `c${n}` }))
  const r = applyFilters(cards, { mode: "RAPIDA", count: 3 }, NOW)
  assert.equal(r.length, 3)
})

// ─── Risco ───────────────────────────────────────────────────────────────────

test("riskScore: maior para quem tem lapso e dificuldade alta", () => {
  const easy = item({ id: "a", difficulty: 2, lapses_count: 0, consecutive_wrong: 0, review_count: 1, review_stage: "REVIEW", stability_score: 20, last_review_at: iso(-2) })
  const hard = item({ id: "b", difficulty: 8, lapses_count: 4, consecutive_wrong: 2, review_count: 1, review_stage: "REVIEW", stability_score: 20, last_review_at: iso(-2) })
  assert.ok(riskScore(hard, NOW) > riskScore(easy, NOW))
})

// ─── Previsão de carga / calendário ──────────────────────────────────────────

test("buildLoadForecast: conta próximos vencimentos e estima minutos", () => {
  const cards = [
    item({ id: "a", next_review_at: iso(0), review_count: 1 }),
    item({ id: "b", next_review_at: iso(0), review_count: 1 }),
    item({ id: "c", next_review_at: iso(1), review_count: 1 }),
    item({ id: "d", next_review_at: iso(8), review_count: 1 }),
    item({ id: "e", next_review_at: null }),
  ]
  const f = buildLoadForecast(cards, 120, NOW)
  assert.equal(f.todayCount, 2)
  assert.equal(f.todayMinutes, 4)
  assert.equal(f.tomorrowCount, 1)
  assert.equal(f.week7Count, 3)
  assert.equal(f.week30Count, 4)
  assert.equal(f.loadWarning, null)
})

test("buildCalendar: 30 dias com contagem vinda do banco", () => {
  const cards = [
    item({ id: "a", next_review_at: iso(0), review_count: 1 }),
    item({ id: "b", next_review_at: iso(0), review_count: 1 }),
    item({ id: "c", next_review_at: iso(2), review_count: 1 }),
  ]
  const cal = buildCalendar(cards, 30, NOW)
  assert.equal(cal.length, 31)
  assert.equal(cal.find((d) => d.date === NOW.toISOString().slice(0, 10))!.count, 2)
  assert.equal(cal[2]?.count ?? -1, 1)
})

// ─── Análises e recomendações (dados reais) ──────────────────────────────────

const SETTINGS: ReviewSettings = {
  user_id: "u1",
  new_cards_per_day: 20,
  max_reviews_per_day: 200,
  desired_retention: 0.9,
  max_daily_minutes: null,
  review_profile: "EQUILIBRADO",
  exam_date: null,
  reta_final: false,
  auto_add_errors: true,
}

const BASE_INPUT = {
  retention: 0.72,
  overdue: 12,
  dueToday: 4,
  newCount: 15,
  leech: 2,
  lapsed: 1,
  byDiscipline: [],
  byTopic: [],
  evolution: [],
  forecastToday: 20,
  mastered: 5,
  settings: SETTINGS,
}

test("análises: retenção baixa é apontada com dados reais", () => {
  const { analyses, recommendations } = buildAnalysesAndRecommendations(BASE_INPUT)
  const low = analyses.find((a) => a.includes("abaixo da desejada"))
  assert.ok(low, "esperava análise de retenção baixa")
  assert.ok(analyses.some((a) => a.includes("2 cartão")))
  assert.ok(recommendations.some((r) => r.includes("12 revisão")))
})

test("recomendações: carga alta e limite de novos são avisados", () => {
  const { recommendations } = buildAnalysesAndRecommendations({
    ...BASE_INPUT,
    retention: 0.92,
    overdue: 0,
    dueToday: 0,
    newCount: 20,
    forecastToday: 150,
  })
  assert.ok(recommendations.some((r) => r.includes("limite diário de novos")))
  assert.ok(recommendations.some((r) => r.includes("Carga alta hoje")))
})

test("análises: tópicos fracos por disciplina são listados", () => {
  const { analyses } = buildAnalysesAndRecommendations({
    ...BASE_INPUT,
    byTopic: [
      { topicName: "Crase", disciplineName: "Português", retention: 0.6, total: 8 },
      { topicName: "Orçamento", disciplineName: "Adm", retention: 0.9, total: 3 },
    ],
  })
  assert.ok(analyses.some((a) => a.includes("Crase")))
})

test("análises: evolução semanal é comparada", () => {
  const { analyses } = buildAnalysesAndRecommendations({
    ...BASE_INPUT,
    evolution: [{ retention: 0.8 }, { retention: 0.72 }],
  })
  assert.ok(analyses.some((a) => a.includes("caiu 8 pontos")))
})