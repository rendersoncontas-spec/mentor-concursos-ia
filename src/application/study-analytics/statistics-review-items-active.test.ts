// ============================================================================
// Fase I.3 — "revisão pendente" nas Estatísticas é a MESMA coisa que na fila de
// Revisões: item ativo, ou seja, não suspenso e não arquivado.
//
// O bug que estes testes impedem de voltar: a consulta de review_items das
// Estatísticas trazia todos os itens do aluno, sem os filtros de suspensão e
// arquivamento (colunas que passaram a existir na Fase I.1). Resultado: o aluno
// suspendia um tópico, ele saía da fila de Revisões e continuava contando como
// "revisão pendente" em /estatisticas — dois números diferentes para a mesma
// pergunta.
//
// A regra vive num único lugar (activeReviewItemsOnly, em review.repository.ts).
// Estes testes verificam as duas pontas: o comportamento real da regra sobre uma
// consulta igual à das Estatísticas, e o fato de a consulta das Estatísticas
// realmente passar por ela em vez de repetir os filtros à mão.
//
// Datas fixas, nenhum Math.random().
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { activeReviewItemsOnly } from "@/application/review-engine/review.repository"
import {
  computeRevisionStatistics,
  sanitizeReviewItem,
  type DisciplineMeta,
  type ReviewItemRow,
} from "@/application/study-analytics/engine/stats-engine"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"

const USER = "aluno-1"
const OTHER_USER = "aluno-2"
const DISCIPLINE = "disc-1"

// Hoje = 2026-03-10 em São Paulo (12:00 local = 15:00 UTC).
const NOW = new Date("2026-03-10T15:00:00.000Z")
const OVERDUE_AT = "2026-03-05T15:00:00.000Z"
const TODAY_AT = "2026-03-10T20:00:00.000Z"
const FUTURE_AT = "2026-03-20T15:00:00.000Z"

/** Linhas de review_items como o banco real as tem, incluindo as flags novas. */
function rows() {
  return [
    // ativos do aluno
    { id: "ativo-atrasado", user_id: USER, discipline_id: DISCIPLINE, next_review_at: OVERDUE_AT, suspended_at: null, archived_at: null },
    { id: "ativo-hoje", user_id: USER, discipline_id: DISCIPLINE, next_review_at: TODAY_AT, suspended_at: null, archived_at: null },
    { id: "ativo-futuro", user_id: USER, discipline_id: DISCIPLINE, next_review_at: FUTURE_AT, suspended_at: null, archived_at: null },
    // suspenso e arquivado (vencidos: contariam como pendentes sem o filtro)
    { id: "suspenso", user_id: USER, discipline_id: DISCIPLINE, next_review_at: OVERDUE_AT, suspended_at: "2026-03-09T12:00:00.000Z", archived_at: null },
    { id: "arquivado", user_id: USER, discipline_id: DISCIPLINE, next_review_at: OVERDUE_AT, suspended_at: null, archived_at: "2026-03-08T12:00:00.000Z" },
    // de outro aluno (também vencido)
    { id: "de-outro-aluno", user_id: OTHER_USER, discipline_id: DISCIPLINE, next_review_at: OVERDUE_AT, suspended_at: null, archived_at: null },
  ]
}

/** Mesma consulta que as Estatísticas fazem, com a regra de item ativo aplicada. */
async function loadActiveItems(): Promise<string[]> {
  const db = new FakePostgrest({ review_items: rows() })
  const result = (await activeReviewItemsOnly(
    db
      .from("review_items")
      .select("id, discipline_id, next_review_at")
      .eq("user_id", USER),
  ).order("id", { ascending: true })) as unknown as { data: Record<string, unknown>[] }
  return result.data.map((row) => String(row["id"]))
}

