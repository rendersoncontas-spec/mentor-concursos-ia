import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { must } from "@/lib/testing/must"

import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"

import {
  buildEvolutionPoints,
  buildSubjectAnalysis,
  computePanelStats,
  describeBottleneck,
  findBottlenecks,
  sortRecordsChronologically,
  sortRecordsRecentFirst,
  trendOfSeries,
} from "./simulado-stats.service"

// G2.10 — evolução geral, evolução por matéria e gargalos (cálculo puro).

function subj(name: string, q: number, c: number, id: string | null = null): SimuladoRecordSubject {
  return {
    disciplineId: id,
    disciplineName: name,
    questionsCount: q,
    correctCount: c,
    wrongCount: q - c,
    blankCount: 0,
    accuracy: Math.round((c / q) * 1000) / 10,
  }
}

function rec(id: string, date: string, q: number, c: number, subjects: SimuladoRecordSubject[] = [], createdAt = `${date}T12:00:00Z`): SimuladoRecord {
  return {
    id,
    userId: "u",
    name: id,
    examName: "",
    roleName: "",
    simuladoDate: date,
    source: "TEC",
    sourceCustom: null,
    exam_board: "FGV",
    exam_board_custom: null,
    totalQuestions: q,
    totalCorrect: c,
    totalWrong: q - c,
    totalBlank: 0,
    accuracy: Math.round((c / q) * 1000) / 10,
    timeSpentSeconds: null,
    notes: null,
    scoringRule: "PERCENTUAL",
    penaltyScore: null,
    subjects,
    createdAt,
    updatedAt: createdAt,
  }
}

describe("ordem cronológica", () => {
  it("empate de data desempata pelo registro e depois pelo id — independente da ordem de entrada", () => {
    const a = rec("b-id", "2026-09-10", 10, 5, [], "2026-09-10T10:00:00Z")
    const b = rec("a-id", "2026-09-10", 10, 6, [], "2026-09-10T10:00:00Z") // mesmo created_at
    const c = rec("c-id", "2026-09-10", 10, 7, [], "2026-09-10T09:00:00Z")
    const d = rec("d-id", "2026-09-01", 10, 8)
    const expected = ["d-id", "c-id", "a-id", "b-id"]
    assert.deepEqual(sortRecordsChronologically([a, b, c, d]).map((r) => r.id), expected)
    assert.deepEqual(sortRecordsChronologically([d, c, b, a]).map((r) => r.id), expected)
    assert.deepEqual(sortRecordsRecentFirst([a, d, b, c]).map((r) => r.id), [...expected].reverse())
  })

  it("estatísticas não dependem da ordem em que os registros chegam", () => {
    const list = [rec("s1", "2026-08-01", 100, 60), rec("s2", "2026-08-15", 100, 70), rec("s3", "2026-09-01", 100, 80)]
    assert.deepEqual(computePanelStats([...list].reverse()), computePanelStats(list))
    assert.deepEqual(buildEvolutionPoints([...list].reverse()).map((p) => p.simuladoId), ["s1", "s2", "s3"])
  })
})

describe("evolução geral", () => {
  it("0 simulados: tudo nulo, sem divisão por zero", () => {
    const s = computePanelStats([])
    assert.equal(s.averageAccuracy, null)
    assert.equal(s.firstAccuracy, null)
    assert.equal(s.firstToLastPp, null)
    assert.equal(s.trend, null)
    assert.deepEqual(buildEvolutionPoints([]), [])
  })

  it("1 simulado: média = resultado, sem variação e sem tendência", () => {
    const s = computePanelStats([rec("s1", "2026-09-01", 100, 72)])
    assert.equal(s.averageAccuracy, 72)
    assert.equal(s.bestAccuracy, 72)
    assert.equal(s.worstAccuracy, 72)
    assert.equal(s.lastAccuracy, 72)
    assert.equal(s.firstAccuracy, 72)
    assert.equal(s.firstToLastPp, null)
    assert.equal(s.trend, null)
  })

  it("2 simulados: há variação primeiro → último, mas não tendência", () => {
    const s = computePanelStats([rec("s1", "2026-09-01", 100, 60), rec("s2", "2026-09-10", 100, 61)])
    assert.equal(s.firstToLastPp, 1)
    assert.equal(s.trend, null)
    assert.equal(s.trendMessage, null)
  })

  it("vários simulados: média ponderada, melhor, pior, último, primeiro→último e tendência", () => {
    const s = computePanelStats([
      rec("s1", "2026-08-01", 100, 58),
      rec("s2", "2026-08-10", 50, 30),
      rec("s3", "2026-08-20", 100, 66),
      rec("s4", "2026-09-01", 100, 70),
    ])
    assert.equal(s.averageAccuracy, 64) // 224 acertos / 350 questões (ponderada)
    assert.equal(s.bestAccuracy, 70)
    assert.equal(s.worstAccuracy, 58)
    assert.equal(s.lastAccuracy, 70)
    assert.equal(s.firstToLastPp, 12)
    assert.equal(s.trend, "UP") // média(60,66,70) − 58 = +7,3
  })

  it("trendOfSeries: limiar de 2 p.p. e mínimo de 3 pontos", () => {
    assert.equal(trendOfSeries([]), null)
    assert.equal(trendOfSeries([70, 50]), null)
    assert.equal(trendOfSeries([70, 80, 72]), "STABLE")
    assert.equal(trendOfSeries([70, 80, 67]), "DOWN")
  })
})

