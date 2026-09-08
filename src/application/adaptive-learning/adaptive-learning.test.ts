/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  calculateRetentionEMA,
  evaluateRetentionHysteresis,
  calculateLearningHealthScore,
  generateAdaptiveDecisions,
  type DisciplineAnalytics,
  type AnalyticsContext,
} from "./adaptive-learning.service"

const TEST_DISCIPLINE: DisciplineAnalytics = {
  id: "d1",
  name: "Português",
  weight: 5,
  performanceScore: 80,
  retentionRate: 75,
  retentionHistory: [70, 72, 68, 70, 75, 78],
  questionsAnsweredCount: 42,
  lapsesCount: 0,
  daysSinceLastStudy: 1,
}

const LOW_DISCIPLINE: DisciplineAnalytics = {
  id: "d2",
  name: "Raciocínio Lógico",
  weight: 5,
  performanceScore: 65,
  retentionRate: 60,
  retentionHistory: [60, 58, 62, 55, 60, 58],
  questionsAnsweredCount: 38,
  lapsesCount: 2,
  daysSinceLastStudy: 2,
}

const HIGH_DISCIPLINE: DisciplineAnalytics = {
  id: "d3",
  name: "Matemática",
  weight: 5,
  performanceScore: 90,
  retentionRate: 92,
  retentionHistory: [90, 91, 93, 92, 94, 91],
  questionsAnsweredCount: 85,
  lapsesCount: 0,
  daysSinceLastStudy: 3,
}

const CONTEXT_LOW_RETENTION: AnalyticsContext = {
  userId: "u1",
  disciplines: [TEST_DISCIPLINE, LOW_DISCIPLINE, HIGH_DISCIPLINE],
  userStats: {
    averageEnergy: 4,
    weeklyHoursStudied: 25,
    currentStreak: 10,
    totalBacklogReviews: 0,
  },
}

// ─── EMA ───────────────────────────────────────────────────────────────────────

test("calculateRetentionEMA: single point defaults to itself", () => {
  assert.equal(calculateRetentionEMA([75]), 75)
})

test("calculateRetentionEMA: two points simple average", () => {
  assert.equal(calculateRetentionEMA([80, 70], 0.5), 75)
})

test("calculateRetentionEMA: default alpha 0.35", () => {
  assert.equal(calculateRetentionEMA([80, 70, 75], 0.35), 75.97)
})

test("calculateRetentionEMA: weighted smoothing", () => {
  assert.equal(calculateRetentionEMA([60, 90], 0.8), 84)
})

test("calculateRetentionEMA: empty array returns 0", () => {
  assert.equal(calculateRetentionEMA([]), 0)
})

test("calculateRetentionEMA: zero values filtered", () => {
  assert.equal(calculateRetentionEMA([0, 0, 100]), 100)
})

// ─── Histerese ────────────────────────────────────────────────────────────────

test("evaluateRetentionHysteresis: 2 consecutive low windows increases weight", () => {
  const disc = { ...LOW_DISCIPLINE, retentionHistory: [60, 58, 62, 55, 60] }
  const eval_ = evaluateRetentionHysteresis(disc, 0.35, 2)
  assert.equal(eval_.smoothedRetention, 59.33)
  assert.equal(eval_.consecutiveLowWindows, 6)
  assert.equal(eval_.shouldIncreaseWeight, true)
})

test("evaluateRetentionHysteresis: high volume required for weight decrease", () => {
  const disc = { ...HIGH_DISCIPLINE, retentionHistory: [92, 94, 91, 93, 95, 93] }
  const eval_ = evaluateRetentionHysteresis(disc, 0.35, 2)
  assert.equal(eval_.smoothedRetention, 92.79)
  assert.equal(eval_.shouldDecreaseWeight, true)
})

test("evaluateRetentionHysteresis: oscilacao semanal (efeito ioio) NAO aciona ajuste", () => {
  // Retenção alternando 40% / 90% semana a semana: nenhuma janela consecutiva
  const disc = { ...LOW_DISCIPLINE, retentionHistory: [40, 90, 40, 90, 40], retentionRate: 90 }
  const eval_ = evaluateRetentionHysteresis(disc, 0.35, 2)
  assert.equal(eval_.consecutiveLowWindows, 0)
  assert.equal(eval_.consecutiveHighWindows, 1)
  assert.equal(eval_.shouldIncreaseWeight, false)
  assert.equal(eval_.shouldDecreaseWeight, false)
})

test("evaluateRetentionHysteresis: 1 janela baixa isolada NAO aciona reforco", () => {
  // Histórico alto e estável, com UMA única queda isolada na janela atual (60%)
  const disc = { ...LOW_DISCIPLINE, retentionHistory: [85, 88, 82, 90, 80], retentionRate: 60 }
  const eval_ = evaluateRetentionHysteresis(disc, 0.35, 2)
  assert.equal(eval_.consecutiveLowWindows, 1)
  assert.equal(eval_.shouldIncreaseWeight, false)
})

// ─── Learning Health Score ─────────────────────────────────────────────────────

test("calculateLearningHealthScore: integration calculates all components", () => {
  const lhs = calculateLearningHealthScore(CONTEXT_LOW_RETENTION)
  assert.equal(lhs.score, 82)
  assert.equal(lhs.statusLabel, "Boa evolução")
  assert.equal(lhs.burnoutRisk, "LOW")
})

test("calculateLearningHealthScore: HIGH risk with low energy and high hours", () => {
  const context: AnalyticsContext = {
    userId: "u3",
    disciplines: [HIGH_DISCIPLINE],
    userStats: {
      averageEnergy: 1,
      weeklyHoursStudied: 35,
      currentStreak: 3,
      totalBacklogReviews: 0,
    },
  }
  const lhs = calculateLearningHealthScore(context)
  assert.equal(lhs.burnoutRisk, "HIGH")
})

// ─── Adaptive Decisions ────────────────────────────────────────────────────────

test("generateAdaptiveDecisions: creates weight increase for low retention", () => {
  const decisions = generateAdaptiveDecisions(CONTEXT_LOW_RETENTION)
  const increase = decisions.find((d) => d.recommendationType === "WEIGHT_CHANGE" && d.delta! > 0)
  assert.ok(increase)
  assert.equal(increase!.disciplineId, "d2")
  assert.equal(increase!.delta, 0.2)
})

test("generateAdaptiveDecisions: creates weight decrease for high retention", () => {
  const decisions = generateAdaptiveDecisions(CONTEXT_LOW_RETENTION)
  const decrease = decisions.find((d) => d.recommendationType === "WEIGHT_CHANGE" && d.delta! < 0)
  assert.ok(decrease)
  assert.equal(decrease!.disciplineId, "d3")
  assert.equal(decrease!.delta, -0.15)
})
