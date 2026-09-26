// ============================================================================
// Testes do serviço de Revisões (Fase I.1) contra um banco em memória com
// escrita (src/lib/testing/fake-review-db.ts), que reproduz os três índices
// únicos reais das tabelas de revisão.
//
// Datas FIXAS e nenhum Math.random(): todo instante entra por parâmetro
// (`nowIso`), e o agendamento real (ts-fsrs) é determinístico. Os intervalos
// não são conferidos por número mágico — o que se verifica é que o intervalo
// gravado é EXATAMENTE o que o agendador devolveu.
//
// O que NÃO é coberto aqui, e por quê:
//   • finalizeSession com respostas grava study_history e chama o mecanismo
//     central do ciclo (registerStudyToCycle) e revalidatePath — ambos exigem
//     contexto de requisição do Next e o banco real. Os dois caminhos seguros
//     (sessão já encerrada e sessão sem respostas) são testados aqui; a
//     gravação do estudo, a reconciliação do ciclo, a invalidação do cache de
//     Estatísticas e a trava de idempotência estão travadas pelos testes de
//     wiring: review-finalize-idempotency, review-finalize-statistics-cache,
//     study-history.cycle-sync e review-study-history-d4.
//   • RLS, CHECKs e concorrência de duas conexões: verificados no banco real
//     (migração + consultas de verificação) e pelos testes de wiring, como já
//     é a prática do projeto.
// ============================================================================

import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import type { ReviewCounts } from "@/domain/reviews/models"
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

// ─── Cenário fixo: um aluno, uma disciplina, dois tópicos, um subtópico ──────

const USER = "user-a"
const OTHER_USER = "user-b"
const DISCIPLINE = "disc-1"

const NOW = "2026-03-10T15:00:00.000Z" // 12:00 em São Paulo
const YESTERDAY = "2026-03-09T15:00:00.000Z"
const NEXT_WEEK = "2026-03-17T15:00:00.000Z"

function fixture(): FakeReviewDb {
  return new FakeReviewDb({
    disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
    user_disciplines: [
      {
        user_id: USER,
        discipline_id: DISCIPLINE,
        disciplines: { id: DISCIPLINE, name: "Direito Administrativo" },
      },
    ],
    topics: [
      { id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null },
      { id: "topic-2", name: "Licitações", discipline_id: DISCIPLINE, user_id: null },
    ],
    subtopics: [{ id: "sub-1", name: "Revogação e anulação", topic_id: "topic-1" }],
    review_items: [],
    review_history: [],
    review_sessions: [],
    study_history: [],
  })
}

/** O duplo é um objeto com `from()`: o serviço só usa essa interface. */
function client(db: FakeReviewDb): Parameters<Service["getReviewsOverview"]>[0] {
  return db as unknown as Parameters<Service["getReviewsOverview"]>[0]
}

/**
 * Cliente que dispara `duringRead` uma única vez, logo depois da PRIMEIRA
 * consulta a review_items ser resolvida — o instante entre a leitura do item e
 * a gravação do novo estado. É assim que se reproduz, num teste sequencial, a
 * corrida entre duas abas que o controle otimista precisa barrar.
 */
function raceOnFirstItemRead(
  target: FakeReviewDb,
  duringRead: () => Promise<void>,
): Parameters<Service["answerReviewCard"]>[0] {
  let armed = true
  const wrapper = {
    from(table: string) {
      const query = target.from(table)
      if (table !== "review_items" || !armed) return query
      const originalThen = query.then.bind(query)
      query.then = ((onfulfilled: unknown, onrejected: unknown) =>
        originalThen(
          async (value: unknown) => {
            if (armed) {
              armed = false
              await duringRead()
            }
            return typeof onfulfilled === "function" ? onfulfilled(value) : value
          },
          onrejected as never,
        )) as typeof query.then
      return query
    },
  }
  return wrapper as unknown as Parameters<Service["answerReviewCard"]>[0]
}

