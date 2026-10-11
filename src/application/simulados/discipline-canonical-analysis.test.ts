import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { buildDisciplineIdentity, EMPTY_DISCIPLINE_IDENTITY } from "@/domain/disciplines/discipline-identity"
import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"
import { must } from "@/lib/testing/must"

import { canonicalizeSimuladoRecords } from "./simulado-identity"
import { buildSubjectAnalysis, findBottlenecks } from "./simulado-stats.service"
import { buildStudyPerformance, type StudySessionLite } from "./study-performance"

// G2.12 — análises (simulados, gargalos, estudo × desempenho) pela identidade
// canônica da disciplina. Sem vínculo no catálogo, nada muda.

const TODAY = "2026-10-03"
const X = "x-canonica"
const A = "a-alias"
const B = "b-alias"
const RL = "rl"
const RLEM = "rl-e-m"
const RLM = "rl-m"

const IDENTITY = buildDisciplineIdentity({
  catalog: [
    { id: X, name: "Matéria X" },
    { id: A, name: "Matéria X (A)", canonicalDisciplineId: X },
    { id: B, name: "Matéria X — B", canonicalDisciplineId: X },
    { id: RL, name: "Raciocínio Lógico" },
    { id: RLEM, name: "Raciocínio Lógico e Matemático" },
    { id: RLM, name: "Raciocínio Lógico-Matemático", canonicalDisciplineId: RLEM },
  ],
})

function subj(id: string | null, name: string, q: number, c: number): SimuladoRecordSubject {
  return { disciplineId: id, disciplineName: name, questionsCount: q, correctCount: c, wrongCount: q - c, blankCount: 0, accuracy: Math.round((c / q) * 1000) / 10 }
}

