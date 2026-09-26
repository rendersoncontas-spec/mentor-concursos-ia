// ============================================================================
// Regras puras da fila de revisões (sem banco, sem relógio, sem sorteio).
//
// Todas as datas são fixas. O fuso é o do app (America/Sao_Paulo): um item que
// vence hoje às 23h ainda é "de hoje" para o aluno, mesmo que em UTC já seja
// o dia seguinte — é exatamente isso que os casos de borda abaixo travam.
// ============================================================================

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatDueDistance,
  isDueNow,
  orderReviewQueue,
  retentionFromGrades,
  reviewBucketOf,
  reviewItemLabel,
} from "./review-queue"

const TODAY = "2026-03-10"

describe("reviewBucketOf — grupos disjuntos", () => {
  it("venceu antes de hoje → atrasada", () => {
    assert.equal(reviewBucketOf("2026-03-09T12:00:00.000Z", 3, TODAY), "OVERDUE")
  })

  it("vence hoje e já foi revisado → de hoje", () => {
    assert.equal(reviewBucketOf("2026-03-10T12:00:00.000Z", 1, TODAY), "TODAY")
  })

  it("vence hoje e nunca foi revisado → nova", () => {
    assert.equal(reviewBucketOf("2026-03-10T12:00:00.000Z", 0, TODAY), "NEW")
  })

  it("vence depois de hoje → próxima", () => {
    assert.equal(reviewBucketOf("2026-03-11T12:00:00.000Z", 5, TODAY), "UPCOMING")
  })

  it("23h de hoje em São Paulo (já outro dia em UTC) continua sendo de hoje", () => {
    // 2026-03-11T02:00Z = 2026-03-10 23:00 em São Paulo (UTC-3).
    assert.equal(reviewBucketOf("2026-03-11T02:00:00.000Z", 2, TODAY), "TODAY")
  })

  it("00h30 de amanhã em São Paulo já é próxima", () => {
    // 2026-03-11T03:30Z = 2026-03-11 00:30 em São Paulo.
    assert.equal(reviewBucketOf("2026-03-11T03:30:00.000Z", 2, TODAY), "UPCOMING")
  })

  it("data inválida não vira fila: cai em próxima, nunca em atrasada", () => {
    assert.equal(reviewBucketOf("", 0, TODAY), "UPCOMING")
  })
})

describe("orderReviewQueue — atrasadas → hoje → novas, com empate determinístico", () => {
  const items = [
    { id: "i-novo", dueAt: "2026-03-10T09:00:00.000Z", reps: 0 },
    { id: "i-hoje-tarde", dueAt: "2026-03-10T20:00:00.000Z", reps: 4 },
    { id: "i-atrasado-antigo", dueAt: "2026-03-01T09:00:00.000Z", reps: 2 },
    { id: "i-futuro", dueAt: "2026-03-20T09:00:00.000Z", reps: 1 },
    { id: "i-hoje-cedo", dueAt: "2026-03-10T06:00:00.000Z", reps: 1 },
    { id: "i-atrasado-recente", dueAt: "2026-03-09T09:00:00.000Z", reps: 1 },
  ]

  it("ordena por grupo e, dentro do grupo, pelo vencimento mais antigo", () => {
    assert.deepEqual(
      orderReviewQueue(items, TODAY).map((i) => i.id),
      [
        "i-atrasado-antigo",
        "i-atrasado-recente",
        "i-hoje-cedo",
        "i-hoje-tarde",
        "i-novo",
        "i-futuro",
      ],
    )
  })

  it("mesmo vencimento → desempata pelo id (ordem estável, sem prioridade inventada)", () => {
    const tied = [
      { id: "b", dueAt: "2026-03-10T09:00:00.000Z", reps: 1 },
      { id: "a", dueAt: "2026-03-10T09:00:00.000Z", reps: 1 },
      { id: "c", dueAt: "2026-03-10T09:00:00.000Z", reps: 1 },
    ]
    assert.deepEqual(
      orderReviewQueue(tied, TODAY).map((i) => i.id),
      ["a", "b", "c"],
    )
  })

  it("não altera a lista original", () => {
    const original = items.map((i) => i.id)
    orderReviewQueue(items, TODAY)
    assert.deepEqual(
      items.map((i) => i.id),
      original,
    )
  })

  it("é idempotente: ordenar de novo devolve a mesma ordem", () => {
    const once = orderReviewQueue(items, TODAY)
    assert.deepEqual(orderReviewQueue(once, TODAY), once)
  })
})

describe("isDueNow", () => {
  it("atrasada, de hoje e nova podem ser revisadas; próxima não", () => {
    assert.equal(isDueNow({ dueAt: "2026-03-01T09:00:00.000Z", reps: 2 }, TODAY), true)
    assert.equal(isDueNow({ dueAt: "2026-03-10T09:00:00.000Z", reps: 2 }, TODAY), true)
    assert.equal(isDueNow({ dueAt: "2026-03-10T09:00:00.000Z", reps: 0 }, TODAY), true)
    assert.equal(isDueNow({ dueAt: "2026-03-11T09:00:00.000Z", reps: 2 }, TODAY), false)
  })
})

describe("formatDueDistance — texto vindo da distância real", () => {
  const NOW = "2026-03-10T12:00:00.000Z"

  it("já venceu ou vence em segundos → \"agora\"", () => {
    assert.equal(formatDueDistance("2026-03-10T11:00:00.000Z", NOW), "agora")
    assert.equal(formatDueDistance("2026-03-10T12:00:20.000Z", NOW), "agora")
  })

  it("minutos, horas, dias, meses e anos", () => {
    assert.equal(formatDueDistance("2026-03-10T12:10:00.000Z", NOW), "10 min")
    assert.equal(formatDueDistance("2026-03-10T15:00:00.000Z", NOW), "3 h")
    assert.equal(formatDueDistance("2026-03-11T12:00:00.000Z", NOW), "1 dia")
    assert.equal(formatDueDistance("2026-03-18T12:00:00.000Z", NOW), "8 dias")
    assert.equal(formatDueDistance("2026-05-10T12:00:00.000Z", NOW), "2 meses")
    assert.equal(formatDueDistance("2028-03-09T12:00:00.000Z", NOW), "2 anos")
  })
})

describe("retentionFromGrades — retenção medida, nunca estimada", () => {
  it("sem respostas, a retenção é null (a UI mostra \"—\")", () => {
    assert.deepEqual(retentionFromGrades([]), { rate: null, answered: 0 })
  })

  it("\"Difícil\", \"Bom\" e \"Fácil\" contam como lembrei; só \"Errei\" não", () => {
    assert.deepEqual(retentionFromGrades([2, 3, 4]), { rate: 1, answered: 3 })
    assert.deepEqual(retentionFromGrades([1, 1]), { rate: 0, answered: 2 })
    assert.deepEqual(retentionFromGrades([1, 3, 3, 4]), { rate: 0.75, answered: 4 })
  })

  it("arredonda para duas casas, sem esconder o número de respostas", () => {
    assert.deepEqual(retentionFromGrades([1, 3, 3]), { rate: 0.67, answered: 3 })
  })
})

describe("reviewItemLabel", () => {
  it("subtópico mostra o tópico pai; tópico mostra só o próprio nome", () => {
    assert.equal(
      reviewItemLabel({ title: "Princípios", parentTitle: "Direito Administrativo" }),
      "Direito Administrativo › Princípios",
    )
    assert.equal(reviewItemLabel({ title: "Direito Administrativo", parentTitle: null }), "Direito Administrativo")
  })
})