/**
 * Contagens de uma visão geral carregada com sucesso. `counts` é `null` quando a
 * leitura falha (Fase I.5) — nestes testes, que são de caminho normal, isso
 * seria um defeito, então a asserção falha em vez de mascarar.
 */
function countsOf(overview: { counts: ReviewCounts | null }): ReviewCounts {
  assert.ok(overview.counts, "a visão geral deveria ter carregado as contagens")
  return overview.counts
}

let db: FakeReviewDb

beforeEach(() => {
  db = fixture()
})

// ─── Estado vazio ────────────────────────────────────────────────────────────

describe("Estado vazio — nada é inventado", () => {
  it("sem itens: fila vazia, contagens em zero, retenção null e nenhuma próxima revisão", async () => {
    const { getReviewsOverview } = await loadService()
    const overview = await getReviewsOverview(client(db), USER, NOW)

    assert.deepEqual(overview.counts, {
      overdue: 0,
      today: 0,
      newItems: 0,
      upcoming: 0,
      suspended: 0,
      archived: 0,
    })
    assert.deepEqual(overview.due, [])
    assert.deepEqual(overview.upcoming, [])
    assert.equal(overview.nextDueAt, null)
    assert.deepEqual(overview.retention, { rate: null, answered: 0 })
    assert.equal(overview.hasActiveSession, false)
  })

  it("sem itens vencidos, a sessão abre sem card em vez de forjar um item", async () => {
    const { startReviewSession } = await loadService()
    const res = await startReviewSession(client(db), USER, {}, NOW)
    assert.equal(res.error, null)
    assert.equal(res.data?.card, null)
    assert.equal(res.data?.remaining, 0)
  })
})

// ─── Adicionar conteúdo do edital ────────────────────────────────────────────

describe("Adicionar à revisão — tópico e subtópico do edital", () => {
  it("tópico: nasce NOVO vencendo agora, com a disciplina derivada no servidor", async () => {
    const { addEditalContentToReview } = await loadService()
    const res = await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)

    assert.equal(res.error, null)
    assert.equal(res.alreadyExisted, false)
    assert.equal(res.item?.title, "Atos administrativos")
    assert.equal(res.item?.parentTitle, null)
    assert.equal(res.item?.disciplineName, "Direito Administrativo")
    assert.equal(res.item?.state, "NEW")
    assert.equal(res.item?.reps, 0)
    assert.equal(res.item?.dueAt, NOW, "vence agora: nenhum intervalo inicial inventado")

    const rows = db.table("review_items")
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.["user_id"], USER)
    assert.equal(rows[0]?.["source_type"], "EDITAL_TOPIC")
    assert.equal(rows[0]?.["source_id"], "topic-1")
    assert.equal(rows[0]?.["discipline_id"], DISCIPLINE, "a disciplina vem da hierarquia real, não do cliente")
    assert.equal(rows[0]?.["review_stage"], "NEW")
    assert.equal(rows[0]?.["review_count"], 0)
  })

  it("subtópico: respeita a hierarquia Edital → Tópico → Subtópico", async () => {
    const { addEditalContentToReview } = await loadService()
    const res = await addEditalContentToReview(client(db), USER, "EDITAL_SUBTOPIC", "sub-1", NOW)

    assert.equal(res.error, null)
    assert.equal(res.item?.title, "Revogação e anulação")
    assert.equal(res.item?.parentTitle, "Atos administrativos")
    assert.equal(db.table("review_items")[0]?.["discipline_id"], DISCIPLINE)
  })

  it("conteúdo inexistente: erro claro e nada gravado", async () => {
    const { addEditalContentToReview } = await loadService()
    const res = await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-inexistente", NOW)

    assert.equal(res.item, null)
    assert.equal(res.error, "Conteúdo não encontrado no edital.")
    assert.equal(db.table("review_items").length, 0)
  })

  it("clicar duas vezes NÃO cria dois itens (idempotente por usuário + origem)", async () => {
    const { addEditalContentToReview } = await loadService()
    const first = await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const second = await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NEXT_WEEK)

    assert.equal(first.alreadyExisted, false)
    assert.equal(second.alreadyExisted, true)
    assert.equal(second.item?.id, first.item?.id)
    assert.equal(db.table("review_items").length, 1)
    assert.equal(
      db.table("review_items")[0]?.["next_review_at"],
      NOW,
      "o segundo clique não reagenda o item que já existia",
    )
  })

  it("dois alunos podem revisar o mesmo tópico, cada um com seu item", async () => {
    const { addEditalContentToReview } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const other = await addEditalContentToReview(client(db), OTHER_USER, "EDITAL_TOPIC", "topic-1", NOW)

    assert.equal(other.error, null)
    assert.equal(other.alreadyExisted, false)
    assert.equal(db.table("review_items").length, 2)
  })

  it("o item de um aluno não aparece na visão geral do outro", async () => {
    const { addEditalContentToReview, getReviewsOverview } = await loadService()
    await addEditalContentToReview(client(db), OTHER_USER, "EDITAL_TOPIC", "topic-1", NOW)

    const mine = await getReviewsOverview(client(db), USER, NOW)
    assert.deepEqual(mine.due, [])
    assert.equal(countsOf(mine).newItems, 0)

    const theirs = await getReviewsOverview(client(db), OTHER_USER, NOW)
    assert.equal(countsOf(theirs).newItems, 1)
  })
})

