import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

/**
 * G2.1 FASE 2 — filtro por período das reviews (client-side, sem backend).
 *
 * Contrato: filtra as listas já ordenadas do servidor SEM reordenar;
 * contagens do resumo seguem globais; erro de leitura (counts null) nunca
 * vira vazio filtrado; FSRS e due-dates intocados.
 */

import {
  filterReviewQueue,
  REVIEW_PERIOD_FILTERS,
} from "./review-queue"

const TODAY = "2026-09-29"

function item(id: string, dueAt: string, reps = 1) {
  return { id, dueAt, reps }
}

const DUE = [
  item("over-1", "2026-09-20T12:00:00.000Z", 2), // OVERDUE
  item("today-1", "2026-09-29T12:00:00.000Z", 3), // TODAY (reps>0)
  item("new-1", "2026-09-29T12:00:00.000Z", 0), // NEW (reps=0)
]

const UPCOMING = [
  item("up-3d", "2026-10-02T12:00:00.000Z", 1),
  item("up-30d", "2026-10-29T12:00:00.000Z", 1),
]

describe("G2.1 — filtro por período (puro)", () => {
  it("todas devolve tudo na ordem canônica", () => {
    assert.deepEqual(filterReviewQueue(DUE, "todas", TODAY), DUE)
    assert.deepEqual(filterReviewQueue(UPCOMING, "todas", TODAY), UPCOMING)
  })

  it("atrasadas: só OVERDUE", () => {
    assert.deepEqual(filterReviewQueue(DUE, "atrasadas", TODAY).map((i) => i.id), ["over-1"])
    assert.deepEqual(filterReviewQueue(UPCOMING, "atrasadas", TODAY), [])
  })

  it("hoje: TODAY + NEW (vencem hoje), sem atrasadas nem futuras", () => {
    assert.deepEqual(filterReviewQueue(DUE, "hoje", TODAY).map((i) => i.id), ["today-1", "new-1"])
    assert.deepEqual(filterReviewQueue(UPCOMING, "hoje", TODAY), [])
  })

  it("proximos-7d: futuro dentro do horizonte (exclui hoje, passado e além)", () => {
    const horizon = "2026-10-06"
    assert.deepEqual(filterReviewQueue(UPCOMING, "proximos-7d", TODAY, horizon).map((i) => i.id), ["up-3d"])
    assert.deepEqual(filterReviewQueue(DUE, "proximos-7d", TODAY, horizon), [])
  })

  it("item sem data legível não some: fica em todas, fora das janelas", () => {
    const odd = [item("nodate", "", 1)]
    assert.deepEqual(filterReviewQueue(odd, "todas", TODAY).map((i) => i.id), ["nodate"])
    assert.deepEqual(filterReviewQueue(odd, "atrasadas", TODAY), [])
    assert.deepEqual(filterReviewQueue(odd, "proximos-7d", TODAY, "2026-10-06"), [])
  })

  it("sem horizonte não filtra proximos-7d (falha segura = tudo)", () => {
    assert.deepEqual(filterReviewQueue(UPCOMING, "proximos-7d", TODAY).map((i) => i.id), ["up-3d", "up-30d"])
  })

  it("opções expostas são exatamente as 4 contratadas", () => {
    assert.deepEqual(REVIEW_PERIOD_FILTERS.map((f) => f.id), ["todas", "atrasadas", "hoje", "proximos-7d"])
  })
})

describe("G2.1 — filtro não contamina dados nem erro (wiring)", () => {
  function view(): string {
    return fs.readFileSync(path.join(process.cwd(), "src/features/reviews/components/reviews-view.tsx"), "utf-8")
  }

  it("erro de leitura continua sendo erro (counts null ≠ vazio)", () => {
    const source = view()
    assert.ok(source.includes("if (counts === null)"), "branch de erro preservado")
    assert.ok(source.includes("Não foi possível carregar suas revisões"))
  })

  it("resumo/contagens seguem globais (não filtrados)", () => {
    const source = view()
    assert.ok(source.includes("const dueTotal = counts.overdue + counts.today + counts.newItems"))
    assert.ok(source.includes('label="Próximas" value={counts.upcoming}'))
  })

  it("controle com estado selecionado e aria (teclado/mobile)", () => {
    const source = view()
    assert.ok(source.includes('aria-pressed={active}'), "estado selecionado anunciado")
    assert.ok(source.includes('aria-label="Filtrar revisões por período"'))
    assert.ok(source.includes("useState<ReviewPeriodFilter>"), "estado local, sem URL")
  })

  it("sem nova query: filtro usa due/upcoming já carregados", () => {
    const source = view()
    assert.ok(source.includes("filterReviewQueue(due,"), "fila filtra o array due")
    assert.ok(source.includes("filterReviewQueue(upcoming,"), "próximos filtram o array upcoming")
    assert.equal(source.includes("getReviewsOverviewAction("), true, "refresh inalterado")
  })
})
