// ============================================================================
// Fase I.7 — auditoria ponta a ponta do estudo gerado por revisão.
//
// Desde a decisão D4, tempo de revisão É tempo de estudo: a sessão encerrada
// grava uma linha em `study_history` com `study_source = "REVIEW"` e
// `study_type = "REVISAO"`. Isso alimenta horas estudadas, sequência de dias,
// mapa de calor, estatísticas por disciplina e o ciclo de estudos — ou seja, um
// erro aqui contamina quase todos os números do produto.
//
// Estes testes são de COMPORTAMENTO, sobre o banco falso gravável: cada um
// executa o serviço de verdade e depois olha as linhas escritas. Eles fixam as
// cinco garantias que a auditoria precisa afirmar:
//
//   1. sessão com respostas → UM estudo real, com os valores reais;
//   2. sessão sem resposta → nenhum estudo;
//   3. sessão descartada → nenhum estudo (e as respostas continuam valendo);
//   4. uma sessão nunca gera dois estudos (nem em duas abas, nem em duas
//      tentativas);
//   5. a disciplina do estudo é derivada das respostas, nunca escolhida ao acaso.
//
// Limite conhecido (B13): o caminho positivo, depois de gravar o estudo, chama o
// mecanismo central do ciclo, que exige contexto de requisição do Next. Num teste
// de unidade ele lança — e é justamente por isso que os testes abaixo usam
// `assert.rejects` e em seguida inspecionam o que JÁ foi gravado: a gravação
// acontece antes, e é ela que está sob teste aqui.
// ============================================================================

import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { FakeReviewDb } from "@/lib/testing/fake-review-db"
import { reviewSessionMinutes, reviewSessionSeconds } from "@/domain/reviews/session-duration"

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
const DISC_A = "disc-a"
const DISC_B = "disc-b"
const NOW = "2026-03-10T15:00:00.000Z"
const LATER = "2026-03-10T15:30:00.000Z" // 30 minutos depois
const CURTO = "2026-03-10T15:00:20.000Z" // 20 segundos depois

