// ============================================================================
// Fase I.6 — achado M3: nas Estatísticas, erro de consulta ≠ zero.
//
// A Fase I.5 corrigiu isso na página de Revisões; este módulo é independente e
// continuava com o mesmo defeito, em dois pontos:
//
//   • `loadReviewItems` devolvia `[]` em erro → a seção mostrava "Sem revisões";
//   • `loadReviewsCompletedLast30` nem checava o `error` do PostgREST e devolvia
//     `0` → "Concluídas 30d: 0", indistinguível de quem nunca revisou.
//
// Agora as duas leituras devolvem `null` em falha, o payload carrega essa
// ausência e a seção de revisões mostra erro em vez de número.
//
// Estes testes são estáticos onde o alvo é uma "use server" action que exige
// contexto de requisição do Next (não é possível chamá-la num teste de unidade), e
// de comportamento na parte pura — `computeRevisionStatistics`, que continua
// recebendo apenas dados reais.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  computeRevisionStatistics,
  type DisciplineMeta,
  type ReviewItemRow,
} from "@/application/study-analytics/engine/stats-engine"

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

/** Sem comentários: eles citam de propósito os padrões proibidos. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

const ACTION = "src/application/study-analytics/statistics-center.action.ts"
const VIEW = "src/features/statistics/components/statistics-center-view.tsx"

describe("M3 — as leituras de revisão das Estatísticas admitem falha", () => {
  it("o payload distingue ausência de dado de lista vazia", () => {
    const src = read(ACTION)
    assert.match(src, /reviewItems: ReviewItemRow\[\] \| null/)
    assert.match(src, /reviewsCompletedLast30: number \| null/)
  })

  it("loadReviewItems devolve null em erro (não lista vazia)", () => {
    const src = read(ACTION)
    const fn = src.slice(src.indexOf("async function loadReviewItems"), src.indexOf("async function loadReviewsCompletedLast30"))
    assert.match(fn, /Promise<ReviewItemRow\[\] \| null>/)
    assert.match(fn, /let reviewItems: ReviewItemRow\[\] \| null = null/)
  })

  it("a contagem de 30 dias passou a checar o error e devolve null em falha", () => {
    const src = read(ACTION)
    const start = src.indexOf("async function loadReviewsCompletedLast30")
    const fn = src.slice(start, src.indexOf("async function loadActivePlan", start))
    assert.match(fn, /Promise<number \| null>/)
    assert.match(fn, /const \{ count, error \} = await supabase/, "o error precisa ser lido")
    assert.match(fn, /if \(error\) \{[\s\S]{0,200}?return null/)
    assert.match(fn, /catch \(err\) \{[\s\S]{0,200}?return null/, "falha inesperada também é ausência")
    assert.equal(/reviewsCompletedLast30 = 0/.test(fn), false, "nenhum zero de consolo")
  })

  it("nenhuma das duas leituras de revisão usa zero ou lista vazia como fallback de erro", () => {
    const src = code(ACTION)
    const reviewBlock = src.slice(src.indexOf("async function loadReviewItems"), src.indexOf("async function loadActivePlan"))
    assert.equal(/catch[\s\S]{0,60}= 0/.test(reviewBlock), false)
    assert.equal(/return \[\]/.test(reviewBlock), false)
  })
})

describe("M3 — a interface mostra três estados diferentes", () => {
  const view = read(VIEW)
  const section = view.slice(view.indexOf("function RevisionSection"))

  it("estado de erro: diz que não foi possível carregar, sem número algum", () => {
    assert.match(section, /revision === null && \(/)
    const errorBranch = section.slice(section.indexOf("revision === null && ("), section.indexOf("revision !== null &&"))
    assert.match(errorBranch, /Não foi possível carregar as revisões/)
    assert.equal(errorBranch.includes("Sem revisões"), false)
    assert.equal(errorBranch.includes("Metric"), false, "nenhuma métrica no estado de erro")
  })

  it("estado vazio: continua existindo para quem realmente não tem revisões", () => {
    assert.match(section, /revision !== null && revision\.totalPending === 0 && revision\.completedLast30 === 0/)
    assert.match(section, /Sem revisões/)
  })

  it("estado com dados: só quando há algo medido", () => {
    assert.match(section, /revision !== null && \(revision\.totalPending > 0 \|\| revision\.completedLast30 > 0\)/)
    assert.match(section, /label="Concluídas 30d"/)
  })

  it("a estatística de revisão não é calculada quando a leitura falhou", () => {
    assert.match(
      view,
      /if \(!payload \|\| payload\.reviewItems === null \|\| payload\.reviewsCompletedLast30 === null\) return null/,
    )
    assert.equal(
      /payload\?\.reviewItems \?\? \[\]/.test(view),
      false,
      "não pode voltar a tratar ausência como lista vazia",
    )
    assert.equal(
      /payload\?\.reviewsCompletedLast30 \?\? 0/.test(view),
      false,
      "nem contagem ausente como zero",
    )
  })

  it("sem dado de revisão, os derivados ficam calados em vez de afirmar \"nenhum atraso\"", () => {
    assert.match(view, /EMPTY_REVISION_STATISTICS/)
    const constant = view.slice(view.indexOf("const EMPTY_REVISION_STATISTICS"), view.indexOf("const WEEK_START_LABEL"))
    assert.match(constant, /completionRate: null/, "taxa sem base é null, nunca 0%")
  })
})

describe("M3 — a parte pura continua recebendo só dado real", () => {
  const NOW = new Date("2026-03-10T15:00:00.000Z")
  const registry = new Map<string, DisciplineMeta>([
    ["disc-1", { id: "disc-1", name: "Direito Administrativo", area: null }],
  ])

  it("zero real continua produzindo zero e taxa null", () => {
    const stats = computeRevisionStatistics([], 0, NOW, registry)
    assert.equal(stats.totalPending, 0)
    assert.equal(stats.completedLast30, 0)
    assert.equal(stats.completionRate, null, "sem base, a taxa é null — não 0%")
  })

  it("com itens e concluídas reais, os números aparecem", () => {
    const items: ReviewItemRow[] = [
      { id: "a", disciplineId: "disc-1", status: null, nextReviewAt: "2026-03-05T15:00:00.000Z" },
      { id: "b", disciplineId: "disc-1", status: null, nextReviewAt: "2026-03-10T20:00:00.000Z" },
    ]
    const stats = computeRevisionStatistics(items, 4, NOW, registry)
    assert.equal(stats.overdue, 1)
    assert.equal(stats.dueToday, 1)
    assert.equal(stats.completedLast30, 4)
    assert.ok(stats.completionRate !== null)
  })
})