// ─── Fila: ordem, contagens e grupos ─────────────────────────────────────────

describe("Fila — atrasadas → hoje → novas", () => {
  async function seedQueue() {
    const { addEditalContentToReview } = await loadService()
    // Um item novo (vence agora) e dois já revisados: um atrasado e um de hoje.
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    await addEditalContentToReview(client(db), USER, "EDITAL_SUBTOPIC", "sub-1", NOW)
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)

    const bySource = new Map(
      db.table("review_items").map((r) => [String(r["source_id"]), String(r["id"])]),
    )

    // topic-1 → atrasado (venceu ontem, já revisado)
    await client(db)
      .from("review_items")
      .update({ next_review_at: YESTERDAY, review_count: 2, review_stage: "REVIEW" })
      .eq("id", bySource.get("topic-1"))
    // sub-1 → vence hoje mais tarde, já revisado
    await client(db)
      .from("review_items")
      .update({ next_review_at: "2026-03-10T23:00:00.000Z", review_count: 1, review_stage: "REVIEW" })
      .eq("id", bySource.get("sub-1"))
    // topic-2 permanece novo, vencendo agora
    return bySource
  }

  it("a visão geral devolve a fila na ordem certa e conta cada grupo separadamente", async () => {
    const { getReviewsOverview } = await loadService()
    const bySource = await seedQueue()
    const overview = await getReviewsOverview(client(db), USER, NOW)

    assert.deepEqual(overview.counts, {
      overdue: 1,
      today: 1,
      newItems: 1,
      upcoming: 0,
      suspended: 0,
      archived: 0,
    })
    assert.deepEqual(
      overview.due.map((item) => item.id),
      [bySource.get("topic-1"), bySource.get("sub-1"), bySource.get("topic-2")],
    )
    assert.equal(overview.nextDueAt, null, "com fila para hoje, não faz sentido anunciar a próxima")
  })

  it("a sessão começa pelo primeiro da fila (o atrasado)", async () => {
    const { startReviewSession } = await loadService()
    const bySource = await seedQueue()
    const res = await startReviewSession(client(db), USER, {}, NOW)

    assert.equal(res.data?.card?.itemId, bySource.get("topic-1"))
    assert.equal(res.data?.card?.bucket, "OVERDUE")
    assert.equal(res.data?.remaining, 3)
  })

  it("item futuro fica em \"próximas\" e a próxima revisão é anunciada com a data real", async () => {
    const { addEditalContentToReview, getReviewsOverview } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const itemId = String(db.table("review_items")[0]?.["id"])
    await client(db)
      .from("review_items")
      .update({ next_review_at: NEXT_WEEK, review_count: 3, review_stage: "REVIEW" })
      .eq("id", itemId)

    const overview = await getReviewsOverview(client(db), USER, NOW)
    assert.deepEqual(overview.due, [])
    assert.equal(countsOf(overview).upcoming, 1)
    assert.equal(overview.upcoming[0]?.id, itemId)
    assert.equal(overview.nextDueAt, NEXT_WEEK)
  })

  it("o card traz as quatro notas com a previsão real do agendador", async () => {
    const { addEditalContentToReview, startReviewSession } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const res = await startReviewSession(client(db), USER, {}, NOW)

    const previews = res.data?.card?.previews ?? []
    assert.deepEqual(
      previews.map((p) => p.grade),
      [1, 2, 3, 4],
    )
    assert.deepEqual(
      previews.map((p) => p.label),
      ["Errei", "Difícil", "Bom", "Fácil"],
    )
    for (const preview of previews) {
      assert.ok(preview.preview.length > 0, "cada nota mostra quando o tópico volta")
    }
  })
})

