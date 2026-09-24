import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { classifySyncError } from "./sync-error-classifier"

describe("classifySyncError (item 12 do pedido)", () => {
  it("TypeError (falha de fetch/rede) é retryable", () => {
    const result = classifySyncError(new TypeError("Failed to fetch"))
    assert.equal(result.retryable, true)
    assert.equal(result.reason, "network_error")
  })

  it("erro 5xx do servidor é retryable", () => {
    const result = classifySyncError({ status: 503 })
    assert.equal(result.retryable, true)
    assert.match(result.reason, /^server_error_/)
  })

  it("erro 4xx funcional NÃO é retryable — nunca tentar indefinidamente", () => {
    const result = classifySyncError({ status: 404 })
    assert.equal(result.retryable, false)
    assert.match(result.reason, /^client_error_/)
  })

  it("erro 401 (sessão inválida) também não é retryable", () => {
    const result = classifySyncError({ status: 401 })
    assert.equal(result.retryable, false)
  })

  it("erro desconhecido é tratado como retryable por segurança (não perde a operação silenciosamente)", () => {
    const result = classifySyncError(new Error("algo inesperado"))
    assert.equal(result.retryable, true)
    assert.equal(result.reason, "unknown_error")
  })

  it("statusCode (alguns clientes usam esse nome em vez de status) também é reconhecido", () => {
    const result = classifySyncError({ statusCode: 500 })
    assert.equal(result.retryable, true)
  })
})
