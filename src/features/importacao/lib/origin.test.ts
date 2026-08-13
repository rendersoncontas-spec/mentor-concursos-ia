import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { normalizeOrigin, originDisplayName } from "./origin"

describe("normalizeOrigin", () => {
  it("Aprovado vira slug aprovado com nome canônico", () => {
    assert.deepEqual(normalizeOrigin("aprovado", ""), { source: "aprovado", sourceName: "Aprovado" })
  })

  it("Estudei vira slug estudei com nome canônico", () => {
    assert.deepEqual(normalizeOrigin("estudei", ""), { source: "estudei", sourceName: "Estudei" })
  })

  it("outra com nome vazio retorna null", () => {
    assert.equal(normalizeOrigin("outra", "   "), null)
  })

  it("outra reconhece plataforma conhecida (Gran)", () => {
    assert.deepEqual(normalizeOrigin("outra", "Gran"), { source: "gran", sourceName: "Gran" })
  })

  it("outra reconhece plataforma conhecida ignorando acentos e caixa", () => {
    assert.deepEqual(normalizeOrigin("outra", "tEc CóNcUrSos"), {
      source: "tec",
      sourceName: "TEC Concursos",
    })
  })

  it("outra com plataforma desconhecida mantém nome informado", () => {
    assert.deepEqual(normalizeOrigin("outra", "Estratégia"), {
      source: "outra",
      sourceName: "Estratégia",
    })
  })
})

describe("originDisplayName", () => {
  it("usa sourceName quando presente", () => {
    assert.equal(originDisplayName("outra", "Estratégia"), "Estratégia")
  })

  it("usa fallback por slug", () => {
    assert.equal(originDisplayName("aprovado", null), "Aprovado")
    assert.equal(originDisplayName("tec", null), "TEC Concursos")
  })
})
