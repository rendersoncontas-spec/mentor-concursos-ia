import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import type { SimuladoRecord, SimuladoRecordSubject } from "@/domain/simulados/types"
import { must } from "@/lib/testing/must"

import {
  aggregateStudyMinutes,
  buildStudyPerformance,
  classifyStudyPerformance,
  HIGH_STUDY_MINUTES_PER_WEEK,
  LOW_STUDY_MINUTES_PER_WEEK,
  periodWindow,
  type StudyPerformancePeriodKey,
  type StudySessionLite,
} from "./study-performance"

// G2.11 — estudo × desempenho por disciplina (cálculo puro, sem banco).

const TODAY = "2026-10-03"
const CT = "ct-id"
const PT = "pt-id"
const NAMES = new Map([
  [CT, "Contabilidade Geral"],
  [PT, "Língua Portuguesa"],
])

function subj(id: string | null, name: string, q: number, c: number): SimuladoRecordSubject {
  return { disciplineId: id, disciplineName: name, questionsCount: q, correctCount: c, wrongCount: q - c, blankCount: 0, accuracy: Math.round((c / q) * 1000) / 10 }
}

function rec(id: string, date: string, subjects: SimuladoRecordSubject[], createdAt = `${date}T12:00:00Z`): SimuladoRecord {
  const q = subjects.reduce((a, s) => a + s.questionsCount, 0)
  const c = subjects.reduce((a, s) => a + s.correctCount, 0)
  return {
    id, userId: "u", name: id, examName: "", roleName: "", simuladoDate: date, source: "TEC", sourceCustom: null,
    exam_board: "FGV", exam_board_custom: null, totalQuestions: q, totalCorrect: c, totalWrong: q - c, totalBlank: 0,
    accuracy: q ? Math.round((c / q) * 1000) / 10 : null, timeSpentSeconds: null, notes: null, scoringRule: "PERCENTUAL",
    penaltyScore: null, subjects, createdAt, updatedAt: createdAt,
  }
}

/** Sessão às 12h em São Paulo do dia informado. */
function ses(id: string, disciplineId: string | null, date: string, minutes: number): StudySessionLite {
  return { id, disciplineId, startedAt: `${date}T15:00:00Z`, durationMinutes: minutes }
}

function run(records: SimuladoRecord[], sessions: StudySessionLite[], periodKey: StudyPerformancePeriodKey = "8w") {
  return buildStudyPerformance({ records, sessions, disciplineNames: NAMES, periodKey, todayKey: TODAY })
}

function row(report: ReturnType<typeof run>, id: string) {
  return must(report.rows.find((r) => r.disciplineId === id), `linha ${id}`)
}

describe("período", () => {
  it("4 e 8 semanas terminam hoje e incluem o dia inicial; 'tudo' não tem início", () => {
    assert.deepEqual(periodWindow("4w", TODAY), { startKey: "2026-09-06", endKey: TODAY, weeks: 4 })
    assert.deepEqual(periodWindow("8w", TODAY), { startKey: "2026-08-09", endKey: TODAY, weeks: 8 })
    assert.deepEqual(periodWindow("all", TODAY), { startKey: null, endKey: TODAY, weeks: null })
  })

  it("período de 4 semanas: sessão no 1º dia entra, na véspera não; simulados fora ficam fora", () => {
    const r = run(
      [rec("old", "2026-09-05", [subj(CT, "Contabilidade", 20, 10)]), rec("in", "2026-09-06", [subj(CT, "Contabilidade", 20, 12)])],
      [ses("a", CT, "2026-09-06", 60), ses("b", CT, "2026-09-05", 600)],
      "4w",
    )
    assert.equal(row(r, CT).studyMinutes, 60)
    assert.equal(row(r, CT).simuladosCount, 1)
    assert.equal(r.simuladosInPeriod, 1)
  })

  it("período de 8 semanas soma o que a janela de 4 deixou de fora", () => {
    const sessions = [ses("a", CT, "2026-09-20", 120), ses("b", CT, "2026-08-20", 90)]
    assert.equal(row(run([], sessions, "4w"), CT).studyMinutes, 120)
    assert.equal(row(run([], sessions, "8w"), CT).studyMinutes, 210)
    assert.equal(row(run([], [...sessions, ses("c", CT, "2025-01-10", 30)], "all"), CT).studyMinutes, 240)
  })
})