function fixture(): FakeReviewDb {
  return new FakeReviewDb({
    // "disc-a" < "disc-b" na ordem alfabética: serve para provar o desempate.
    disciplines: [
      { id: DISC_A, name: "Direito Administrativo" },
      { id: DISC_B, name: "Português" },
    ],
    topics: [
      { id: "a-1", name: "Atos administrativos", discipline_id: DISC_A, user_id: null },
      { id: "a-2", name: "Licitações", discipline_id: DISC_A, user_id: null },
      { id: "b-1", name: "Crase", discipline_id: DISC_B, user_id: null },
      { id: "b-2", name: "Regência", discipline_id: DISC_B, user_id: null },
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

/** Abre uma sessão e responde os tópicos pedidos, na ordem dada. */
async function sessionAnswering(topicIds: string[]): Promise<string> {
  const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
  for (const topicId of topicIds) {
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", topicId, NOW)
  }
  const started = await startReviewSession(client(db), USER, {}, NOW)
  const sessionId = String(started.data?.sessionId)

  // Responde exatamente os itens criados para estes tópicos (o id de cada item
  // sai do próprio banco falso, pela origem — nada de adivinhar ordem de fila).
  const byTopic = new Map(
    db.table("review_items").map((row) => [String(row["source_id"]), String(row["id"])]),
  )
  let i = 0
  for (const topicId of topicIds) {
    const itemId = byTopic.get(topicId)
    assert.ok(itemId, `item do tópico ${topicId} precisa existir`)
    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 10, clientOperationId: `op-${i++}` },
      NOW,
    )
  }
  assert.equal(db.table("review_history").length, topicIds.length, "todas as respostas registradas")
  return sessionId
}

/** Encerra a sessão aceitando que o mecanismo do ciclo lance (B13). */
async function finalizeIgnoringCycle(sessionId: string, nowIso: string): Promise<void> {
  const { finalizeSession } = await loadService()
  try {
    await finalizeSession(client(db), USER, sessionId, nowIso)
  } catch (err) {
    assert.match(String(err), /request scope|cookies/i, "só o contexto do Next pode faltar")
  }
}

function studyRows(): Record<string, unknown>[] {
  return db.table("study_history") as unknown as Record<string, unknown>[]
}

describe("I.7 — sessão com respostas gera UM estudo real", () => {
  it("grava uma linha com origem, tipo, aluno, disciplina e duração reais", async () => {
    const sessionId = await sessionAnswering(["a-1", "a-2"])
    await finalizeIgnoringCycle(sessionId, LATER)

    const rows = studyRows()
    assert.equal(rows.length, 1, "uma sessão encerrada = um estudo")

    const row = rows[0]!
    assert.equal(row["user_id"], USER)
    assert.equal(row["study_source"], "REVIEW")
    assert.equal(row["study_type"], "REVISAO")
    assert.equal(row["discipline_id"], DISC_A)
    assert.equal(row["completed"], true)
    assert.equal(row["interrupted"], false)
    assert.equal(row["started_at"], NOW, "o início é o da sessão, não o do encerramento")
    assert.equal(row["finished_at"], LATER)
  })

  it("a duração é a medida pela regra única, e não um número fixo", async () => {
    const sessionId = await sessionAnswering(["a-1"])
    await finalizeIgnoringCycle(sessionId, LATER)

    const segundos = reviewSessionSeconds(NOW, LATER)
    const minutos = reviewSessionMinutes(segundos)
    assert.equal(segundos, 1800)
    assert.equal(minutos, 30)

    const row = studyRows()[0]!
    assert.equal(row["duration_minutes"], minutos)
    assert.equal(row["active_minutes"], minutos)
    assert.equal(row["paused_minutes"], 0)
    assert.equal((row["metadata"] as { duration_seconds?: number }).duration_seconds, segundos)
  })

  it("sessão curta segue o piso de 1 minuto, com os segundos reais preservados", async () => {
    const sessionId = await sessionAnswering(["a-1"])
    await finalizeIgnoringCycle(sessionId, CURTO)

    const row = studyRows()[0]!
    assert.equal(row["duration_minutes"], 1, "uma revisão respondida não vale 0 min de estudo")
    assert.equal(
      (row["metadata"] as { duration_seconds?: number }).duration_seconds,
      20,
      "o tempo exato fica registrado nos metadados",
    )
  })

  it("a quantidade de itens e o texto vêm das respostas reais", async () => {
    const sessionId = await sessionAnswering(["a-1", "a-2"])
    await finalizeIgnoringCycle(sessionId, LATER)

    const row = studyRows()[0]!
    assert.equal((row["metadata"] as { reviews_completed?: number }).reviews_completed, 2)
    assert.equal(row["notes"], "Sessão de revisão — 2 itens")
  })

  it("com um único item, o texto fica no singular", async () => {
    const sessionId = await sessionAnswering(["a-1"])
    await finalizeIgnoringCycle(sessionId, LATER)

    assert.equal(studyRows()[0]!["notes"], "Sessão de revisão — 1 item")
  })

  it("o estudo aponta para a sessão de revisão que o originou", async () => {
    const sessionId = await sessionAnswering(["a-1"])
    await finalizeIgnoringCycle(sessionId, LATER)

    const meta = studyRows()[0]!["metadata"] as { review_session_id?: string }
    assert.equal(meta.review_session_id, sessionId, "dá para auditar a origem de cada estudo de revisão")
  })
})

describe("I.7 — a disciplina do estudo é derivada das respostas", () => {
  it("é a disciplina mais revisada na sessão", async () => {
    // Duas de Português, uma de Direito: o estudo é de Português.
    const sessionId = await sessionAnswering(["b-1", "b-2", "a-1"])
    await finalizeIgnoringCycle(sessionId, LATER)

    assert.equal(studyRows()[0]!["discipline_id"], DISC_B)
  })

  it("no empate, a escolha é determinística (nunca depende da ordem do banco)", async () => {
    const sessionId = await sessionAnswering(["b-1", "a-1"])
    await finalizeIgnoringCycle(sessionId, LATER)

    assert.equal(studyRows()[0]!["discipline_id"], DISC_A, "empate resolve pelo id menor, sempre igual")
  })
})

describe("I.7 — uma sessão nunca gera dois estudos", () => {
  it("encerrar de novo depois de um encerramento bem-sucedido não grava outro estudo", async () => {
    const { finalizeSession } = await loadService()
    const sessionId = await sessionAnswering(["a-1"])

    await finalizeIgnoringCycle(sessionId, LATER)
    assert.equal(studyRows().length, 1)

    // Segunda chamada: a sessão já não está ACTIVE, então a trava de
    // idempotência barra antes de qualquer gravação (e nem chega no ciclo).
    const segunda = await finalizeSession(client(db), USER, sessionId, LATER)
    assert.equal(segunda.completed ?? false, false)
    assert.equal(studyRows().length, 1, "nenhum estudo duplicado")
  })

  it("duas abas encerrando a mesma sessão respondida gravam um estudo só", async () => {
    const { finalizeSession } = await loadService()
    const sessionId = await sessionAnswering(["a-1"])

    const results = await Promise.allSettled([
      finalizeSession(client(db), USER, sessionId, LATER),
      finalizeSession(client(db), USER, sessionId, LATER),
    ])

    // Uma das duas chega ao ciclo (e lança, por falta de contexto do Next); a
    // outra para na trava. O que importa é o banco:
    assert.equal(studyRows().length, 1, "o compare-and-swap impede o estudo em dobro")
    assert.equal(db.table("review_sessions").length, 1)
    assert.equal(db.table("review_sessions")[0]?.["status"], "COMPLETED")
    const rejeitadas = results.filter((r) => r.status === "rejected")
    assert.ok(rejeitadas.length <= 1, "no máximo uma chamada atravessa até o ciclo")
  })
})

describe("I.7 — o que NÃO deve gerar estudo", () => {
  it("sessão sem nenhuma resposta: encerra e não grava estudo", async () => {
    const { addEditalContentToReview, startReviewSession, finalizeSession } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "a-1", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)

    const res = await finalizeSession(client(db), USER, String(started.data?.sessionId), LATER)

    assert.equal(res.completed, true)
    assert.equal(studyRows().length, 0, "tempo sem nenhuma resposta não é estudo de revisão")
  })

  it("sessão descartada com respostas: nenhum estudo, mas as respostas permanecem", async () => {
    const { discardReviewSession } = await loadService()
    const sessionId = await sessionAnswering(["a-1"])

    const res = await discardReviewSession(client(db), USER, sessionId, LATER)

    assert.equal(res.discarded, true)
    assert.equal(db.table("review_sessions")[0]?.["status"], "DISCARDED")
    assert.equal(studyRows().length, 0, "descarte não registra tempo de estudo")
    assert.equal(db.table("review_history").length, 1, "a resposta dada continua registrada")
    const item = db.table("review_items")[0]
    assert.ok(Number(item?.["review_count"]) >= 1, "o agendamento já aplicado NÃO é desfeito")
  })

  it("descartar e depois tentar encerrar não ressuscita o estudo", async () => {
    const { discardReviewSession, finalizeSession } = await loadService()
    const sessionId = await sessionAnswering(["a-1"])

    await discardReviewSession(client(db), USER, sessionId, LATER)
    const res = await finalizeSession(client(db), USER, sessionId, LATER)

    assert.equal(res.completed ?? false, false)
    assert.equal(studyRows().length, 0)
    assert.equal(db.table("review_sessions")[0]?.["status"], "DISCARDED", "o descarte não é revertido")
  })

  it("responder um card, por si só, não gera estudo — só o encerramento gera", async () => {
    await sessionAnswering(["a-1", "a-2"])

    assert.equal(studyRows().length, 0, "o estudo é da sessão, não de cada resposta")
    assert.equal(db.table("review_history").length, 2)
  })
})
