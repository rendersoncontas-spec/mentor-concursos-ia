import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { must } from "@/lib/testing/must"

import type { SimuladoRecordInput } from "@/domain/simulados/types"

import { isValidDateKey, normalizeSimuladoRecordInput, subjectKey } from "./simulado-record-validation"

const TODAY = "2026-10-03"
const D1 = "11111111-1111-4111-8111-111111111111"
const D2 = "22222222-2222-4222-8222-222222222222"

function base(overrides: Partial<SimuladoRecordInput> = {}): SimuladoRecordInput {
  return {
    name: "Simulado Receita 1",
    examName: "Receita Federal",
    roleName: "Auditor",
    simuladoDate: "2026-09-20",
    source: "TEC",
    exam_board: "FGV",
    totalQuestions: 100,
    totalCorrect: 72,
    totalWrong: 28,
    totalBlank: 0,
    timeSpentSeconds: 4 * 3600,
    notes: "  ",
    scoringRule: "PERCENTUAL",
    subjects: [],
    ...overrides,
  }
}

function ok(input: SimuladoRecordInput) {
  const r = normalizeSimuladoRecordInput(input, TODAY)
  if (!r.ok) assert.fail(`esperava válido, veio: ${r.error}`)
  return r.value
}

function err(input: SimuladoRecordInput): string {
  const r = normalizeSimuladoRecordInput(input, TODAY)
  if (r.ok) assert.fail("esperava erro")
  return r.error
}

describe("cadastro — resultado geral", () => {
  it("resultado válido: deriva erros e percentual no servidor", () => {
    const v = ok(base())
    assert.equal(v.totalWrong, 28)
    assert.equal(v.accuracy, 72)
    assert.equal(v.notes, null, "observação só com espaços vira null")
  })

  it("erros derivados mesmo sem o cliente enviar", () => {
    const v = ok(base({ totalWrong: undefined as unknown as number, totalBlank: 5 }))
    assert.equal(v.totalWrong, 23)
  })

  it("acertos maiores que o total", () => {
    assert.match(err(base({ totalCorrect: 101, totalWrong: 0 })), /acertos não podem passar/i)
  })

  it("acertos + brancos maiores que o total", () => {
    assert.match(err(base({ totalCorrect: 90, totalBlank: 20, totalWrong: 0 })), /acertos \+ brancos/i)
  })

  it("erros informados incoerentes com acertos/brancos", () => {
    assert.match(err(base({ totalWrong: 10 })), /deve ser igual ao total/)
  })

  it("total zero é recusado (antes virava 1 em silêncio)", () => {
    assert.match(err(base({ totalQuestions: 0, totalCorrect: 0, totalWrong: 0 })), /pelo menos 1 questão/)
  })

  it("números negativos, fracionários ou texto são recusados", () => {
    assert.ok(err(base({ totalCorrect: -1 })))
    assert.ok(err(base({ totalCorrect: 7.5 })))
    assert.ok(err(base({ totalQuestions: "abc" as unknown as number })))
  })

  it("percentual com casa decimal: 2/3 = 66,7", () => {
    assert.equal(ok(base({ totalQuestions: 3, totalCorrect: 2, totalWrong: 1 })).accuracy, 66.7)
  })
})

describe("cadastro — data, tempo e campos", () => {
  it("data inválida, inexistente, futura ou muito antiga", () => {
    assert.match(err(base({ simuladoDate: "20/09/2026" })), /data válida/)
    assert.match(err(base({ simuladoDate: "2026-02-30" })), /data válida/)
    assert.match(err(base({ simuladoDate: "2026-10-04" })), /futuro/)
    assert.match(err(base({ simuladoDate: "1999-12-31" })), /inválida/)
  })

  it("data de hoje é aceita", () => {
    assert.equal(ok(base({ simuladoDate: TODAY })).simuladoDate, TODAY)
  })

  it("isValidDateKey reconhece ano bissexto", () => {
    assert.equal(isValidDateKey("2028-02-29"), true)
    assert.equal(isValidDateKey("2026-02-29"), false)
  })

  it("duração: 0 vira 'não informado'; acima de 24 h ou negativa é recusada", () => {
    assert.equal(ok(base({ timeSpentSeconds: 0 })).timeSpentSeconds, null)
    assert.equal(ok(base({ timeSpentSeconds: null })).timeSpentSeconds, null)
    assert.match(err(base({ timeSpentSeconds: 24 * 3600 + 1 })), /Tempo gasto inválido/)
    assert.match(err(base({ timeSpentSeconds: -60 })), /Tempo gasto inválido/)
  })

  it("nome, banca, fonte e regra obrigatórios/válidos", () => {
    assert.match(err(base({ name: "   " })), /nome do simulado/)
    assert.match(err(base({ exam_board: "" })), /banca/)
    assert.match(err(base({ source: "XYZ" as never })), /Fonte do simulado inválida/)
    assert.match(err(base({ scoringRule: "BONUS" as never })), /Regra de pontuação inválida/)
  })

  it("source_custom só é gravado quando a fonte é OUTRO", () => {
    assert.equal(ok(base({ source: "TEC", sourceCustom: "x" })).sourceCustom, null)
    assert.equal(ok(base({ source: "OUTRO", sourceCustom: " Meu cursinho " })).sourceCustom, "Meu cursinho")
  })
})

