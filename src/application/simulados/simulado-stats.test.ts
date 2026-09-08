import { test } from "node:test"
import assert from "node:assert/strict"

import {
  accuracyOf,
  aggregateSubjects,
  buildSubjectAnalysis,
  compareSimulados,
  computeNetScore,
  computePanelStats,
  effectiveAccuracy,
  findDecliningSubjects,
  findWeakSubjects,
  formatDuration,
  netAccuracyOf,
  performanceBandOf,
  sourceLabel,
  validateRecord,
  wrongsOf,
} from "./simulado-stats.service"
import type { SimuladoRecord } from "@/domain/simulados/types"

function makeRecord(overrides: Partial<SimuladoRecord>): SimuladoRecord {
  return {
    id: "sim-1",
    userId: "user-1",
    name: "Simulado 1",
    examName: "Receita Federal",
    roleName: "Auditor",
    simuladoDate: "2026-09-01",
    source: "TEC",
    sourceCustom: null,
    exam_board: null,  // Required field
    exam_board_custom: null,
    totalQuestions: 100,
    totalCorrect: 78,
    totalWrong: 22,
    totalBlank: 0,
    accuracy: 78,
    timeSpentSeconds: null,
    notes: null,
    scoringRule: "PERCENTUAL",
    penaltyScore: null,
    subjects: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  }
}

// ── 1-3. Percentual, erros e brancos ──────────────────────────────────────
test("percentual: 78/100 = 78%", () => {
  assert.equal(accuracyOf(78, 100), 78)
})

test("percentual: 14/20 = 70%", () => {
  assert.equal(accuracyOf(14, 20), 70)
})

test("percentual: questões 0 retorna null", () => {
  assert.equal(accuracyOf(10, 0), null)
})

test("erros: 100 - 78 - 0 = 22", () => {
  assert.equal(wrongsOf(100, 78, 0), 22)
})

test("erros: 100 - 70 - 10 = 20 (com brancos)", () => {
  assert.equal(wrongsOf(100, 70, 10), 20)
})

test("erros: nunca negativo (acertos > questões)", () => {
  assert.equal(wrongsOf(50, 60, 0), 0)
})

// ── aggregateSubjects: resultado dinâmico por matérias ─────────────────────
test("aggregateSubjects: soma matérias e calcula percentual (60q/48c = 80%)", () => {
  const res = aggregateSubjects([
    { questionsCount: 20, correctCount: 14, wrongCount: 6, blankCount: 0 },
    { questionsCount: 20, correctCount: 16, wrongCount: 4, blankCount: 0 },
    { questionsCount: 20, correctCount: 18, wrongCount: 2, blankCount: 0 },
  ])
  assert.equal(res.totalQuestions, 60)
  assert.equal(res.totalCorrect, 48)
  assert.equal(res.accuracy, 80)
})

test("aggregateSubjects: lista vazia retorna zeros e null", () => {
  const res = aggregateSubjects([])
  assert.equal(res.totalQuestions, 0)
  assert.equal(res.totalCorrect, 0)
  assert.equal(res.accuracy, null)
})

test("aggregateSubjects: com brancos por matéria", () => {
  const res = aggregateSubjects([
    { questionsCount: 30, correctCount: 20, wrongCount: 5, blankCount: 5 },
    { questionsCount: 20, correctCount: 10, wrongCount: 5, blankCount: 5 },
  ])
  assert.equal(res.totalQuestions, 50)
  assert.equal(res.totalCorrect, 30)
  assert.equal(res.totalBlank, 10)
})

// ── validateRecord ─────────────────────────────────────────────────────────
test("validateRecord: inconsistência entre soma de matérias e total", () => {
  const res = validateRecord({
    totalQuestions: 100,
    totalCorrect: 78,
    totalWrong: 22,
    totalBlank: 0,
    subjects: [{ questionsCount: 50 }, { questionsCount: 40 }], // soma 90
  })
  assert.equal(res.ok, true) // sem erro estrutural
  assert.equal(res.subjectsSum, 90) // mas a soma diverge (90 != 100)
})