// ─── Sessão ──────────────────────────────────────────────────────────────────

describe("Sessão de revisão", () => {
  it("abre uma sessão ACTIVE e, chamada de novo, RETOMA a mesma (nunca duas abertas)", async () => {
    const { addEditalContentToReview, startReviewSession } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)

    const first = await startReviewSession(client(db), USER, {}, NOW)
    const second = await startReviewSession(client(db), USER, {}, NOW)

    assert.equal(first.data?.sessionId, second.data?.sessionId)
    const sessions = db.table("review_sessions")
    assert.equal(sessions.length, 1)
    assert.equal(sessions[0]?.["status"], "ACTIVE")
    assert.equal(sessions[0]?.["started_at"], NOW)
  })

  it("permite revisar um item específico antes do vencimento (revisão antecipada)", async () => {
    const { addEditalContentToReview, startReviewSession } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const itemId = String(db.table("review_items")[0]?.["id"])
    await client(db).from("review_items").update({ next_review_at: NEXT_WEEK, review_count: 2 }).eq("id", itemId)

    const res = await startReviewSession(client(db), USER, { itemId }, NOW)
    assert.equal(res.error, null)
    assert.equal(res.data?.card?.itemId, itemId)
    assert.equal(res.data?.card?.bucket, "UPCOMING")
  })

  it("não abre sessão em item de outro aluno", async () => {
    const { addEditalContentToReview, startReviewSession } = await loadService()
    await addEditalContentToReview(client(db), OTHER_USER, "EDITAL_TOPIC", "topic-1", NOW)
    const itemId = String(db.table("review_items")[0]?.["id"])

    const res = await startReviewSession(client(db), USER, { itemId }, NOW)
    assert.equal(res.data, null)
    assert.equal(res.error, "Item de revisão não encontrado.")
  })

  it("descartar a sessão não grava estudo nenhum", async () => {
    const { addEditalContentToReview, startReviewSession, discardReviewSession } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const session = await startReviewSession(client(db), USER, {}, NOW)

    const res = await discardReviewSession(client(db), USER, String(session.data?.sessionId), NOW)
    assert.equal(res.discarded, true)
    assert.equal(db.table("review_sessions")[0]?.["status"], "DISCARDED")
    assert.equal(db.table("study_history").length, 0)
  })
})

// ─── Responder ───────────────────────────────────────────────────────────────

