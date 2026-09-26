// ============================================================================
// Fase I.7 — auditoria técnica do descarte de sessão de revisão (achado M5).
//
// `discardReviewSessionAction` existe, está implementada e testada no backend,
// mas NENHUMA tela a chama. Isso é decisão de produto pendente, não defeito
// técnico: por isso esta fase audita o comportamento e não cria botão nenhum
// nem remove a action.
//
// O que estes testes fixam, por comportamento, é o contrato que a decisão de
// produto vai encontrar quando for tomada:
//
//   • só o dono descarta a própria sessão;
//   • descartar é troca de estado atômica (compare-and-swap), então repetir a
//     chamada não sobrescreve um encerramento que já aconteceu;
//   • descarte NÃO grava tempo de estudo;
//   • descarte NÃO desfaz o que o aluno já respondeu: os eventos ficam em
//     `review_history` e o agendamento FSRS já aplicado permanece;
//   • descarte e encerramento concorrentes nunca produzem os dois efeitos.
//
// É exatamente esse último ponto que a decisão de produto precisa resolver: uma
// sessão descartada pela metade deixa as respostas valendo (com o agendamento já
// alterado) e o tempo decorrido sem registro em `study_history`.
// ============================================================================

import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { FakeReviewDb } from "@/lib/testing/fake-review-db"

process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

import type * as ReviewService from "./review.service"

type Service = typeof ReviewService

let service: Service

async function loadService(): Promise<Service> {
  service ??= await import("./review.service")
  return service
}

const USER = "aluno-1"
const OUTRO = "aluno-2"
const DISCIPLINE = "disc-1"
const NOW = "2026-03-10T15:00:00.000Z"
const DEPOIS = "2026-03-10T15:10:00.000Z"
const MAIS_TARDE = "2026-03-10T15:30:00.000Z"

function fixture(): FakeReviewDb {
  return new FakeReviewDb({
    disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
    topics: [{ id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null }],
    subtopics: [],
    review_items: [],
    review_history: [],
    review_sessions: [],
    study_history: [],
  })
}

function client(db: FakeReviewDb): Parameters<Service["finalizeSession"]>[0] {
  return db as unknown as Parameters<Service["finalizeSession"]>[0]
}

let db: FakeReviewDb

beforeEach(() => {
  db = fixture()
})

/** Sessão aberta, com uma resposta já registrada e o item já reagendado. */
async function sessionComResposta(): Promise<{ sessionId: string; itemId: string }> {
  const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
  await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
  const started = await startReviewSession(client(db), USER, {}, NOW)
  const sessionId = String(started.data?.sessionId)
  const itemId = String(started.data?.card?.itemId)
  await answerReviewCard(
    client(db),
    USER,
    { sessionId, itemId, grade: 3, durationSeconds: 15, clientOperationId: "op-1" },
    NOW,
  )
  return { sessionId, itemId }
}

async function sessionVazia(): Promise<string> {
  const { addEditalContentToReview, startReviewSession } = await loadService()
  await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
  const started = await startReviewSession(client(db), USER, {}, NOW)
  return String(started.data?.sessionId)
}

describe("M5 — quem pode descartar", () => {
  it("o dono descarta e a sessão sai do ar imediatamente", async () => {
    const { discardReviewSession, getActiveReviewSession } = await loadService()
    const sessionId = await sessionVazia()

    const res = await discardReviewSession(client(db), USER, sessionId, DEPOIS)

    assert.equal(res.discarded, true)
    assert.equal(db.table("review_sessions")[0]?.["status"], "DISCARDED")
    assert.equal(db.table("review_sessions")[0]?.["finished_at"], DEPOIS)

    // Não sobra sessão fantasma: a busca por sessão ativa não a encontra mais.
    const ativa = await getActiveReviewSession(client(db), USER, NOW)
    assert.equal(ativa.data?.sessionId ?? null, null, "sessão descartada não é retomada")
  })

  it("outro aluno NÃO descarta a sessão alheia", async () => {
    const { discardReviewSession } = await loadService()
    const sessionId = await sessionVazia()

    const res = await discardReviewSession(client(db), OUTRO, sessionId, DEPOIS)

    assert.equal(res.discarded, false)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE", "a sessão do dono fica intacta")
  })

  it("sessão inexistente não vira erro nem efeito nenhum", async () => {
    const { discardReviewSession } = await loadService()
    await sessionVazia()

    const res = await discardReviewSession(client(db), USER, "sessao-que-nao-existe", DEPOIS)

    assert.equal(res.discarded, false)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE")
  })
})

