// ============================================================================
// Fase I.5 — achado A2 da auditoria: erro de consulta NÃO pode virar zero.
//
// O que existia: `countActive` devolvia `0` quando o PostgREST respondia erro, e
// as listas devolviam `[]`. A página de Revisões então mostrava "Para revisar
// agora: 0", "0 atrasadas", "Você não tem revisões agendadas" e desabilitava o
// botão de revisar — com o banco simplesmente não tendo respondido. Não havia
// nenhuma forma de distinguir "não há revisões" de "não deu para ler".
//
// Agora: leitura que falha devolve `null` no repositório, a visão geral entra em
// estado de erro explícito (`counts: null`) e a UI diz isso ao aluno.
//
// Datas fixas, nenhum Math.random(). O banco falso simula o erro com o mesmo
// formato `{ error }` que o PostgREST devolveria.
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
const NOW = "2026-03-10T15:00:00.000Z" // 12:00 em São Paulo
const OVERDUE_AT = "2026-03-05T15:00:00.000Z"

function fixture(items: Record<string, unknown>[] = []): FakeReviewDb {
  return new FakeReviewDb({
    disciplines: [{ id: DISCIPLINE, name: "Direito Administrativo" }],
    topics: [{ id: "topic-1", name: "Atos administrativos", discipline_id: DISCIPLINE, user_id: null }],
    subtopics: [],
    review_items: items,
    review_history: [],
    review_sessions: [],
    study_history: [],
  })
}

function activeItem(id: string, dueAt: string, reps: number): Record<string, unknown> {
  return {
    id,
    user_id: USER,
    discipline_id: DISCIPLINE,
    source_type: "EDITAL_TOPIC",
    source_id: "topic-1",
    review_stage: reps > 0 ? "REVIEW" : "NEW",
    stability_score: 0,
    difficulty: null,
    scheduled_days: 0,
    learning_steps: 0,
    review_count: reps,
    lapses_count: 0,
    last_review_at: null,
    next_review_at: dueAt,
    suspended_at: null,
    archived_at: null,
    created_at: dueAt,
    updated_at: dueAt,
  }
}

function client(db: FakeReviewDb): Parameters<Service["getReviewsOverview"]>[0] {
  return db as unknown as Parameters<Service["getReviewsOverview"]>[0]
}

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