function rec(id: string, date: string, subjects: SimuladoRecordSubject[]): SimuladoRecord {
  const q = subjects.reduce((a, s) => a + s.questionsCount, 0)
  const c = subjects.reduce((a, s) => a + s.correctCount, 0)
  return {
    id, userId: "u", name: id, examName: "", roleName: "", simuladoDate: date, source: "TEC", sourceCustom: null,
    exam_board: "FGV", exam_board_custom: null, totalQuestions: q, totalCorrect: c, totalWrong: q - c, totalBlank: 0,
    accuracy: q ? Math.round((c / q) * 1000) / 10 : null, timeSpentSeconds: null, notes: null, scoringRule: "PERCENTUAL",
    penaltyScore: null, subjects, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`,
  }
}

function ses(id: string, disciplineId: string | null, date: string, minutes: number): StudySessionLite {
  return { id, disciplineId, startedAt: `${date}T15:00:00Z`, durationMinutes: minutes }
}

describe("simulados na identidade canônica", () => {
  it("matéria alias vira a canônica (id e nome); o registro original não muda", () => {
    const records = [rec("s1", "2026-09-20", [subj(RLM, "Raciocínio Lógico-Matemático", 10, 7)])]
    const frozen = JSON.stringify(records)
    const out = canonicalizeSimuladoRecords(records, IDENTITY)
    assert.equal(out[0]?.subjects[0]?.disciplineId, RLEM)
    assert.equal(out[0]?.subjects[0]?.disciplineName, "Raciocínio Lógico e Matemático")
    assert.equal(JSON.stringify(records), frozen, "histórico/edição seguem com o id gravado")
  })

  it("alias e canônica no MESMO simulado são somados; totais do simulado não mudam", () => {
    const r = rec("s1", "2026-09-20", [subj(A, "X (A)", 10, 6), subj(X, "X", 10, 9), subj(RL, "RL", 5, 5)])
    const out = must(canonicalizeSimuladoRecords([r], IDENTITY)[0])
    assert.equal(out.subjects.length, 2)
    const x = must(out.subjects.find((s) => s.disciplineId === X))
    assert.equal(x.questionsCount, 20)
    assert.equal(x.correctCount, 15)
    assert.equal(x.wrongCount, 5)
    assert.equal(x.accuracy, 75)
    assert.equal(out.totalQuestions, r.totalQuestions)
    assert.equal(out.accuracy, r.accuracy)
  })

  it("simulado antigo no alias + simulado novo na canônica = uma evolução só", () => {
    const records = [
      rec("antigo", "2026-08-01", [subj(RLM, "RLM", 20, 10)]),
      rec("novo", "2026-09-20", [subj(RLEM, "RL e M", 20, 16)]),
    ]
    const separate = buildSubjectAnalysis(records)
    assert.equal(separate.length, 2, "sem identidade: duas linhas (comportamento anterior)")
    const joined = buildSubjectAnalysis(canonicalizeSimuladoRecords(records, IDENTITY))
    assert.equal(joined.length, 1)
    const a = must(joined[0])
    assert.equal(a.disciplineId, RLEM)
    assert.equal(a.simuladosCount, 2)
    assert.equal(a.firstAccuracy, 50)
    assert.equal(a.lastAccuracy, 80)
    assert.equal(a.evolutionPp, 30)
  })

  it("matérias diferentes de nome parecido NÃO se juntam (RL × RL e M)", () => {
    const records = [rec("s1", "2026-09-20", [subj(RL, "RL", 10, 5), subj(RLEM, "RL e M", 10, 8)])]
    const analysis = buildSubjectAnalysis(canonicalizeSimuladoRecords(records, IDENTITY))
    assert.equal(analysis.length, 2)
  })

  it("gargalos usam a mesma identidade (sem regra paralela)", () => {
    const records = [
      rec("s1", "2026-08-01", [subj(A, "A", 20, 6), subj(RL, "RL", 20, 18)]),
      rec("s2", "2026-09-01", [subj(B, "B", 20, 6), subj(RL, "RL", 20, 18)]),
      rec("s3", "2026-09-20", [subj(X, "X", 20, 6), subj(RL, "RL", 20, 18)]),
    ]
    const analysis = buildSubjectAnalysis(canonicalizeSimuladoRecords(records, IDENTITY))
    const report = findBottlenecks(analysis, 60)
    const xEntries = analysis.filter((s) => s.disciplineId === X)
    assert.equal(xEntries.length, 1)
    assert.equal(must(xEntries[0]).simuladosCount, 3)
    assert.ok(JSON.stringify(report).includes("Matéria X"))
  })

  it("sem identidade (ou vazia) devolve os mesmos registros", () => {
    const records = [rec("s1", "2026-09-20", [subj(RLM, "RLM", 10, 7)])]
    assert.equal(canonicalizeSimuladoRecords(records, null), records)
    assert.equal(canonicalizeSimuladoRecords(records, EMPTY_DISCIPLINE_IDENTITY), records)
  })
})

describe("estudo × desempenho na identidade canônica", () => {
  it("Estudo em A + Simulado em B (A e B aliases de X) aparecem juntos em X", () => {
    const report = buildStudyPerformance({
      records: [rec("s1", "2026-09-10", [subj(B, "Matéria X — B", 20, 12)]), rec("s2", "2026-09-25", [subj(B, "Matéria X — B", 20, 16)])],
      sessions: [ses("e1", A, "2026-09-15", 240), ses("e2", A, "2026-09-22", 240)],
      disciplineNames: new Map(),
      identity: IDENTITY,
      periodKey: "4w",
      todayKey: TODAY,
    })
    assert.equal(report.rows.length, 1, "uma linha só: X")
    const row = must(report.rows[0])
    assert.equal(row.disciplineId, X)
    assert.equal(row.disciplineName, "Matéria X")
    assert.equal(row.studyMinutes, 480)
    assert.equal(row.simuladosCount, 2)
    assert.equal(row.evolutionPp, 20)
    assert.equal(row.mergedNames.length, 2)
    assert.ok(row.mergedNames.includes("Matéria X (A)") && row.mergedNames.includes("Matéria X — B"))
  })

  it("sem identidade, estudo em A e simulado em B ficam separados (comportamento anterior)", () => {
    const report = buildStudyPerformance({
      records: [rec("s1", "2026-09-10", [subj(B, "B", 20, 12)])],
      sessions: [ses("e1", A, "2026-09-15", 240)],
      disciplineNames: new Map(),
      periodKey: "4w",
      todayKey: TODAY,
    })
    assert.equal(report.rows.length, 2)
    assert.ok(report.rows.every((r) => r.mergedNames.length === 0))
  })

  it("estudo no alias e na canônica somam; total geral não muda", () => {
    const sessions = [ses("e1", RLM, "2026-09-15", 60), ses("e2", RLEM, "2026-09-16", 90), ses("e3", RL, "2026-09-17", 30)]
    const report = buildStudyPerformance({ records: [], sessions, disciplineNames: new Map(), identity: IDENTITY, periodKey: "4w", todayKey: TODAY })
    assert.equal(report.totalStudyMinutes, 180)
    assert.equal(must(report.rows.find((r) => r.disciplineId === RLEM)).studyMinutes, 150)
    assert.equal(must(report.rows.find((r) => r.disciplineId === RL)).studyMinutes, 30, "RL continua separada")
    assert.equal(report.rows.some((r) => r.disciplineId === RLM), false)
  })

  it("nome pessoal (custom_name) da canônica aparece na análise", () => {
    const identity = buildDisciplineIdentity({
      catalog: [{ id: X, name: "Matéria X" }, { id: A, name: "A", canonicalDisciplineId: X }],
      personal: [{ disciplineId: X, customName: "Minha X" }],
    })
    const report = buildStudyPerformance({ records: [], sessions: [ses("e1", A, "2026-09-15", 60)], disciplineNames: new Map(), identity, periodKey: "4w", todayKey: TODAY })
    assert.equal(must(report.rows[0]).disciplineName, "Minha X")
  })
})

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8")

  it("tela de Simulados: análises pela cópia canônica; lista/edição pelos registros gravados", () => {
    const src = read("src/features/simulados/components/simulados-view.tsx")
    assert.match(src, /canonicalizeSimuladoRecords\(records, identity\)/)
    assert.match(src, /buildSubjectAnalysis\(filteredAnalysisRecords\)/)
    assert.match(src, /subjectIdentityKey\(s\) === disciplineFilter/)
    assert.doesNotMatch(src, /buildSubjectAnalysis\(filteredRecords\)/)
    assert.match(src, /setIdentity\(res\.identity \?\? EMPTY_DISCIPLINE_IDENTITY\)/)
  })

  it("estudo × desempenho carrega a identidade uma vez e não duplica a leitura dos simulados", () => {
    const src = read("src/application/simulados/study-performance.action.ts")
    assert.match(src, /loadDisciplineIdentity\(supabase, userId, ids\)/)
    assert.match(src, /getSimuladoRecordsAction\(\{ skipIdentity: true \}\)/)
    assert.match(src, /identity: identity\.data/)
  })

  it("lista de simulados devolve a identidade sem derrubar a tela se ela falhar", () => {
    const src = read("src/application/simulados/simulado-records.actions.ts")
    assert.match(src, /loadDisciplineIdentity\(supabase, userId, subjectIds\)/)
    assert.match(src, /if \(!loaded\.error\) identity = loaded\.data/)
  })

  it("agrupamento por matéria usa a chave única de identidade", () => {
    const src = read("src/application/simulados/simulado-stats.service.ts")
    assert.match(src, /const key = subjectIdentityKey\(subject\)/)
  })
})