test("validateRecord: acertos+erros+brancos != questões é erro", () => {
  const res = validateRecord({
    totalQuestions: 100,
    totalCorrect: 70,
    totalWrong: 20,
    totalBlank: 5, // 95 != 100
    subjects: [],
  })
  assert.equal(res.ok, false)
  assert.ok(res.errors.length > 0)
})

// ── Faixas de desempenho centralizadas ────────────────────────────────────
test("faixas: 90% = EXCELENTE, 80% = BOM, 65% = ATENCAO, 50% = FRACO", () => {
  assert.equal(performanceBandOf(90), "EXCELENTE")
  assert.equal(performanceBandOf(85), "EXCELENTE")
  assert.equal(performanceBandOf(80), "BOM")
  assert.equal(performanceBandOf(75), "BOM")
  assert.equal(performanceBandOf(74.9), "ATENCAO")
  assert.equal(performanceBandOf(60), "ATENCAO")
  assert.equal(performanceBandOf(59.9), "FRACO")
  assert.equal(performanceBandOf(0), "FRACO")
})

// ── Estatísticas do painel ─────────────────────────────────────────────────
test("computePanelStats: métricas gerais (média, melhor, pior, evolução)", () => {
  const records = [
    makeRecord({ id: "s1", simuladoDate: "2026-08-01", totalQuestions: 100, totalCorrect: 60, accuracy: 60 }),
    makeRecord({ id: "s2", simuladoDate: "2026-08-15", totalQuestions: 100, totalCorrect: 70, accuracy: 70 }),
    makeRecord({ id: "s3", simuladoDate: "2026-09-01", totalQuestions: 100, totalCorrect: 80, accuracy: 80 }),
  ]
  const stats = computePanelStats(records)
  assert.equal(stats.totalSimulados, 3)
  assert.equal(stats.totalQuestions, 300)
  assert.equal(stats.totalCorrect, 210)
  assert.equal(stats.averageAccuracy, 70)
  assert.equal(stats.bestAccuracy, 80)
  assert.equal(stats.worstAccuracy, 60)
  assert.equal(stats.lastAccuracy, 80)
})

test("computePanelStats: tendência UP quando recente > antigo", () => {
  const records = [
    makeRecord({ id: "s1", simuladoDate: "2026-08-01", accuracy: 50 }),
    makeRecord({ id: "s2", simuladoDate: "2026-08-10", accuracy: 55 }),
    makeRecord({ id: "s3", simuladoDate: "2026-08-20", accuracy: 60 }),
    makeRecord({ id: "s4", simuladoDate: "2026-09-01", accuracy: 65 }),
    makeRecord({ id: "s5", simuladoDate: "2026-09-05", accuracy: 70 }),
  ]
  const stats = computePanelStats(records)
  assert.equal(stats.trend, "UP")
  assert.equal(stats.trendMessage, "Seu desempenho está evoluindo")
})

test("computePanelStats: lista vazia retorna tudo null/0", () => {
  const stats = computePanelStats([])
  assert.equal(stats.totalSimulados, 0)
  assert.equal(stats.averageAccuracy, null)
  assert.equal(stats.trend, null)
})

// ── Análise por matéria ────────────────────────────────────────────────────
test("buildSubjectAnalysis: agrega matéria entre simulados com evolução", () => {
  const records = [
    makeRecord({
      id: "s1",
      subjects: [{ disciplineId: "d1", disciplineName: "Constitucional", questionsCount: 20, correctCount: 11, wrongCount: 9, blankCount: 0, accuracy: 55 }],
    }),
    makeRecord({
      id: "s2",
      subjects: [{ disciplineId: "d1", disciplineName: "Constitucional", questionsCount: 20, correctCount: 15, wrongCount: 5, blankCount: 0, accuracy: 75 }],
    }),
  ]
  const analysis = buildSubjectAnalysis(records)
  assert.equal(analysis.length, 1)
  const subject = analysis[0]!
  assert.equal(subject.disciplineName, "Constitucional")
  assert.equal(subject.totalQuestions, 40)
  assert.equal(subject.totalCorrect, 26)
  assert.equal(subject.accuracy, 65)
  assert.equal(subject.evolutionPp, 20) // 75 - 55 = +20 p.p.
})