describe("tempo estudado", () => {
  it("sessão repetida conta uma vez; duração ≤ 0 ou > 24 h fica fora e é contada como inválida", () => {
    const agg = aggregateStudyMinutes(
      [ses("a", CT, "2026-09-20", 50), ses("a", CT, "2026-09-20", 50), ses("z", CT, "2026-09-21", 0), ses("big", CT, "2026-09-21", 1441)],
      "2026-08-09",
      TODAY,
      8,
    )
    assert.equal(agg.byDiscipline.get(CT)?.minutes, 50)
    assert.equal(agg.byDiscipline.get(CT)?.sessions, 1)
    assert.equal(agg.invalidSessions, 2)
  })

  it("sessões sem disciplina não são atribuídas a nenhuma matéria", () => {
    const r = run([], [ses("a", null, "2026-09-20", 45), ses("b", PT, "2026-09-20", 30)])
    assert.equal(r.unassignedStudyMinutes, 45)
    assert.equal(r.totalStudyMinutes, 75)
    assert.deepEqual(r.rows.map((x) => x.disciplineId), [PT])
  })

  it("distribuição por semana (semana 1 = mais antiga)", () => {
    const r = run([], [ses("a", CT, "2026-08-09", 30), ses("b", CT, "2026-08-16", 40), ses("c", CT, TODAY, 50)])
    assert.deepEqual(row(r, CT).weeklyMinutes, [30, 40, 0, 0, 0, 0, 0, 50])
  })

  it("'todo o período' não tem distribuição semanal", () => {
    assert.equal(row(run([], [ses("a", CT, "2026-09-20", 30)], "all"), CT).weeklyMinutes, null)
  })
})

