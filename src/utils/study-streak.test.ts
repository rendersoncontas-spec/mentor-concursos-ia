import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { computeStreak, localDateKey } from "./study-streak"

/**
 * Fase 5 da auditoria de estabilização (timezone): reescrito para testar
 * localDateKey/computeStreak de forma determinística, com chaves
 * "YYYY-MM-DD" explícitas em vez de derivar tudo de `new Date()` relativo ao
 * relógio real do sistema (o comportamento antigo do arquivo). Ver
 * src/lib/sao-paulo.test.ts e
 * src/application/study-analytics/aggregations-streak.test.ts para o mesmo
 * padrão aplicado aos outros dois cálculos de sequência/bucketing por dia do
 * projeto.
 */

describe("localDateKey: bucketa um timestamp no fuso de São Paulo (não no fuso local do runtime)", () => {
  it("formata YYYY-MM-DD no fuso de SP para um horário comum", () => {
    // 2026-01-05T14:00:00Z = 2026-01-05T11:00:00-03:00
    assert.equal(localDateKey(new Date("2026-01-05T14:00:00.000Z")), "2026-01-05")
  })

  it("22h em São Paulo (01h UTC do dia seguinte) continua no dia de SP, não no de UTC", () => {
    // 2026-08-28T01:00:00Z = 2026-08-27T22:00:00-03:00 — ainda dia 27 em SP
    assert.equal(localDateKey(new Date("2026-08-28T01:00:00.000Z")), "2026-08-27")
  })
})

describe("computeStreak: sequência de dias consecutivos (fuso de SP)", () => {
  it("sequência contínua até hoje", () => {
    const days = new Set(["2026-08-27", "2026-08-26", "2026-08-25", "2026-08-22"])
    assert.equal(computeStreak(days, "2026-08-27"), 3)
  })

  it("hoje sem sessão conta a partir de ontem", () => {
    const days = new Set(["2026-08-26", "2026-08-25", "2026-08-24"])
    assert.equal(computeStreak(days, "2026-08-27"), 3)
  })

  it("lacuna quebra a sequência", () => {
    const days = new Set(["2026-08-27", "2026-08-26", "2026-08-24"])
    assert.equal(computeStreak(days, "2026-08-27"), 2)
  })

  it("conjunto vazio retorna 0", () => {
    assert.equal(computeStreak(new Set(), "2026-08-27"), 0)
  })

  it("virada de mês: sequência que atravessa 31/08 -> 01/09", () => {
    const days = new Set(["2026-09-01", "2026-08-31", "2026-08-30"])
    assert.equal(computeStreak(days, "2026-09-01"), 3)
  })

  it("virada de ano: sequência que atravessa 31/12 -> 01/01", () => {
    const days = new Set(["2026-01-01", "2025-12-31", "2025-12-30"])
    assert.equal(computeStreak(days, "2026-01-01"), 3)
  })

  it("usa a data de hoje em SP como padrão quando nenhuma referência é passada", () => {
    assert.equal(computeStreak(new Set(["2000-01-01"])), 0)
  })
})
