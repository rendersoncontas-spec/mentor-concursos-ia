// ============================================================================
// Fase I.5 — achado A3 da auditoria: encerrar a sessão não pode perder estudo.
//
// Fluxo ANTIGO: marcava a sessão COMPLETED e só então lia as respostas. Se a
// leitura falhasse, `listSessionAnswers` devolvia `[]`, `answers.length === 0`, o
// `study_history` não era gravado — e, como a sessão já não estava ACTIVE, a
// segunda tentativa caía na trava de idempotência. O tempo de revisão real do
// aluno era perdido em silêncio, com o relatório dizendo "nenhum item
// respondido".
//
// Fluxo NOVO: tudo o que precisa ser lido é lido ANTES do compare-and-swap.
// Falha de leitura devolve erro controlado com a sessão intacta (ACTIVE), e o
// aluno pode encerrar de novo sem perder nada. O CAS continua sendo a trava de
// idempotência: duas finalizações não gravam dois estudos.
//
// Datas fixas, nenhum Math.random().
//
// Limite conhecido (documentado desde a I.1): o caminho POSITIVO de gravação em
// study_history chama `registerStudyToCycle` e `revalidatePath`, que exigem
// contexto de requisição do Next — por isso ele é travado por testes de wiring
// (review-study-history-d4, review-finalize-idempotency e
// review-finalize-statistics-cache). Aqui testamos tudo o que dá para testar de
// verdade: os caminhos de erro, o de sessão vazia e a idempotência.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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
const DISCIPLINE = "disc-1"
const NOW = "2026-03-10T15:00:00.000Z"
const LATER = "2026-03-10T15:30:00.000Z"