describe("Responder um card", () => {
  async function openSession() {
    const { addEditalContentToReview, startReviewSession } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    return {
      sessionId: String(started.data?.sessionId),
      itemId: String(started.data?.card?.itemId),
    }
  }

  it("grava o novo estado do item exatamente como o agendador calculou", async () => {
    const { answerReviewCard } = await loadService()
    const { reviewScheduler } = await import("@/infrastructure/reviews/fsrs-scheduler")
    const { sessionId, itemId } = await openSession()

    const expected = reviewScheduler.schedule({
      memory: reviewScheduler.newMemory(NOW),
      grade: 3,
      now: NOW,
      desiredRetention: 0.9,
    })

    const res = await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 42, clientOperationId: "op-1" },
      NOW,
    )

    assert.equal(res.error, null)
    assert.equal(res.conflict, false)
    assert.equal(res.duplicate, false)

    const item = db.table("review_items")[0]
    assert.equal(item?.["review_stage"], expected.memory.state)
    assert.equal(item?.["next_review_at"], expected.memory.dueAt)
    assert.equal(item?.["stability_score"], expected.memory.stability)
    assert.equal(item?.["difficulty"], expected.memory.difficulty)
    assert.equal(item?.["learning_steps"], expected.memory.learningSteps)
    assert.equal(item?.["review_count"], 1)
    assert.equal(item?.["last_review_at"], NOW)
  })

  it("grava um evento imutável com o antes e o depois, e o tempo real gasto", async () => {
    const { answerReviewCard } = await loadService()
    const { sessionId, itemId } = await openSession()

    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 42, clientOperationId: "op-1" },
      NOW,
    )

    const events = db.table("review_history")
    assert.equal(events.length, 1)
    const event = events[0] ?? {}
    assert.equal(event["user_id"], USER)
    assert.equal(event["review_item_id"], itemId)
    assert.equal(event["session_id"], sessionId)
    assert.equal(event["grade"], 3)
    assert.equal(event["duration_seconds"], 42)
    assert.equal(event["review_date"], NOW)
    assert.equal(event["state_before"], "NEW")
    assert.equal(event["state_after"], db.table("review_items")[0]?.["review_stage"])
    assert.equal(event["due_before"], NOW)
    assert.equal(event["due_after"], db.table("review_items")[0]?.["next_review_at"])
    assert.equal(event["early"], false)
    assert.equal(event["elapsed_days"], 0)
    assert.equal(event["client_operation_id"], "op-1")
  })

  it("o contador da sessão é o número real de respostas", async () => {
    const { answerReviewCard } = await loadService()
    const { addEditalContentToReview } = await loadService()
    const { sessionId, itemId } = await openSession()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)
    const secondItem = String(
      db.table("review_items").find((r) => r["source_id"] === "topic-2")?.["id"],
    )

    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 10, clientOperationId: "op-1" },
      NOW,
    )
    const second = await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: secondItem, grade: 4, durationSeconds: 10, clientOperationId: "op-2" },
      NOW,
    )

    assert.equal(second.session?.itemsAnswered, 2)
    assert.equal(db.table("review_sessions")[0]?.["items_answered"], 2)
    assert.equal(db.table("review_history").length, 2)
  })

  it("a mesma resposta reenviada (mesmo clientOperationId) NÃO é aplicada duas vezes", async () => {
    const { answerReviewCard } = await loadService()
    const { sessionId, itemId } = await openSession()
    const input = { sessionId, itemId, grade: 3 as const, durationSeconds: 12, clientOperationId: "op-repetida" }

    const first = await answerReviewCard(client(db), USER, input, NOW)
    const dueAfterFirst = db.table("review_items")[0]?.["next_review_at"]
    const retry = await answerReviewCard(client(db), USER, input, NOW)

    assert.equal(first.duplicate, false)
    assert.equal(retry.duplicate, true)
    assert.equal(retry.conflict, false)
    assert.equal(retry.error, null)
    assert.equal(db.table("review_history").length, 1, "um evento, não dois")
    assert.equal(db.table("review_items")[0]?.["review_count"], 1, "o item não avançou duas vezes")
    assert.equal(db.table("review_items")[0]?.["next_review_at"], dueAfterFirst)
  })

  it("se outra aba responde no meio do caminho, a resposta tardia vira conflito controlado (sem duplo agendamento)", async () => {
    const { answerReviewCard } = await loadService()
    const { sessionId, itemId } = await openSession()

    // Corrida real: a outra aba grava a resposta DEPOIS de este pedido ler o
    // item e ANTES de ele gravar. É esse intervalo que o controle otimista
    // (review_count esperado) protege — pré-alterar o item antes da chamada não
    // simularia nada, porque a leitura já traria o estado novo.
    const raced = raceOnFirstItemRead(db, async () => {
      await client(db)
        .from("review_items")
        .update({ review_count: 1, review_stage: "LEARNING", next_review_at: "2026-03-10T15:10:00.000Z" })
        .eq("id", itemId)
    })

    const res = await answerReviewCard(
      raced,
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 12, clientOperationId: "op-tardia" },
      NOW,
    )

    assert.equal(res.conflict, true)
    assert.equal(res.error, null)
    assert.equal(db.table("review_history").length, 0, "conflito não gera evento")
    assert.equal(db.table("review_items")[0]?.["review_count"], 1, "a resposta da outra aba fica de pé")
    assert.equal(
      db.table("review_items")[0]?.["next_review_at"],
      "2026-03-10T15:10:00.000Z",
      "o agendamento da outra aba não é sobrescrito",
    )
    assert.ok(res.session, "o cliente recebe o estado atual para recarregar a fila")
  })

  it("não responde card em sessão de outro aluno", async () => {
    const { answerReviewCard } = await loadService()
    const { sessionId, itemId } = await openSession()

    const res = await answerReviewCard(
      client(db),
      OTHER_USER,
      { sessionId, itemId, grade: 3, durationSeconds: 5, clientOperationId: "op-x" },
      NOW,
    )

    assert.equal(res.error, "Sessão de revisão não está aberta.")
    assert.equal(db.table("review_history").length, 0)
  })

  it("responder antes do vencimento é registrado como antecipado", async () => {
    const { answerReviewCard } = await loadService()
    const { sessionId, itemId } = await openSession()
    await client(db)
      .from("review_items")
      .update({ next_review_at: NEXT_WEEK, review_count: 0 })
      .eq("id", itemId)

    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 8, clientOperationId: "op-antecipada" },
      NOW,
    )

    assert.equal(db.table("review_history")[0]?.["early"], true)
  })

  it("a retenção da página passa a refletir as respostas reais", async () => {
    const { answerReviewCard, getReviewsOverview, addEditalContentToReview } = await loadService()
    const { sessionId, itemId } = await openSession()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-2", NOW)
    const secondItem = String(db.table("review_items").find((r) => r["source_id"] === "topic-2")?.["id"])

    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 5, clientOperationId: "op-1" },
      NOW,
    )
    await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId: secondItem, grade: 1, durationSeconds: 5, clientOperationId: "op-2" },
      NOW,
    )

    const overview = await getReviewsOverview(client(db), USER, NOW)
    assert.deepEqual(overview.retention, { rate: 0.5, answered: 2 })
  })
})