describe("cruzamento por disciplina", () => {
  it("nenhuma disciplina: relatório vazio, nada preenchido com zero", () => {
    const r = run([], [])
    assert.deepEqual(r.rows, [])
    assert.equal(r.totalStudyMinutes, 0)
    assert.equal(r.simuladosInPeriod, 0)
  })

  it("uma disciplina com estudo e simulados: horas, média, primeiro, último e evolução", () => {
    const r = run(
      [rec("s1", "2026-09-01", [subj(CT, "Contabilidade", 20, 12)]), rec("s2", "2026-09-20", [subj(CT, "Contabilidade", 20, 13)])],
      [ses("a", CT, "2026-09-02", 400), ses("b", CT, "2026-09-10", 460)],
    )
    const ct = row(r, CT)
    assert.equal(ct.disciplineName, "Contabilidade Geral", "nome do catálogo")
    assert.equal(ct.studyMinutes, 860)
    assert.equal(ct.simuladosCount, 2)
    assert.equal(ct.averageAccuracy, 62.5)
    assert.equal(ct.firstAccuracy, 60)
    assert.equal(ct.lastAccuracy, 65)
    assert.equal(ct.evolutionPp, 5)
  })

  it("várias disciplinas: com simulado primeiro, depois por horas", () => {
    const r = run(
      [rec("s1", "2026-09-01", [subj(PT, "Português", 20, 16)])],
      [ses("a", CT, "2026-09-02", 600), ses("b", PT, "2026-09-02", 60), ses("c", "x-id", "2026-09-03", 120)],
    )
    assert.deepEqual(r.rows.map((x) => x.disciplineId), [PT, CT, "x-id"])
    assert.equal(row(r, "x-id").disciplineName, "Matéria", "sem nome no catálogo")
  })

  it("disciplina com simulado e sem estudo: 0 h é fato (nenhuma sessão), não ausência", () => {
    const pt = row(run([rec("s1", "2026-09-01", [subj(PT, "Português", 20, 16)])], []), PT)
    assert.equal(pt.studyMinutes, 0)
    assert.match(pt.insights[0] ?? "", /Nenhuma sessão de estudo de Língua Portuguesa registrada nas últimas 8 semanas/)
  })

  it("disciplina com estudo e sem simulado: desempenho = dados insuficientes", () => {
    const ct = row(run([], [ses("a", CT, "2026-09-02", 600)]), CT)
    assert.equal(ct.simuladosCount, 0)
    assert.equal(ct.averageAccuracy, null)
    assert.equal(ct.status, "SEM_SIMULADO")
    assert.ok(ct.insights.some((t) => t.includes("Dados insuficientes para analisar o desempenho desta matéria")))
  })

  it("matéria de simulado sem vínculo com o catálogo: horas desconhecidas (—), nunca 0", () => {
    const r = run([rec("s1", "2026-09-01", [subj(null, "Legislação Local", 10, 7)])], [ses("a", CT, "2026-09-02", 60)])
    const free = must(r.rows.find((x) => x.disciplineName === "Legislação Local"))
    assert.equal(free.studyMinutes, null)
    assert.equal(free.weeklyMinutes, null)
    assert.match(free.insights[0] ?? "", /sem vínculo com o catálogo/)
  })

  it("1 simulado: sem evolução nem tendência", () => {
    const ct = row(run([rec("s1", "2026-09-01", [subj(CT, "C", 20, 12)])], [ses("a", CT, "2026-09-02", 600)]), CT)
    assert.equal(ct.evolutionPp, null)
    assert.equal(ct.trend, null)
    assert.equal(ct.status, "DADOS_INSUFICIENTES")
    assert.ok(ct.insights.some((t) => t.includes("Ainda não dá para medir evolução")))
  })

  it("2 simulados: comparação simples, sem tendência", () => {
    const ct = row(
      run([rec("s1", "2026-09-01", [subj(CT, "C", 20, 12)]), rec("s2", "2026-09-20", [subj(CT, "C", 20, 14)])], []),
      CT,
    )
    assert.equal(ct.trend, null)
    assert.ok(ct.insights.some((t) => t === "Seu resultado nos simulados passou de 60% para 70% (+10 p.p.)."))
    assert.ok(ct.insights.some((t) => t.includes("ainda não tendência")))
  })

  it("3+ simulados: tendência disponível", () => {
    const ct = row(
      run(
        [
          rec("s1", "2026-09-01", [subj(CT, "C", 20, 12)]),
          rec("s2", "2026-09-10", [subj(CT, "C", 20, 13)]),
          rec("s3", "2026-09-20", [subj(CT, "C", 20, 15)]),
        ],
        [],
      ),
      CT,
    )
    assert.equal(ct.trend, "UP")
    assert.ok(ct.insights.includes("Há dados suficientes para acompanhar a tendência."))
  })

  it("datas iguais: primeiro/último seguem o momento do registro, não a ordem de chegada", () => {
    const a = rec("a", "2026-09-10", [subj(CT, "C", 20, 10)], "2026-09-10T10:00:00Z")
    const b = rec("b", "2026-09-10", [subj(CT, "C", 20, 16)], "2026-09-10T11:00:00Z")
    for (const order of [[a, b], [b, a]]) {
      const ct = row(run(order, []), CT)
      assert.equal(ct.firstAccuracy, 50)
      assert.equal(ct.lastAccuracy, 80)
    }
  })

  it("nenhuma frase afirma causa", () => {
    const r = run(
      [rec("s1", "2026-09-01", [subj(CT, "C", 20, 12)]), rec("s2", "2026-09-20", [subj(CT, "C", 20, 12)])],
      [ses("a", CT, "2026-09-02", 3000)],
    )
    for (const t of r.rows.flatMap((x) => x.insights)) assert.doesNotMatch(t, /causou|causa |porque|graças|por causa/i)
  })
})

