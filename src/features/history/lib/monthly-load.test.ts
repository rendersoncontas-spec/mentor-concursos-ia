import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createRequestTracker,
  hasMonthlyError,
  initialMonthlyLoad,
  monthlyLoadReducer,
} from "./monthly-load"

// G2.24 — calendário do Histórico: erro é um estado, não "mês vazio".

describe("monthlyLoadReducer", () => {
  it("sucesso: idle → loading → ready (mês preservado)", () => {
    let s = initialMonthlyLoad(2026, 10)
    assert.equal(s.status, "idle")
    s = monthlyLoadReducer(s, { type: "start", year: 2026, month: 10 })
    assert.equal(s.status, "loading")
    s = monthlyLoadReducer(s, { type: "success", year: 2026, month: 10 })
    assert.deepEqual(s, { status: "ready", year: 2026, month: 10 })
  })

  it("falha vira erro do MESMO mês escolhido, e erro não é 'ready' (nunca parece mês vazio)", () => {
    let s = monthlyLoadReducer(initialMonthlyLoad(2026, 10), { type: "start", year: 2026, month: 9 })
    s = monthlyLoadReducer(s, { type: "failure", year: 2026, month: 9 })
    assert.equal(s.status, "error")
    assert.equal(hasMonthlyError(s, 2026, 9), true)
    assert.notEqual(s.status, "ready")
  })

  it("erro de um mês não vale para outro; trocar de mês limpa o erro", () => {
    let s = monthlyLoadReducer(initialMonthlyLoad(2026, 10), { type: "failure", year: 2026, month: 10 })
    assert.equal(hasMonthlyError(s, 2026, 10), true)
    assert.equal(hasMonthlyError(s, 2026, 11), false)
    s = monthlyLoadReducer(s, { type: "start", year: 2026, month: 11 })
    assert.equal(hasMonthlyError(s, 2026, 10), false)
    assert.equal(s.status, "loading")
  })

  it("nova tentativa bem-sucedida depois de erro", () => {
    let s = monthlyLoadReducer(initialMonthlyLoad(2026, 10), { type: "failure", year: 2026, month: 10 })
    s = monthlyLoadReducer(s, { type: "start", year: 2026, month: 10 })
    assert.equal(s.status, "loading")
    s = monthlyLoadReducer(s, { type: "success", year: 2026, month: 10 })
    assert.equal(s.status, "ready")
    assert.equal(hasMonthlyError(s, 2026, 10), false)
  })
})

describe("createRequestTracker — respostas atrasadas", () => {
  it("só a última chamada é a vigente", () => {
    const t = createRequestTracker()
    const a = t.begin()
    assert.equal(t.isLatest(a), true)
    const b = t.begin()
    assert.equal(t.isLatest(a), false, "a resposta do mês anterior é descartada")
    assert.equal(t.isLatest(b), true)
  })

  it("erro após trocar o período: a falha antiga não sobrescreve o mês atual", () => {
    const t = createRequestTracker()
    let state = initialMonthlyLoad(2026, 10)
    const first = t.begin()
    state = monthlyLoadReducer(state, { type: "start", year: 2026, month: 10 })
    const second = t.begin()
    state = monthlyLoadReducer(state, { type: "start", year: 2026, month: 11 })
    // a 1ª volta COM ERRO depois de o aluno ter ido para novembro: ignorada
    if (t.isLatest(first)) state = monthlyLoadReducer(state, { type: "failure", year: 2026, month: 10 })
    assert.equal(state.status, "loading")
    assert.equal(state.month, 11)
    if (t.isLatest(second)) state = monthlyLoadReducer(state, { type: "failure", year: 2026, month: 11 })
    assert.equal(hasMonthlyError(state, 2026, 11), true)
  })
})