// ─── Suspender / arquivar ────────────────────────────────────────────────────

describe("Suspender e arquivar — histórico preservado", () => {
  async function itemWithHistory() {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const itemId = String(started.data?.card?.itemId)
    await answerReviewCard(
      client(db),
      USER,
      {
        sessionId: String(started.data?.sessionId),
        itemId,
        grade: 3,
        durationSeconds: 7,
        clientOperationId: "op-1",
      },
      NOW,
    )
    return itemId
  }

  it("suspender tira o item da fila sem apagar o histórico; reativar traz de volta", async () => {
    const { setReviewItemFlag, getReviewsOverview } = await loadService()
    const itemId = await itemWithHistory()

    assert.equal((await setReviewItemFlag(client(db), USER, itemId, "SUSPEND", NOW)).ok, true)
    let overview = await getReviewsOverview(client(db), USER, NOW)
    assert.equal(countsOf(overview).suspended, 1)
    assert.deepEqual(overview.due, [])
    assert.equal(overview.suspended[0]?.id, itemId)
    assert.equal(db.table("review_history").length, 1, "o histórico continua intacto")

    assert.equal((await setReviewItemFlag(client(db), USER, itemId, "UNSUSPEND", NOW)).ok, true)
    overview = await getReviewsOverview(client(db), USER, NOW)
    assert.equal(countsOf(overview).suspended, 0)
    assert.equal(db.table("review_items")[0]?.["suspended_at"], null)
  })

  it("arquivar tira da fila e mantém o histórico; restaurar devolve o item", async () => {
    const { setReviewItemFlag, getReviewsOverview } = await loadService()
    const itemId = await itemWithHistory()

    await setReviewItemFlag(client(db), USER, itemId, "ARCHIVE", NOW)
    let overview = await getReviewsOverview(client(db), USER, NOW)
    assert.equal(countsOf(overview).archived, 1)
    assert.deepEqual(overview.due, [])
    assert.equal(overview.archived[0]?.id, itemId)
    assert.equal(db.table("review_history").length, 1)

    await setReviewItemFlag(client(db), USER, itemId, "RESTORE", NOW)
    overview = await getReviewsOverview(client(db), USER, NOW)
    assert.equal(countsOf(overview).archived, 0)
  })

  it("não é possível suspender item de outro aluno", async () => {
    const { addEditalContentToReview, setReviewItemFlag } = await loadService()
    await addEditalContentToReview(client(db), OTHER_USER, "EDITAL_TOPIC", "topic-1", NOW)
    const itemId = String(db.table("review_items")[0]?.["id"])

    const res = await setReviewItemFlag(client(db), USER, itemId, "SUSPEND", NOW)
    assert.equal(res.ok, false)
    assert.equal(res.error, "Item de revisão não encontrado.")
    assert.equal(db.table("review_items")[0]?.["suspended_at"], undefined)
  })

  it("item suspenso não pode ser respondido", async () => {
    const { answerReviewCard, setReviewItemFlag, startReviewSession } = await loadService()
    const itemId = await itemWithHistory()
    const session = String(db.table("review_sessions")[0]?.["id"])
    await setReviewItemFlag(client(db), USER, itemId, "SUSPEND", NOW)

    const res = await answerReviewCard(
      client(db),
      USER,
      { sessionId: session, itemId, grade: 3, durationSeconds: 5, clientOperationId: "op-2" },
      NOW,
    )
    assert.equal(res.error, "Este item está suspenso ou arquivado.")

    const started = await startReviewSession(client(db), USER, { itemId }, NOW)
    assert.equal(started.error, "Este item está suspenso ou arquivado.")
  })
})