describe("classificação", () => {
  const cls = (simuladosCount: number, evolutionPp: number | null, minutesPerWeek: number | null) =>
    classifyStudyPerformance({ simuladosCount, evolutionPp, minutesPerWeek })

  it("evolução positiva, alta evolução, estável e queda", () => {
    assert.equal(cls(2, 3, 120), "EVOLUCAO")
    assert.equal(cls(2, 8, 120), "ALTA_EVOLUCAO")
    assert.equal(cls(2, 2.9, 120), "ESTAVEL")
    assert.equal(cls(2, 0, 120), "ESTAVEL")
    assert.equal(cls(2, -3, 120), "QUEDA")
  })

  it("muito estudo e pouca evolução só com 2+ simulados", () => {
    assert.equal(cls(2, 2, HIGH_STUDY_MINUTES_PER_WEEK), "MUITO_ESTUDO_POUCA_EVOLUCAO")
    assert.equal(cls(2, 3, HIGH_STUDY_MINUTES_PER_WEEK), "EVOLUCAO")
    assert.equal(cls(1, null, 10_000), "DADOS_INSUFICIENTES")
    assert.equal(cls(2, -5, HIGH_STUDY_MINUTES_PER_WEEK), "QUEDA", "queda tem prioridade")
  })

  it("pouco estudo e poucos dados; sem horas atribuíveis desliga as regras de horas", () => {
    assert.equal(cls(0, null, LOW_STUDY_MINUTES_PER_WEEK - 1), "POUCO_ESTUDO")
    assert.equal(cls(1, null, 30), "POUCO_ESTUDO")
    assert.equal(cls(0, null, LOW_STUDY_MINUTES_PER_WEEK), "SEM_SIMULADO")
    assert.equal(cls(2, 1, null), "ESTAVEL")
    assert.equal(cls(1, null, null), "DADOS_INSUFICIENTES")
  })

  it("muito estudo / pouca evolução no relatório gera o aviso factual", () => {
    const ct = row(
      run(
        [rec("s1", "2026-09-01", [subj(CT, "C", 20, 12)]), rec("s2", "2026-09-20", [subj(CT, "C", 20, 12)])],
        Array.from({ length: 8 }, (_, i) => ses(`w${i}`, CT, `2026-09-${String(10 + i)}`, 200)), // 1.600 min = 200 min/semana em 8 semanas
      ),
      CT,
    )
    assert.equal(ct.status, "MUITO_ESTUDO_POUCA_EVOLUCAO")
    assert.ok(ct.insights.some((t) => t.startsWith("Contabilidade Geral teve 26h 40min de estudo, mas 0 p.p. de evolução")))
  })
})

describe("dados novos refletem na análise", () => {
  const base = [rec("s1", "2026-09-01", [subj(CT, "C", 20, 12)])]

  it("simulado criado → nova evolução", () => {
    assert.equal(row(run(base, []), CT).evolutionPp, null)
    assert.equal(row(run([...base, rec("s2", "2026-09-20", [subj(CT, "C", 20, 15)])], []), CT).evolutionPp, 15)
  })

  it("simulado editado → números recalculados", () => {
    const edited = [rec("s1", "2026-09-01", [subj(CT, "C", 20, 18)])]
    assert.equal(row(run(edited, []), CT).averageAccuracy, 90)
  })

  it("simulado excluído → matéria some se também não houver estudo", () => {
    assert.deepEqual(run([], []).rows, [])
  })

  it("estudo registrado → horas atualizadas", () => {
    assert.equal(row(run(base, [ses("a", CT, "2026-09-02", 30)]), CT).studyMinutes, 30)
    assert.equal(row(run(base, [ses("a", CT, "2026-09-02", 30), ses("b", CT, TODAY, 45)]), CT).studyMinutes, 75)
  })
})

describe("wiring — atualização da tela", () => {
  const action = readFileSync("src/application/simulados/study-performance.action.ts", "utf-8")
  const view = readFileSync("src/features/simulados/components/simulados-view.tsx", "utf-8")
  const section = readFileSync("src/features/simulados/components/study-performance-section.tsx", "utf-8")

  it("a action lê o banco a cada chamada (sem cache em memória) e reaproveita a leitura de simulados", () => {
    assert.ok(!/new Map<string, CacheEntry>|CACHE_TTL|cache\.get\(/.test(action))
    assert.match(action, /getSimuladoRecordsAction\((\{ skipIdentity: true \})?\)/)
    assert.match(action, /fetchAllPagesInParallel/)
  })

  it("salvar/excluir recarrega a página, que avisa a seção (refreshKey) para recalcular", () => {
    assert.match(view, /setAnalysisVersion\(\(v\) => v \+ 1\)/)
    assert.match(view, /<StudyPerformanceSection refreshKey=\{analysisVersion\} \/>/)
    assert.match(section, /\}, \[period, refreshKey\]\)/)
  })
})