test("findWeakSubjects: retorna matérias em FRACO/ATENCAO", () => {
  const analysis = [
    { disciplineId: null, disciplineName: "A", totalQuestions: 100, totalCorrect: 50, accuracy: 50, band: "FRACO" as const, evolutionPp: null, history: [] },
    { disciplineId: null, disciplineName: "B", totalQuestions: 100, totalCorrect: 80, accuracy: 80, band: "BOM" as const, evolutionPp: null, history: [] },
    { disciplineId: null, disciplineName: "C", totalQuestions: 100, totalCorrect: 65, accuracy: 65, band: "ATENCAO" as const, evolutionPp: null, history: [] },
  ]
  const weak = findWeakSubjects(analysis)
  assert.equal(weak.length, 2)
  assert.equal(weak[0]!.disciplineName, "A") // pior primeiro
})

test("findDecliningSubjects: detecta queda nos últimos 3", () => {
  const analysis = [
    {
      disciplineId: null,
      disciplineName: "Contabilidade",
      totalQuestions: 60,
      totalCorrect: 30,
      accuracy: 50,
      band: "FRACO" as const,
      evolutionPp: null,
      history: [
        { simuladoId: "s1", name: "S1", date: "2026-08-01", accuracy: 70 },
        { simuladoId: "s2", name: "S2", date: "2026-08-10", accuracy: 65 },
        { simuladoId: "s3", name: "S3", date: "2026-08-20", accuracy: 60 },
      ],
    },
  ]
  const declining = findDecliningSubjects(analysis, 3)
  assert.equal(declining.length, 1)
  assert.equal(declining[0]!.disciplineName, "Contabilidade")
})

// ── Comparação entre simulados ─────────────────────────────────────────────
test("compareSimulados: delta geral e por matéria", () => {
  const first = makeRecord({
    id: "s1",
    accuracy: 68,
    subjects: [
      { disciplineId: "d1", disciplineName: "Tributário", questionsCount: 20, correctCount: 12, wrongCount: 8, blankCount: 0, accuracy: 60 },
      { disciplineId: "d2", disciplineName: "Português", questionsCount: 20, correctCount: 16, wrongCount: 4, blankCount: 0, accuracy: 80 },
    ],
  })
  const second = makeRecord({
    id: "s2",
    accuracy: 76,
    subjects: [
      { disciplineId: "d1", disciplineName: "Tributário", questionsCount: 20, correctCount: 15, wrongCount: 5, blankCount: 0, accuracy: 75 },
      { disciplineId: "d2", disciplineName: "Português", questionsCount: 20, correctCount: 17, wrongCount: 3, blankCount: 0, accuracy: 85 },
    ],
  })
  const cmp = compareSimulados(first, second)
  assert.equal(cmp.accuracyDeltaPp, 8)
  const trib = cmp.subjects.find((s) => s.disciplineName === "Tributário")!
  assert.equal(trib.deltaPp, 15)
  const port = cmp.subjects.find((s) => s.disciplineName === "Português")!
  assert.equal(port.deltaPp, 5)
})

// ── Regras de pontuação ───────────────────────────────────────────────────
test("effectiveAccuracy: PERCENTUAL usa acertos/questões", () => {
  const acc = effectiveAccuracy({ totalQuestions: 100, totalCorrect: 78, totalWrong: 22, scoringRule: "PERCENTUAL", penaltyScore: null })
  assert.equal(acc, 78)
})