// ─── Encerrar sessão: caminhos que não dependem do Next/ciclo ────────────────

describe("Encerrar sessão — caminhos seguros", () => {
  it("sessão sem nenhuma resposta é encerrada sem gravar estudo", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    const res = await finalizeSession(client(db), USER, sessionId, NOW)
    assert.equal(res.cycleSyncError, null)
    assert.equal(db.table("study_history").length, 0, "sessão vazia não vira tempo de estudo")
    assert.equal(db.table("review_sessions")[0]?.["status"], "COMPLETED")
    assert.equal(db.table("review_sessions")[0]?.["finished_at"], NOW)
  })

  it("encerrar de novo a mesma sessão não grava nada (trava de idempotência)", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    await finalizeSession(client(db), USER, sessionId, NOW)
    const again = await finalizeSession(client(db), USER, sessionId, "2026-03-10T16:00:00.000Z")

    assert.equal(again.cycleSyncError, null)
    assert.equal(db.table("study_history").length, 0)
    assert.equal(
      db.table("review_sessions")[0]?.["finished_at"],
      NOW,
      "a segunda chamada não sobrescreve o encerramento da primeira",
    )
  })

  it("sessão de outro aluno não pode ser encerrada", async () => {
    const { startReviewSession, finalizeSession } = await loadService()
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)

    await finalizeSession(client(db), OTHER_USER, sessionId, NOW)
    assert.equal(db.table("review_sessions")[0]?.["status"], "ACTIVE")
  })
})