function fixture(): FakeReviewDb {
  return new FakeReviewDb({
    disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
    topics: [
      { id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null },
      { id: "topic-2", name: "Licitações", discipline_id: DISCIPLINE, user_id: null },
    ],
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

/** Sessão aberta com uma resposta já registrada. */
async function sessionWithOneAnswer(): Promise<{ sessionId: string }> {
  const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
  await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
  const started = await startReviewSession(client(db), USER, {}, NOW)
  const sessionId = String(started.data?.sessionId)
  await answerReviewCard(
    client(db),
    USER,
    {
      sessionId,
      itemId: String(started.data?.card?.itemId),
      grade: 3,
      durationSeconds: 12,
      clientOperationId: "op-1",
    },
    NOW,
  )
  assert.equal(db.table("review_history").length, 1, "a resposta precisa estar registrada")
  return { sessionId }
}

describe("A3 — erro ao ler as respostas NÃO encerra a sessão nem perde o estudo", () => {
  it("sessão com respostas + falha ao listá-las: continua ACTIVE, com erro explícito", async () => {
    const { finalizeSession } = await loadService()
    const { sessionId } = await sessionWithOneAnswer()

    db.failOn({ table: "review_history", head: false })
    const res = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.ok(res.error, "a falha de leitura precisa ser reportada")
    assert.match(String(res.error), /continua aberta/i)
    assert.equal(res.completed, false)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE", "a sessão NÃO pode ser encerrada")
    // No duplo, coluna nunca escrita fica ausente; no Postgres seria null.
    assert.equal(db.table("review_sessions")[0]?.["finished_at"] ?? null, null)
    assert.equal(db.table("study_history").length, 0, "nada de estudo pela metade")
  })

  it("depois da falha, a segunda tentativa GRAVA o estudo — nada se perdeu", async () => {
    const { finalizeSession } = await loadService()
    const { sessionId } = await sessionWithOneAnswer()

    db.failOn({ table: "review_history", head: false, times: 1 })
    const first = await finalizeSession(client(db), USER, sessionId, LATER)
    assert.ok(first.error)
    assert.equal(db.table("study_history").length, 0)

    // Segunda tentativa: agora o banco responde. Ela vai até gravar o estudo e
    // só para no mecanismo central do ciclo, que exige contexto de requisição do
    // Next (por isso este é o único ponto do caminho positivo que um teste de
    // unidade não alcança — ele é travado pelos testes de wiring).
    await assert.rejects(
      () => finalizeSession(client(db), USER, sessionId, LATER),
      /request scope|cookies/i,
      "a segunda tentativa precisa chegar até a gravação do estudo",
    )

    const study = db.table("study_history")
    assert.equal(study.length, 1, "o estudo da sessão respondida foi gravado na segunda tentativa")
    assert.equal(study[0]?.["study_source"], "REVIEW")
    assert.equal(study[0]?.["study_type"], "REVISAO")
    assert.equal(study[0]?.["user_id"], USER)
    assert.equal(study[0]?.["discipline_id"], DISCIPLINE)
    assert.deepEqual(
      (study[0]?.["metadata"] as { reviews_completed?: number } | undefined)?.reviews_completed,
      1,
      "a quantidade vem das respostas reais",
    )
    assert.equal(db.table("review_sessions")[0]?.["status"], "COMPLETED")
    assert.equal(
      db.table("review_history").length,
      1,
      "o histórico de respostas continua intacto — nada foi descartado",
    )
  })

  it("falha ao identificar a disciplina também não encerra a sessão", async () => {
    const { finalizeSession } = await loadService()
    const { sessionId } = await sessionWithOneAnswer()

    // A leitura das respostas passa (review_history); a dos itens falha.
    db.failOn({ table: "review_items", head: false })
    const res = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.ok(res.error)
    assert.equal(res.completed, false)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE")
    assert.equal(db.table("study_history").length, 0)
  })

  it("o relatório de encerramento não inventa \"nenhum item respondido\" quando a leitura falha", async () => {
    const { finishReviewSession } = await loadService()
    const { sessionId } = await sessionWithOneAnswer()

    db.failOn({ table: "review_history", head: false })
    const res = await finishReviewSession(client(db), USER, sessionId, LATER)

    assert.equal(res.data, null, "sem respostas lidas não há relatório")
    assert.ok(res.error)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE")
  })
})

describe("A3 — caminhos normais seguem intactos", () => {
  it("sessão sem respostas: encerra e não grava estudo", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    const res = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.equal(res.error ?? null, null)
    assert.equal(res.completed, true)
    assert.equal(db.table("review_sessions")[0]?.["status"], "COMPLETED")
    assert.equal(db.table("review_sessions")[0]?.["finished_at"], LATER)
    assert.equal(db.table("study_history").length, 0)
  })

  it("encerrar duas vezes: a segunda não encerra de novo nem duplica estudo", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    const first = await finalizeSession(client(db), USER, sessionId, NOW)
    const second = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.equal(first.completed, true)
    assert.equal(second.completed ?? false, false, "a segunda chamada não encerra nada")
    assert.equal(second.error ?? null, null, "encerrar de novo é caminho normal, não erro")
    assert.equal(db.table("study_history").length, 0)
    assert.equal(
      db.table("review_sessions")[0]?.["finished_at"],
      NOW,
      "o encerramento da primeira chamada é o que vale",
    )
  })

  it("duas abas encerrando ao mesmo tempo: só uma finalização efetiva", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    const [a, b] = await Promise.all([
      finalizeSession(client(db), USER, sessionId, NOW),
      finalizeSession(client(db), USER, sessionId, NOW),
    ])

    const completed = [a, b].filter((r) => r.completed === true)
    assert.equal(completed.length, 1, "o compare-and-swap continua sendo a trava de idempotência")
    assert.equal(db.table("review_sessions").length, 1)
    assert.equal(db.table("study_history").length, 0)
  })

  it("sessão de outro aluno não é encerrada e não vira erro de leitura", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    const res = await finalizeSession(client(db), "outro-aluno", sessionId, LATER)

    assert.equal(res.error ?? null, null)
    assert.equal(res.completed ?? false, false)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE")
  })
})

