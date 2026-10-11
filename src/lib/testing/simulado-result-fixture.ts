import type { SimuladoQuestionResult, SimuladoResultPayload } from "@/domain/simulados/types"

/**
 * G2.22 — resultado de simulado SINTÉTICO para o harness de
 * `SimuladoResultView` (contraste e estados positivo/atenção/negativo).
 * Cobre de propósito todos os estados visuais: acerto, erro, em branco,
 * questão marcada, os três tipos de insight e as três tendências.
 * Nenhum dado pessoal; enunciados fictícios.
 */

export type SimuladoResultFixtureKind = "high" | "low"

function question(i: number, overrides: Partial<SimuladoQuestionResult>): SimuladoQuestionResult {
  return {
    questionId: `q-e2e-${i}`,
    orderIndex: i,
    statement: `Questão fictícia ${i + 1}: assinale a alternativa correta sobre o tema de estudo.`,
    alternatives: [
      { label: "A", text: "Primeira alternativa fictícia." },
      { label: "B", text: "Segunda alternativa fictícia." },
      { label: "C", text: "Terceira alternativa fictícia." },
      { label: "D", text: "Quarta alternativa fictícia." },
    ],
    isCertoErrado: false,
    disciplineId: "d0a1b2c3-0001-4000-8000-000000000001",
    disciplineName: "Língua Portuguesa",
    topicId: null,
    topicName: "Concordância",
    selectedAnswer: "B",
    correctAnswer: "B",
    explanation: "Explicação fictícia do gabarito.",
    isCorrect: true,
    isMarked: false,
    answered: true,
    responseTimeSeconds: 74,
    difficultyLabel: "Média",
    ...overrides,
  }
}

export function buildSimuladoResultFixture(kind: SimuladoResultFixtureKind): SimuladoResultPayload {
  const high = kind === "high"
  const totalQuestions = 20
  const totalCorrect = high ? 17 : 8
  const totalBlank = high ? 1 : 3
  const totalWrong = totalQuestions - totalCorrect - totalBlank
  const accuracy = Math.round((totalCorrect / totalQuestions) * 1000) / 10
  return {
    header: {
      id: "5e1d0000-00e2-4000-8000-000000000001",
      name: high ? "Simulado de revisão — Português e Contabilidade" : "Simulado diagnóstico — Contabilidade",
      examName: "Receita Federal",
      roleName: "Auditor Fiscal",
      examBoard: "FGV",
      mode: "COMPLETO",
      status: "FINISHED",
      simuladoDate: "2026-10-01",
      startedAt: "2026-10-01T12:00:00.000Z",
      finishedAt: "2026-10-01T13:10:00.000Z",
      timeSpentSeconds: 70 * 60,
      durationLimitSeconds: null,
      totalQuestions,
      totalCorrect,
      totalWrong,
      totalBlank,
      accuracy,
      score: high ? "EXCELENTE" : "BAIXO",
      avgTimePerQuestionSeconds: 210,
      difficulty: "TODAS",
    },
    byDiscipline: [
      { disciplineId: "d0a1b2c3-0001-4000-8000-000000000001", disciplineName: "Língua Portuguesa", questions: 10, correct: high ? 9 : 5, wrong: high ? 1 : 4, blank: high ? 0 : 1, accuracy: high ? 90 : 50 },
      { disciplineId: "d0a1b2c3-0002-4000-8000-000000000002", disciplineName: "Contabilidade Geral", questions: 10, correct: high ? 8 : 3, wrong: high ? 1 : 5, blank: high ? 1 : 2, accuracy: high ? 80 : 30 },
    ],
    byTopic: [
      { topicId: null, topicName: "Concordância", disciplineName: "Língua Portuguesa", questions: 5, correct: high ? 5 : 3, accuracy: high ? 100 : 60 },
      { topicId: null, topicName: "Balanço patrimonial", disciplineName: "Contabilidade Geral", questions: 5, correct: high ? 4 : 1, accuracy: high ? 80 : 20 },
    ],
    questions: [
      question(0, {}),
      question(1, { selectedAnswer: "A", correctAnswer: "C", isCorrect: false, isMarked: true, disciplineName: "Contabilidade Geral", topicName: "Balanço patrimonial" }),
      question(2, { selectedAnswer: null, isCorrect: null, answered: false, responseTimeSeconds: null }),
    ],
    timeStats: { totalSeconds: 70 * 60, avgPerQuestionSeconds: 210, avgPerCorrectSeconds: 180, avgPerWrongSeconds: 260 },
    markedCount: 1,
    insights: [
      { severity: "positive", message: "Melhor resultado em Língua Portuguesa até agora." },
      { severity: "warning", message: "Contabilidade Geral ficou abaixo da sua média." },
      { severity: "info", message: "Você deixou questões em branco; revise o tempo por questão." },
    ],
    comparison: [],
    trend: high ? { accuracy: "UP", correct: "UP", time: "STABLE" } : { accuracy: "DOWN", correct: "STABLE", time: "SLOWER" },
    bests: {
      bestAccuracy: { value: 85, simuladoId: "5e1d0000-00e2-4000-8000-000000000001", name: "Simulado de revisão — Português e Contabilidade" },
      bestCorrect: null,
      fastestTime: null,
      bestByDiscipline: null,
    },
    previousAvgAccuracy: 64,
  }
}
