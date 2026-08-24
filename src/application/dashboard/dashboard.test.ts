import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { getStartOfWeek } from "@/application/study-analytics/utils"
import type { PerformanceByPeriod } from "@/domain/dashboard/dashboard.types"

describe("Dashboard Performance By Period Engine", () => {
  it("calcula corretamente métricas para os 5 períodos com dados distribuídos no tempo", () => {
    const now = new Date()
    const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeekMs = getStartOfWeek(now, 1).getTime()
    const startOfMonthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const startOfYearMs = new Date(now.getFullYear(), 0, 1).getTime()

    // Amostras de tentativas em diferentes datas
    const attempts = [
      // Hoje: 2 acertos, 1 erro
      { id: "1", correct: true, created_at: new Date(startOfTodayMs + 3600000).toISOString() },
      { id: "2", correct: true, created_at: new Date(startOfTodayMs + 7200000).toISOString() },
      { id: "3", correct: false, created_at: new Date(startOfTodayMs + 10800000).toISOString() },
    ]

    // Amostras de sessões no histórico
    const rawHistory = [
      // Sessão de hoje: 5 respondidas, 4 certas
      {
        started_at: new Date(startOfTodayMs + 1800000).toISOString(),
        metadata: { questions_answered: 5, questions_correct: 4 },
      },
    ]

    const periodThresholds = [
      { key: "HOJE" as const, minMs: startOfTodayMs },
      { key: "SEMANA" as const, minMs: startOfWeekMs },
      { key: "MES" as const, minMs: startOfMonthMs },
      { key: "ANO" as const, minMs: startOfYearMs },
      { key: "TOTAL" as const, minMs: 0 },
    ]

    const performanceByPeriod: PerformanceByPeriod = {
      HOJE: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      SEMANA: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      MES: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      ANO: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      TOTAL: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
    }

    for (const p of periodThresholds) {
      let pTotal = 0
      let pCorrect = 0

      for (const a of attempts) {
        const d = new Date(a.created_at).getTime()
        if (d >= p.minMs) {
          pTotal += 1
          if (a.correct) pCorrect += 1
        }
      }

      for (const session of rawHistory) {
        const d = new Date(session.started_at).getTime()
        if (d >= p.minMs) {
          const meta = session.metadata || {}
          const answered = Number(meta.questions_answered || 0)
          const correct = Number(meta.questions_correct || 0)
          if (answered > 0) {
            pTotal += answered
            pCorrect += Math.min(answered, Math.max(0, correct))
          }
        }
      }

      const pWrong = Math.max(0, pTotal - pCorrect)
      const pAccuracy = pTotal > 0 ? Math.round((pCorrect / pTotal) * 100) : 0

      performanceByPeriod[p.key] = {
        totalQuestions: pTotal,
        correctQuestions: pCorrect,
        wrongQuestions: pWrong,
        accuracyPercentage: pAccuracy,
      }
    }

    // Hoje: 3 tentativas (2 acertos) + 5 na sessão (4 acertos) = 8 total, 6 acertos, 2 erros, 75%
    assert.equal(performanceByPeriod.HOJE.totalQuestions, 8)
    assert.equal(performanceByPeriod.HOJE.correctQuestions, 6)
    assert.equal(performanceByPeriod.HOJE.wrongQuestions, 2)
    assert.equal(performanceByPeriod.HOJE.accuracyPercentage, 75)

    assert.equal(performanceByPeriod.SEMANA.totalQuestions, 8)
    assert.equal(performanceByPeriod.TOTAL.totalQuestions, 8)
  })

  it("retorna zeros quando não há questões no período selecionado", () => {
    const performanceByPeriod: PerformanceByPeriod = {
      HOJE: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      SEMANA: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      MES: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      ANO: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      TOTAL: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
    }

    assert.equal(performanceByPeriod.HOJE.totalQuestions, 0)
    assert.equal(performanceByPeriod.HOJE.correctQuestions, 0)
    assert.equal(performanceByPeriod.HOJE.wrongQuestions, 0)
    assert.equal(performanceByPeriod.HOJE.accuracyPercentage, 0)
  })
})