describe("M5 — descartar é atômico", () => {
  it("descartar duas vezes: a segunda não faz nada e não reescreve o horário", async () => {
    const { discardReviewSession } = await loadService()
    const sessionId = await sessionVazia()

    const primeira = await discardReviewSession(client(db), USER, sessionId, DEPOIS)
    const segunda = await discardReviewSession(client(db), USER, sessionId, MAIS_TARDE)

    assert.equal(primeira.discarded, true)
    assert.equal(segunda.discarded, false)
    assert.equal(
      db.table("review_sessions")[0]?.["finished_at"],
      DEPOIS,
      "o horário do primeiro descarte é o que vale",
    )
  })

  it("descartar uma sessão já encerrada não sobrescreve o encerramento", async () => {
    const { finalizeSession, discardReviewSession } = await loadService()
    const sessionId = await sessionVazia()

    await finalizeSession(client(db), USER, sessionId, DEPOIS)
    const res = await discardReviewSession(client(db), USER, sessionId, MAIS_TARDE)

    assert.equal(res.discarded, false)
    assert.equal(db.table("review_sessions")[0]?.["status"], "COMPLETED", "encerrada continua encerrada")
  })

  it("descarte e encerramento concorrentes nunca produzem os dois efeitos", async () => {
    const { finalizeSession, discardReviewSession } = await loadService()
    const { sessionId } = await sessionComResposta()

    await Promise.allSettled([
      discardReviewSession(client(db), USER, sessionId, DEPOIS),
      finalizeSession(client(db), USER, sessionId, DEPOIS),
    ])

    const status = db.table("review_sessions")[0]?.["status"]
    const estudos = db.table("study_history").length

    assert.ok(status === "DISCARDED" || status === "COMPLETED", "a sessão termina num estado só")
    if (status === "DISCARDED") {
      assert.equal(estudos, 0, "descartada não gera estudo")
    } else {
      assert.equal(estudos, 1, "encerrada gera exatamente um estudo")
    }
    assert.equal(db.table("review_sessions").length, 1, "nenhuma sessão duplicada")
  })
})

describe("M5 — o que o descarte preserva (e o que ele deixa sem registro)", () => {
  it("não grava tempo de estudo, mesmo com respostas dadas", async () => {
    const { discardReviewSession } = await loadService()
    const { sessionId } = await sessionComResposta()

    await discardReviewSession(client(db), USER, sessionId, DEPOIS)

    assert.equal(db.table("study_history").length, 0, "nenhuma linha de estudo")
  })

  it("as respostas continuam registradas — descarte não apaga histórico", async () => {
    const { discardReviewSession } = await loadService()
    const { sessionId } = await sessionComResposta()

    await discardReviewSession(client(db), USER, sessionId, DEPOIS)

    assert.equal(db.table("review_history").length, 1, "o evento da resposta é imutável")
    assert.equal(db.table("review_history")[0]?.["session_id"], sessionId)
  })

  it("o agendamento FSRS já aplicado permanece (descarte não é desfazer)", async () => {
    const { discardReviewSession } = await loadService()
    const { itemId } = await sessionComResposta()

    const antes = db.table("review_items").find((r) => r["id"] === itemId)
    const agendadoAntes = antes?.["next_review_at"]
    const contagemAntes = antes?.["review_count"]
    assert.ok(Number(contagemAntes) >= 1, "a resposta já alterou o item")

    await discardReviewSession(client(db), USER, String(antes?.["id"]), DEPOIS)

    const depois = db.table("review_items").find((r) => r["id"] === itemId)
    assert.equal(depois?.["next_review_at"], agendadoAntes, "a próxima revisão continua a que o FSRS calculou")
    assert.equal(depois?.["review_count"], contagemAntes, "a contagem de revisões não é revertida")
  })

  it("é justamente aqui que fica a decisão pendente: resposta vale, tempo não conta", async () => {
    const { discardReviewSession } = await loadService()
    const { sessionId } = await sessionComResposta()

    await discardReviewSession(client(db), USER, sessionId, DEPOIS)

    // Este teste não julga se está certo ou errado — ele documenta o estado
    // resultante, que é o que o proprietário do produto precisa decidir.
    assert.equal(db.table("review_history").length, 1, "a revisão respondida conta para o FSRS")
    assert.equal(db.table("study_history").length, 0, "e os 10 minutos da sessão não contam como estudo")
  })
})