/** Código sem comentários: eles citam de propósito os padrões proibidos. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

let db: FakeReviewDb

beforeEach(() => {
  db = fixture()
})

describe("A2 — zero real continua sendo zero", () => {
  it("banco responde count = 0: as contagens são zeros medidos, não estado de erro", async () => {
    const { getReviewsOverview } = await loadService()
    const overview = await getReviewsOverview(client(db), USER, NOW)

    assert.ok(overview.counts, "consulta respondeu: counts não pode ser null")
    assert.deepEqual(overview.counts, {
      overdue: 0,
      today: 0,
      newItems: 0,
      upcoming: 0,
      suspended: 0,
      archived: 0,
    })
    assert.deepEqual(overview.due, [])
    assert.equal(overview.nextDueAt, null)
  })

  it("banco responde count > 0: os números chegam reais", async () => {
    const { getReviewsOverview } = await loadService()
    const withItems = fixture([
      activeItem("i-atrasado", OVERDUE_AT, 3),
      activeItem("i-novo", NOW, 0),
    ])

    const overview = await getReviewsOverview(client(withItems), USER, NOW)

    assert.ok(overview.counts)
    assert.equal(overview.counts.overdue, 1)
    assert.equal(overview.counts.newItems, 1)
    assert.equal(overview.due.length, 2)
  })
})

describe("A2 — erro de consulta não vira zero", () => {
  it("erro na contagem: counts é null (nunca 0)", async () => {
    const { getReviewsOverview } = await loadService()
    const withItems = fixture([activeItem("i-atrasado", OVERDUE_AT, 3)])
    withItems.failOn({ table: "review_items", head: true })

    const overview = await getReviewsOverview(client(withItems), USER, NOW)

    assert.equal(overview.counts, null, "erro de leitura não pode virar contagem zerada")
  })

  it("erro em UMA das seis contagens já coloca a visão geral em estado de erro", async () => {
    const { getReviewsOverview } = await loadService()
    const withItems = fixture([activeItem("i-atrasado", OVERDUE_AT, 3)])
    withItems.failOn({ table: "review_items", head: true, times: 1 })

    const overview = await getReviewsOverview(client(withItems), USER, NOW)

    assert.equal(overview.counts, null, "cinco números certos e um zero inventado seria pior")
    assert.deepEqual(overview.due, [])
    assert.deepEqual(overview.upcoming, [])
    assert.equal(overview.nextDueAt, null)
    assert.deepEqual(overview.retention, { rate: null, answered: 0 })
  })

  it("erro ao listar a fila também é estado de erro, não fila vazia", async () => {
    const { getReviewsOverview } = await loadService()
    const withItems = fixture([activeItem("i-atrasado", OVERDUE_AT, 3)])
    withItems.failOn({ table: "review_items", head: false })

    const overview = await getReviewsOverview(client(withItems), USER, NOW)

    assert.equal(overview.counts, null)
    assert.deepEqual(overview.due, [])
  })

  it("erro ao ler as notas (retenção) também é estado de erro", async () => {
    const { getReviewsOverview } = await loadService()
    const withItems = fixture([activeItem("i-atrasado", OVERDUE_AT, 3)])
    withItems.failOn({ table: "review_history", head: false })

    const overview = await getReviewsOverview(client(withItems), USER, NOW)

    assert.equal(overview.counts, null)
  })

  it("a sessão não abre com \"nada para revisar\" quando a fila não pôde ser lida", async () => {
    const { startReviewSession } = await loadService()
    const withItems = fixture([activeItem("i-atrasado", OVERDUE_AT, 3)])
    withItems.failOn({ table: "review_items", head: false })

    const res = await startReviewSession(client(withItems), USER, {}, NOW)

    assert.equal(res.data, null)
    assert.ok(res.error, "precisa dizer que não foi possível carregar a fila")
    assert.match(String(res.error), /não foi possível/i)
  })

  it("a contagem restante da sessão é null (não 0) quando não pôde ser lida", async () => {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)
    const itemId = String(started.data?.card?.itemId)

    // A resposta é gravada normalmente; só a contagem seguinte falha.
    db.failOn({ table: "review_items", head: true })
    const res = await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 5, clientOperationId: "op-1" },
      NOW,
    )

    assert.equal(res.error, null)
    assert.equal(res.session?.remaining, null, "fila desconhecida é null, nunca 0")
    assert.equal(db.table("review_history").length, 1, "a resposta do aluno continua registrada")
  })
})

describe("A2 — nenhum fallback de erro usando zero no módulo", () => {
  it("o repositório não converte erro em 0 nem em lista vazia nas leituras do overview", () => {
    const src = code("src/application/review-engine/review.repository.ts")
    assert.equal(/error\s*\?\s*0/.test(src), false, "não pode haver `error ? 0`")
    assert.equal(/catch[\s\S]{0,40}return 0/.test(src), false, "não pode haver catch → 0")
    // Fase I.6: o último fallback que restava (catálogo de disciplinas do modal
    // "Adicionar à revisão") também foi corrigido — agora NENHUMA leitura do
    // repositório transforma erro em lista vazia.
    const emptyFallbacks = (src.match(/if \(error\) return \[\]/g) ?? []).length
    assert.equal(emptyFallbacks, 0, `nenhum fallback de lista vazia esperado, encontrados ${emptyFallbacks}`)
  })

  it("as contagens e as listas da fila declaram explicitamente que podem falhar", () => {
    const src = read("src/application/review-engine/review.repository.ts")
    assert.match(src, /countBuckets\([\s\S]{0,200}?\): Promise<ReviewCounts \| null>/)
    assert.match(src, /listDueGroup\([\s\S]{0,260}?\): Promise<ReviewItem\[\] \| null>/)
    assert.match(src, /countSessionAnswers\([\s\S]{0,160}?\): Promise<number \| null>/)
    assert.match(src, /listSessionAnswers\([\s\S]{0,200}?\): Promise<SessionAnswer\[\] \| null>/)
  })
})

describe("A2 — a UI diferencia zero real de falha", () => {
  const view = read("src/features/reviews/components/reviews-view.tsx")

  it("existe um caminho de erro que não mostra contagens", () => {
    assert.match(view, /if \(counts === null\)/, "a view precisa tratar counts nulo")
    const errorBranch = view.slice(view.indexOf("if (counts === null)"), view.indexOf("const dueTotal"))
    assert.match(errorBranch, /Não foi possível carregar suas revisões/)
    assert.equal(
      errorBranch.includes("Você não tem revisões agendadas"),
      false,
      "erro de carregamento não pode dizer que o aluno não tem revisões",
    )
    assert.equal(errorBranch.includes("counts.overdue"), false, "nenhuma contagem é exibida no estado de erro")
    assert.equal(errorBranch.includes("Metric"), false, "nenhuma métrica é exibida no estado de erro")
  })

  it("o botão de revisar não é desabilitado por falta de dado que não foi lido", () => {
    const errorBranch = view.slice(view.indexOf("if (counts === null)"), view.indexOf("const dueTotal"))
    assert.match(errorBranch, /Iniciar revisão/)
    assert.equal(
      /disabled=\{dueTotal === 0/.test(errorBranch),
      false,
      "no estado de erro não existe dueTotal — desabilitar aqui seria falsa ausência de dados",
    )
  })

  it("a frase \"não tem revisões agendadas\" só existe no caminho com contagem lida", () => {
    const summary = view.slice(view.indexOf("function queueSummary"), view.indexOf("function ItemRow"))
    assert.match(summary, /Você não tem revisões agendadas/)
    // queueSummary recebe números; só é chamada depois da guarda de counts nulo.
    assert.match(view, /\{queueSummary\(dueTotal, nextDueAt\)\}/)
  })

  it("o modal da sessão mostra \"—\" quando a fila não pôde ser contada", () => {
    const modal = read("src/features/reviews/components/review-session-modal.tsx")
    assert.match(modal, /remaining === null \? "—"/)
    assert.equal(/remaining \?\? 0/.test(modal), false, "não pode voltar a tratar fila desconhecida como 0")
  })

  it("o encerramento automático só acontece com a fila lida e vazia", () => {
    const modal = read("src/features/reviews/components/review-session-modal.tsx")
    assert.match(modal, /!next\.card && next\.remaining === 0/)
  })
})

describe("I.7 — o contador de respostas da sessão também não vira zero falso", () => {
  it("sessão ilegível no meio da resposta: itemsAnswered é null, não 0", async () => {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)
    const sessionId = String(started.data?.sessionId)
    const itemId = String(started.data?.card?.itemId)

    // A primeira leitura da sessão (a conferência de que ela está ACTIVE) passa;
    // a releitura para montar o estado falha. Antes isso virava "0 respondidas".
    db.failOn({ table: "review_sessions", head: false, skip: 1 })

    const res = await answerReviewCard(
      client(db),
      USER,
      { sessionId, itemId, grade: 3, durationSeconds: 8, clientOperationId: "op-1" },
      NOW,
    )

    assert.equal(res.error, null, "a resposta do aluno é gravada normalmente")
    assert.equal(db.table("review_history").length, 1)
    assert.equal(res.session?.itemsAnswered, null, "contador desconhecido é null, nunca 0")
  })

  it("com o banco respondendo, o contador é o número real de respostas", async () => {
    const { addEditalContentToReview, startReviewSession, answerReviewCard } = await loadService()
    await addEditalContentToReview(client(db), USER, "EDITAL_TOPIC", "topic-1", NOW)
    const started = await startReviewSession(client(db), USER, {}, NOW)

    const res = await answerReviewCard(
      client(db),
      USER,
      {
        sessionId: String(started.data?.sessionId),
        itemId: String(started.data?.card?.itemId),
        grade: 3,
        durationSeconds: 8,
        clientOperationId: "op-1",
      },
      NOW,
    )

    assert.equal(res.session?.itemsAnswered, 1, "zero de verdade e número real continuam funcionando")
  })

  it("o modal mostra \"—\" quando o contador não foi lido", () => {
    const modal = read("src/features/reviews/components/review-session-modal.tsx")
    assert.match(modal, /answered === null \? "—"/)
    assert.equal(
      /itemsAnswered \?\? 0/.test(modal),
      false,
      "não pode voltar a tratar contador desconhecido como 0",
    )
  })

  it("o estado da sessão declara no domínio que o contador pode faltar", () => {
    const models = read("src/domain/reviews/models.ts")
    const estado = models.slice(models.indexOf("export interface ReviewSessionState"), models.indexOf("export interface ReviewSessionReport"))
    assert.match(estado, /itemsAnswered: number \| null/)
  })
})