describe("Estatísticas — revisão pendente é item ativo", () => {
  it("item ativo é contado", async () => {
    const ids = await loadActiveItems()
    assert.ok(ids.includes("ativo-atrasado"), "item ativo e vencido tem de aparecer")
    assert.ok(ids.includes("ativo-hoje"))
    assert.ok(ids.includes("ativo-futuro"))
  })

  it("item suspenso NÃO é contado", async () => {
    const ids = await loadActiveItems()
    assert.equal(ids.includes("suspenso"), false)
  })

  it("item arquivado NÃO é contado", async () => {
    const ids = await loadActiveItems()
    assert.equal(ids.includes("arquivado"), false)
  })

  it("item de outro aluno NÃO é contado", async () => {
    const ids = await loadActiveItems()
    assert.equal(ids.includes("de-outro-aluno"), false)
  })

  it("o número que a página mostra sai certo — e a consulta antiga daria 5 em vez de 3", () => {
    const registry = new Map<string, DisciplineMeta>([
      [DISCIPLINE, { id: DISCIPLINE, name: "Direito Administrativo", area: null }],
    ])
    const toItems = (ids: string[]): ReviewItemRow[] =>
      ids
        .map((id) => {
          const row = rows().find((r) => r.id === id)
          return sanitizeReviewItem({
            id: row?.id,
            discipline_id: row?.discipline_id,
            next_review_at: row?.next_review_at,
          })
        })
        .filter((r): r is ReviewItemRow => r !== null)

    // Como fica AGORA: só os três itens ativos do aluno.
    const corrigido = computeRevisionStatistics(
      toItems(["ativo-atrasado", "ativo-hoje", "ativo-futuro"]),
      0,
      NOW,
      registry,
    )
    assert.equal(corrigido.overdue, 1, "só a atrasada ativa")
    assert.equal(corrigido.dueToday, 1)
    assert.equal(corrigido.upcoming, 1)
    // `totalPending` neste motor significa "itens agendados" (atrasados + de hoje
    // + próximos) — definição já existente, que esta fase não muda.
    assert.equal(corrigido.totalPending, 3)

    // Como era ANTES: a consulta sem filtro trazia também o suspenso e o
    // arquivado, ambos vencidos — três atrasadas e cinco agendadas.
    const antigo = computeRevisionStatistics(
      toItems(["ativo-atrasado", "ativo-hoje", "ativo-futuro", "suspenso", "arquivado"]),
      0,
      NOW,
      registry,
    )
    assert.equal(antigo.overdue, 3)
    assert.equal(antigo.totalPending, 5)
    assert.ok(
      antigo.totalPending > corrigido.totalPending,
      "é exatamente essa diferença que o filtro de item ativo corrige",
    )
  })

  it("sem item algum, o resultado é zero medido — e não um zero inventado por consulta quebrada", async () => {
    const db = new FakePostgrest({ review_items: [] })
    const result = (await activeReviewItemsOnly(
      db.from("review_items").select("id").eq("user_id", USER),
    )) as unknown as { data: Record<string, unknown>[] }
    assert.deepEqual(result.data, [])

    const registry = new Map<string, DisciplineMeta>()
    const stats = computeRevisionStatistics([], 0, NOW, registry)
    assert.equal(stats.totalPending, 0)
    assert.equal(stats.completionRate, null, "sem base, a taxa é null, nunca 0%")
  })
})

describe("Estatísticas — a regra de item ativo tem uma fonte única", () => {
  it("a consulta das Estatísticas passa por activeReviewItemsOnly", () => {
    const src = readFileSync(
      join(process.cwd(), "src/application/study-analytics/statistics-center.action.ts"),
      "utf-8",
    )
    const idx = src.indexOf('.from("review_items")')
    assert.notEqual(idx, -1, "as Estatísticas ainda leem review_items")
    const window = src.slice(Math.max(0, idx - 400), idx)
    assert.ok(
      window.includes("activeReviewItemsOnly("),
      "a leitura de review_items das Estatísticas precisa aplicar a regra de item ativo",
    )
  })

  it("as Estatísticas não repetem os filtros à mão (a regra não pode virar duas)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/application/study-analytics/statistics-center.action.ts"),
      "utf-8",
    )
    assert.equal(src.includes('.is("suspended_at", null)'), false)
    assert.equal(src.includes('.is("archived_at", null)'), false)
  })

  it("a fila de Revisões usa a MESMA função (nenhum filtro manual sobrou no repositório)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/application/review-engine/review.repository.ts"),
      "utf-8",
    )
    // A única definição é a da própria função; listFlagged filtra o contrário
    // (item suspenso/arquivado) e por isso mantém seu próprio filtro.
    const manual = src
      .split("\n")
      .filter((line) => line.includes('.is("suspended_at", null)'))
      .map((line) => line.trim())
    assert.deepEqual(manual, ['return query.is("suspended_at", null).is("archived_at", null)'])
  })
})