test("effectiveAccuracy: PENALIZACAO usa score informado", () => {
  const acc = effectiveAccuracy({ totalQuestions: 100, totalCorrect: 78, totalWrong: 22, scoringRule: "PENALIZACAO", penaltyScore: 72.5 })
  assert.equal(acc, 72.5)
})

// ── Regra CEBRASPE/CESPE ───────────────────────────────────────────────────
test("CEBRASPE: 70 acertos, 20 erros, 10 brancos = 50 pontos líquidos (50%)", () => {
  const net = computeNetScore({ totalCorrect: 70, totalWrong: 20, scoringRule: "CEBRASPE", penaltyPerWrong: 1 })
  assert.equal(net, 50)
  assert.equal(netAccuracyOf(net, 100), 50)
})

test("CEBRASPE: brancos não descontam pontos", () => {
  // 70 certas, 0 erradas, 30 brancas → 70 pontos
  const net = computeNetScore({ totalCorrect: 70, totalWrong: 0, scoringRule: "CEBRASPE", penaltyPerWrong: 1 })
  assert.equal(net, 70)
})

test("CEBRASPE: com 0 erros o líquido é igual ao bruto", () => {
  const net = computeNetScore({ totalCorrect: 70, totalWrong: 0, scoringRule: "CEBRASPE" })
  assert.equal(net, 70)
  assert.equal(effectiveAccuracy({ totalQuestions: 100, totalCorrect: 70, totalWrong: 0, scoringRule: "CEBRASPE" }), 70)
})

test("CEBRASPE: mais erros que acertos gera pontuação negativa", () => {
  const net = computeNetScore({ totalCorrect: 20, totalWrong: 40, scoringRule: "CEBRASPE", penaltyPerWrong: 1 })
  assert.equal(net, -20)
})

test("CEBRASPE: penalização configurável 0,5 por erro", () => {
  // 70 - (20 * 0.5) = 60
  const net = computeNetScore({ totalCorrect: 70, totalWrong: 20, scoringRule: "CEBRASPE", penaltyPerWrong: 0.5 })
  assert.equal(net, 60)
})

test("CEBRASPE: penalização configurável 2 por erro", () => {
  // 70 - (20 * 2) = 30
  const net = computeNetScore({ totalCorrect: 70, totalWrong: 20, scoringRule: "CEBRASPE", penaltyPerWrong: 2 })
  assert.equal(net, 30)
})

test("CEBRASPE: percentual bruto nunca é substituído", () => {
  const raw = accuracyOf(70, 100)
  const eff = effectiveAccuracy({ totalQuestions: 100, totalCorrect: 70, totalWrong: 20, scoringRule: "CEBRASPE" })
  assert.equal(raw, 70) // bruto
  assert.equal(eff, 50) // líquido
})

test("CEBRASPE: regra PERCENTUAL não é afetada", () => {
  const net = computeNetScore({ totalCorrect: 70, totalWrong: 20, scoringRule: "PERCENTUAL" })
  assert.equal(net, 70)
})

test("CEBRASPE: cálculo por matéria (20q, 14 certas, 4 erradas, 2 brancas = 10 pontos)", () => {
  const net = computeNetScore({ totalCorrect: 14, totalWrong: 4, scoringRule: "CEBRASPE", penaltyPerWrong: 1 })
  assert.equal(net, 10) // 14 - 4 = 10
  assert.equal(accuracyOf(14, 20), 70) // bruto por matéria
})

// ── Utilitários ─────────────────────────────────────────────────────────────
test("formatDuration: 2h15m30s", () => {
  assert.equal(formatDuration(2 * 3600 + 15 * 60 + 30), "02:15:30")
})

test("sourceLabel: OUTRO com custom", () => {
  assert.equal(sourceLabel("OUTRO", "Meu Curso"), "Meu Curso")
  assert.equal(sourceLabel("TEC", null), "TEC Concursos")
})