describe("evolução por disciplina", () => {
  const records = [
    rec("s1", "2026-08-01", 40, 26, [subj("Contabilidade", 20, 10, "ct"), subj("Português", 20, 16, "pt")]),
    rec("s2", "2026-08-15", 20, 12, [subj("Contabilidade", 20, 12, "ct")]), // Português ausente
    rec("s3", "2026-09-01", 40, 30, [subj("Contabilidade", 20, 13, "ct"), subj("Português", 20, 17, "pt")]),
  ]

  it("uma disciplina ausente em um simulado não vira 0% nesse simulado", () => {
    const pt = must(buildSubjectAnalysis(records).find((s) => s.disciplineId === "pt"))
    assert.equal(pt.simuladosCount, 2)
    assert.deepEqual(pt.history.map((h) => h.simuladoId), ["s1", "s3"])
    assert.equal(pt.trend, null, "2 pontos não bastam para tendência")
  })

  it("média, primeiro, último, melhor, pior, evolução e tendência por matéria", () => {
    const ct = must(buildSubjectAnalysis(records).find((s) => s.disciplineId === "ct"))
    assert.equal(ct.simuladosCount, 3)
    assert.equal(ct.accuracy, 58.3) // 35/60
    assert.equal(ct.firstAccuracy, 50)
    assert.equal(ct.lastAccuracy, 65)
    assert.equal(ct.bestAccuracy, 65)
    assert.equal(ct.worstAccuracy, 50)
    assert.equal(ct.evolutionPp, 15)
    assert.equal(ct.trend, "UP")
  })

  it("várias disciplinas ordenadas da pior para a melhor, com desempate pelo nome", () => {
    const list = buildSubjectAnalysis([rec("s1", "2026-09-01", 40, 20, [subj("B", 20, 10), subj("A", 20, 10)])])
    assert.deepEqual(list.map((s) => s.disciplineName), ["A", "B"])
  })

  it("simulado sem nenhuma matéria detalhada não gera análise por matéria", () => {
    assert.deepEqual(buildSubjectAnalysis([rec("s1", "2026-09-01", 100, 70)]), [])
  })
})

describe("gargalos", () => {
  it("aponta matéria abaixo da média geral, com frase calculada", () => {
    const records = [
      rec("s1", "2026-08-01", 60, 44, [subj("Contabilidade", 20, 12), subj("Português", 20, 17), subj("Constitucional", 20, 15)]),
      rec("s2", "2026-09-01", 60, 46, [subj("Contabilidade", 20, 13), subj("Português", 20, 17), subj("Constitucional", 20, 16)]),
    ]
    const overall = computePanelStats(records).averageAccuracy
    const report = findBottlenecks(buildSubjectAnalysis(records), overall)
    assert.equal(report.primary?.disciplineName, "Contabilidade")
    assert.ok(report.primary?.reasons.includes("BELOW_AVERAGE"))
    assert.equal(report.primary?.lowData, false)
    assert.equal(
      describeBottleneck(must(report.primary), overall),
      "Contabilidade — média 63%, abaixo da sua média geral de 75%",
    )
    assert.ok(!report.items.some((i) => i.disciplineName === "Português"))
  })

  it("queda recente ≥ 5 p.p. é apontada mesmo com média boa", () => {
    const records = [
      rec("s1", "2026-08-01", 20, 18, [subj("Português", 20, 18)]),
      rec("s2", "2026-09-01", 20, 16, [subj("Português", 20, 16)]),
    ]
    const r = findBottlenecks(buildSubjectAnalysis(records), 85)
    assert.deepEqual(r.items[0]?.reasons, ["RECENT_DROP"])
    assert.equal(r.items[0]?.recentDropPp, 10)
  })

  it("baixo aproveitamento (< 60%) é apontado; poucos dados ficam marcados como preliminares", () => {
    const records = [rec("s1", "2026-09-01", 20, 10, [subj("Tributário", 20, 10)])]
    const r = findBottlenecks(buildSubjectAnalysis(records), 50)
    assert.deepEqual(r.items[0]?.reasons, ["LOW_PERFORMANCE"])
    assert.equal(r.items[0]?.lowData, true)
    assert.match(describeBottleneck(must(r.items[0]), 50), /baseado em 1 simulado/)
  })

  it("amostra pequena (< 5 questões) não é avaliada; sem média geral, sem 'abaixo da média'", () => {
    const small = findBottlenecks(buildSubjectAnalysis([rec("s1", "2026-09-01", 4, 0, [subj("X", 4, 0)])]), 80)
    assert.equal(small.primary, null)
    const noOverall = findBottlenecks(buildSubjectAnalysis([rec("s1", "2026-09-01", 20, 14, [subj("Y", 20, 14)])]), null)
    assert.equal(noOverall.primary, null)
  })

  it("nenhuma matéria → nenhum gargalo", () => {
    assert.deepEqual(findBottlenecks([], 70), { overallAccuracy: 70, primary: null, items: [] })
  })
})