describe("A3/M4 — contador da sessão nunca grava zero falso", () => {
  it("falha na contagem das respostas não zera items_answered", async () => {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)
    const firstItem = String(started.data?.card?.itemId)
    const secondItem = String(
      db.table("review_items").find((r) => r["id"] !== firstItem)?.["id"],
    )

    // Primeira resposta conta normalmente.
    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: firstItem, grade: 3, durationSeconds: 5, clientOperationId: "op-1" },
      NOW,
    )
    assert.equal(db.table("review_sessions")[0]?.["items_answered"], 1)

    // Na segunda, a CONTAGEM falha (o evento é gravado normalmente).
    db.failOn({ table: "review_history", head: true })
    const res = await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: secondItem, grade: 4, durationSeconds: 5, clientOperationId: "op-2" },
      NOW,
    )

    assert.equal(res.error, null, "a resposta em si foi aceita")
    assert.equal(db.table("review_history").length, 2, "os dois eventos estão gravados")
    assert.equal(
      db.table("review_sessions")[0]?.["items_answered"],
      1,
      "o contador mantém o último valor REALMENTE lido, nunca cai para 0",
    )
  })

  it("com a contagem voltando a responder, o número se corrige sozinho", async () => {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)
    const firstItem = String(started.data?.card?.itemId)
    const secondItem = String(db.table("review_items").find((r) => r["id"] !== firstItem)?.["id"])

    db.failOn({ table: "review_history", head: true, times: 1 })
    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: firstItem, grade: 3, durationSeconds: 5, clientOperationId: "op-1" },
      NOW,
    )
    assert.equal(db.table("review_sessions")[0]?.["items_answered"], 0, "ainda não houve leitura válida")

    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: secondItem, grade: 3, durationSeconds: 5, clientOperationId: "op-2" },
      NOW,
    )
    assert.equal(
      db.table("review_sessions")[0]?.["items_answered"],
      2,
      "o contador é sempre recontado a partir dos eventos reais",
    )
  })
})

describe("A3 — a ordem do fluxo está travada no código", () => {
  const src = readFileSync(
    join(process.cwd(), "src/application/review-engine/review.service.ts"),
    "utf-8",
  )
  const body = (() => {
    const start = src.indexOf("export async function finalizeSession")
    const end = src.indexOf("\nexport async function", start + 1)
    return src.slice(start, end === -1 ? src.length : end)
  })()

  it("as respostas são lidas ANTES do compare-and-swap", () => {
    const readIdx = body.indexOf("repo.listSessionAnswers(")
    const casIdx = body.indexOf('.update({ status: "COMPLETED"')
    assert.ok(readIdx !== -1 && casIdx !== -1)
    assert.ok(readIdx < casIdx, "ler depois de encerrar é exatamente o bug A3")
  })

  it("a disciplina também é lida antes de encerrar", () => {
    const readIdx = body.indexOf("repo.disciplinesOfItems(")
    const casIdx = body.indexOf('.update({ status: "COMPLETED"')
    assert.ok(readIdx !== -1 && readIdx < casIdx)
  })

  it("falha de leitura retorna erro controlado sem tocar na sessão", () => {
    const readIdx = body.indexOf("repo.listSessionAnswers(")
    const casIdx = body.indexOf('.update({ status: "COMPLETED"')
    const between = body.slice(readIdx, casIdx)
    assert.match(between, /if \(answers === null\)/)
    assert.match(between, /if \(read === null\)/)
    assert.equal(between.includes("study_history"), false, "nada é gravado antes de encerrar")
  })

  it("o compare-and-swap e a guarda de idempotência continuam de pé", () => {
    assert.match(body, /\.eq\("status", "ACTIVE"\)/)
    assert.match(body, /\.select\("id"\)\s*\n?\s*\.maybeSingle\(\)/)
    assert.match(body, /if \(!claimedSession\) return \{ cycleSyncError: null \}/)
  })

  it("nenhuma leitura da sessão volta a mascarar erro como vazio", () => {
    const repo = readFileSync(
      join(process.cwd(), "src/application/review-engine/review.repository.ts"),
      "utf-8",
    )
    const answers = repo.slice(repo.indexOf("export async function listSessionAnswers"))
    assert.match(answers.slice(0, 900), /if \(error\) return null/)
    const counter = repo.slice(repo.indexOf("export async function countSessionAnswers"))
    assert.match(counter.slice(0, 600), /if \(error\) return null/)
    assert.equal(/error \? 0/.test(repo), false)
  })
})