// ─── Catálogo para adicionar conteúdo ────────────────────────────────────────

describe("Catálogo do edital", () => {
  it("lista as disciplinas do aluno, os tópicos e marca o que já está em revisão", async () => {
    const { addEditalContentToReview, getReviewCatalog } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_SUBTOPIC", "sub-1", NOW)

    const catalog = await getReviewCatalog(client(db), USER, null)
    assert.deepEqual(catalog.disciplines, [{ id: DISCIPLINE, name: "Direito Administrativo" }])
    assert.equal(catalog.disciplineId, DISCIPLINE)
    assert.deepEqual(
      catalog.topics.map((t) => t.name),
      ["Atos administrativos", "Licitações"],
    )

    const first = catalog.topics.find((t) => t.id === "topic-1")
    assert.equal(first?.inReview, false, "o tópico em si não foi adicionado")
    assert.equal(first?.subtopics[0]?.id, "sub-1")
    assert.equal(first?.subtopics[0]?.inReview, true, "o subtópico já está em revisão")
  })

  it("disciplina com mais de 1.000 subtópicos aparece inteira (leitura paginada, sem corte silencioso)", async () => {
    const { getReviewCatalog } = await loadService()
    const big = new FakeReviewDb({
      disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
      user_disciplines: [
        {
          user_id: USER,
          discipline_id: DISCIPLINE,
          disciplines: { id: DISCIPLINE, name: "Direito Administrativo" },
        },
      ],
      topics: [{ id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null }],
      subtopics: Array.from({ length: 1200 }, (_, k) => ({
        id: `sub-${String(k).padStart(5, "0")}`,
        name: `Subtópico ${String(k).padStart(5, "0")}`,
        topic_id: "topic-1",
      })),
      review_items: [],
    })

    const catalog = await getReviewCatalog(client(big), USER, null)
    assert.equal(catalog.topics[0]?.subtopics.length, 1200, "nenhum subtópico pode ser perdido no caminho")
  })

  it("marcar \"já está em revisão\" funciona mesmo numa disciplina enorme", async () => {
    const { addEditalContentToReview, getReviewCatalog } = await loadService()
    const big = new FakeReviewDb({
      disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
      user_disciplines: [
        {
          user_id: USER,
          discipline_id: DISCIPLINE,
          disciplines: { id: DISCIPLINE, name: "Direito Administrativo" },
        },
      ],
      topics: [{ id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null }],
      subtopics: Array.from({ length: 1200 }, (_, k) => ({
        id: `sub-${String(k).padStart(5, "0")}`,
        name: `Subtópico ${String(k).padStart(5, "0")}`,
        topic_id: "topic-1",
      })),
      review_items: [],
    })

    // O conteúdo adicionado está no fim da árvore: uma consulta cortada em
    // 1.000 linhas (ou por lista de ids) não o veria.
    await addEditalContentToReview(client(big), USER, "EDITAL_SUBTOPIC", "sub-01150", NOW)
    const catalog = await getReviewCatalog(client(big), USER, null)
    const marked = catalog.topics[0]?.subtopics.find((sub) => sub.id === "sub-01150")
    assert.equal(marked?.inReview, true)
  })

  it("aluno sem disciplina cadastrada recebe catálogo vazio, não um erro", async () => {
    const { getReviewCatalog } = await loadService()
    const catalog = await getReviewCatalog(client(db), OTHER_USER, null)
    assert.deepEqual(catalog.disciplines, [])
    assert.equal(catalog.disciplineId, null)
    assert.deepEqual(catalog.topics, [])
  })
})