describe("cadastro — desempenho por disciplina", () => {
  const subjects = [
    { disciplineId: D1, disciplineName: "Português", questionsCount: 20, correctCount: 16, wrongCount: 4 },
    { disciplineId: D2, disciplineName: "Contabilidade", questionsCount: 20, correctCount: 12, wrongCount: 6, blankCount: 2 },
  ]

  it("totais do simulado = soma das matérias (total do cliente ignorado)", () => {
    const v = ok(base({ totalQuestions: 999, totalCorrect: 1, totalWrong: 0, subjects }))
    assert.equal(v.totalQuestions, 40)
    assert.equal(v.totalCorrect, 28)
    assert.equal(v.totalBlank, 2)
    assert.equal(v.totalWrong, 10)
    assert.equal(v.accuracy, 70)
  })

  it("erros por matéria são derivados", () => {
    const v = ok(base({ subjects: [{ ...must(subjects[1]), wrongCount: 0 }] }))
    assert.equal(v.subjects[0]?.wrongCount, 6)
  })

  it("disciplina duplicada (mesmo id) é recusada", () => {
    const dup = [must(subjects[0]), { ...must(subjects[0]), disciplineName: "Português II" }]
    assert.match(err(base({ subjects: dup })), /mais de uma vez/)
  })

  it("disciplina duplicada pelo nome (acento/caixa/espaços) é recusada", () => {
    const dup = [
      { disciplineId: null, disciplineName: "Língua Portuguesa", questionsCount: 10, correctCount: 5, wrongCount: 5 },
      { disciplineId: null, disciplineName: "  lingua   portuguesa ", questionsCount: 10, correctCount: 5, wrongCount: 5 },
    ]
    assert.match(err(base({ subjects: dup })), /mais de uma vez/)
    assert.equal(subjectKey("  Língua   Portuguesa "), "lingua portuguesa")
  })

  it("dados inconsistentes na matéria", () => {
    assert.match(err(base({ subjects: [{ ...must(subjects[0]), correctCount: 21 }] })), /acertos não podem passar/)
    assert.match(err(base({ subjects: [{ ...must(subjects[0]), correctCount: 15, blankCount: 6 }] })), /acertos \+ brancos/)
    assert.match(err(base({ subjects: [{ ...must(subjects[0]), questionsCount: 0, correctCount: 0 }] })), /quantidade de questões/)
    assert.match(err(base({ subjects: [{ ...must(subjects[0]), disciplineName: " " }] })), /nome de cada matéria/)
    assert.match(err(base({ subjects: [{ ...must(subjects[0]), disciplineId: "nao-e-uuid" }] })), /inválida/)
  })

  it("sem matérias o resultado geral é suficiente (detalhar é opcional)", () => {
    assert.equal(ok(base({ subjects: [] })).subjects.length, 0)
  })
})

describe("cadastro — pontuação", () => {
  it("CEBRASPE usa penalização 1 por padrão e recusa valores absurdos", () => {
    assert.equal(ok(base({ scoringRule: "CEBRASPE" })).penaltyPerWrong, 1)
    assert.match(err(base({ scoringRule: "CEBRASPE", penaltyPerWrong: -1 })), /Penalização/)
  })

  it("nota final informada fica entre 0 e 100", () => {
    assert.match(err(base({ scoringRule: "PERSONALIZADO", penaltyScore: 120 })), /entre 0 e 100/)
    assert.equal(ok(base({ scoringRule: "PERCENTUAL" })).penaltyPerWrong, null)
  })
})

describe("G2.12 — mesma chave canônica do catálogo", () => {
  it("hífen e pontuação contam como espaço: 'Direito-Penal' e 'Direito Penal' são a mesma matéria", () => {
    const dup = [
      { disciplineId: null, disciplineName: "Direito-Penal", questionsCount: 10, correctCount: 5, wrongCount: 5 },
      { disciplineId: null, disciplineName: "direito penal", questionsCount: 10, correctCount: 5, wrongCount: 5 },
    ]
    assert.match(err(base({ subjects: dup })), /mais de uma vez/)
  })

  it("matérias parecidas mas diferentes continuam aceitas no mesmo simulado", () => {
    const v = ok(
      base({
        subjects: [
          { disciplineId: null, disciplineName: "Raciocínio Lógico", questionsCount: 10, correctCount: 5, wrongCount: 5 },
          { disciplineId: null, disciplineName: "Raciocínio Lógico e Matemático", questionsCount: 10, correctCount: 6, wrongCount: 4 },
        ],
      }),
    )
    assert.equal(v.subjects.length, 2)
  })
})
