import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { classifySaveStudySessionResult } from "./classify-save-result"

describe("classifySaveStudySessionResult (Fase C, item 9/10)", () => {
  it("success:true nunca é retryable (não há o que reprocessar)", () => {
    const result = classifySaveStudySessionResult({ success: true })
    assert.equal(result.retryable, false)
  })

  it("'Usuário não autenticado' é retryable — sessão expirada não pode perder a operação (item 10)", () => {
    const result = classifySaveStudySessionResult({
      success: false,
      error: "Usuário não autenticado. Faça login novamente.",
    })
    assert.equal(result.retryable, true)
    assert.equal(result.reason, "auth_session_expired")
  })

  it("disciplina não encontrada é erro de dado — nunca retryable", () => {
    const result = classifySaveStudySessionResult({
      success: false,
      error: 'Disciplina "Direito" não encontrada no sistema. Selecione uma disciplina existente na lista.',
    })
    assert.equal(result.retryable, false)
    assert.equal(result.reason, "invalid_discipline")
  })

  it("código de erro do Postgres transitório (deadlock) é retryable", () => {
    const result = classifySaveStudySessionResult({ success: false, error: "erro", code: "40P01" })
    assert.equal(result.retryable, true)
  })

  it("código de erro do Postgres não-transitório (ex.: FK inválida) não é retryable", () => {
    const result = classifySaveStudySessionResult({ success: false, error: "erro", code: "23503" })
    assert.equal(result.retryable, false)
  })

  it("erro desconhecido (sem code, sem palavras reconhecidas) é retryable por segurança", () => {
    const result = classifySaveStudySessionResult({ success: false, error: "Erro inesperado ao salvar." })
    assert.equal(result.retryable, true)
    assert.equal(result.reason, "unknown_functional_error")
  })
})
