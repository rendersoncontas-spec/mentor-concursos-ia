// ============================================================================
// G1.6 — VALIDAÇÃO DE ENTRADAS, ERROS E CONTRATOS DE FALHA.
// Comportamental puro onde possível; wiring onde a query exige runtime.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  clampIntOrNull,
  finiteOrNull,
  isParsableSaoPauloDateTime,
  isUuid,
  nonNegativeIntOrNull,
} from "@/domain/study-session/study-input.ts"
import { isReviewOperationConflict } from "@/application/review-engine/review.repository.ts"
import { isOperationIdConflict } from "@/application/study-session/study-session-idempotency.ts"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// 1-7. Validadores de entrada (G-41).
// ---------------------------------------------------------------------------

describe("G-41 — validadores runtime do input de estudo", () => {
  it("1. isUuid aceita UUID e rejeita lixo/whitespace/não-string", () => {
    assert.equal(isUuid("a9230236-d51f-4528-b6f2-34b3b172b23b"), true)
    assert.equal(isUuid("  a9230236-d51f-4528-b6f2-34b3b172b23b  "), true)
    assert.equal(isUuid(""), false)
    assert.equal(isUuid("   "), false)
    assert.equal(isUuid("op-123"), false)
    assert.equal(isUuid("not-a-uuid"), false)
    assert.equal(isUuid(null), false)
    assert.equal(isUuid(undefined), false)
    assert.equal(isUuid(123), false)
  })

  it("2. finiteOrNull nunca devolve NaN/Infinity", () => {
    assert.equal(finiteOrNull("abc"), null)
    assert.equal(finiteOrNull(NaN), null)
    assert.equal(finiteOrNull(Infinity), null)
    assert.equal(finiteOrNull(""), null)
    assert.equal(finiteOrNull(null), null)
    assert.equal(finiteOrNull(undefined), null)
    assert.equal(finiteOrNull(0), 0)
    assert.equal(finiteOrNull("0"), 0)
    assert.equal(finiteOrNull(false), 0)
    assert.equal(finiteOrNull(81.5), 81.5)
  })

  it("3. nonNegativeIntOrNull arredonda com piso 0, lixo vira null", () => {
    assert.equal(nonNegativeIntOrNull("abc"), null)
    assert.equal(nonNegativeIntOrNull(-3), 0)
    assert.equal(nonNegativeIntOrNull(2.5), 3)
    assert.equal(nonNegativeIntOrNull(null), null)
    assert.equal(nonNegativeIntOrNull(60), 60)
  })

  it("4. clampIntOrNull respeita [min,max], lixo vira null", () => {
    assert.equal(clampIntOrNull("abc", 1, 5), null)
    assert.equal(clampIntOrNull("", 1, 5), null)
    assert.equal(clampIntOrNull(9, 1, 5), 5)
    assert.equal(clampIntOrNull(0, 1, 5), 1)
    assert.equal(clampIntOrNull(3, 1, 5), 3)
  })

  it("5. isParsableSaoPauloDateTime espelha o buildIso (sem fallback mudo)", () => {
    assert.equal(isParsableSaoPauloDateTime("2026-09-13", "10:00"), true)
    assert.equal(isParsableSaoPauloDateTime("2026-09-13", null), true)
    assert.equal(isParsableSaoPauloDateTime("99/99/9999", "10:00"), false)
    assert.equal(isParsableSaoPauloDateTime("not-a-date", null), false)
    assert.equal(isParsableSaoPauloDateTime("", null), false)
    assert.equal(isParsableSaoPauloDateTime(null, null), false)
  })

  it("6. action valida antes de escrever (wiring)", () => {
    const body = src("src/application/study-session/study-session.action.ts")
    assert.match(body, /Identificador da operação inválido/)
    assert.match(body, /Data de estudo inválida/)
    assert.match(body, /Disciplina inválida/)
    assert.match(body, /Item de planejamento inválido/)
    assert.doesNotMatch(body, /Math\.max\(0, Math\.round\(Number\(data\["planned_minutes"\]\)\)\)/)
  })

  it("7. ordem: auth → validação → write (wiring)", () => {
    const body = src("src/application/study-session/study-session.action.ts")
    const authAt = body.indexOf("auth.getUser")
    const validAt = body.indexOf("Identificador da operação inválido")
    const writeAt = body.indexOf('.from("study_history")')
    assert.ok(authAt !== -1 && validAt !== -1 && writeAt !== -1)
    assert.ok(authAt < validAt && validAt < writeAt, "auth antes de validar, validar antes de escrever")
  })
})

// ---------------------------------------------------------------------------
// 8-9. Retry preserva identidade; conflito é específico (G-36).
// ---------------------------------------------------------------------------

describe("G-36 — idempotência com identidade exata", () => {
  it("8. conflito de operation só no índice de idempotência (review)", () => {
    assert.equal(isReviewOperationConflict({ code: "23505", message: 'duplicate key value violates unique constraint "uq_review_history_user_operation"' }), true)
    assert.equal(isReviewOperationConflict({ code: "23505", message: 'duplicate key value violates unique constraint "review_history_pkey"' }), false)
    assert.equal(isReviewOperationConflict({ code: "23502", message: "null" }), false)
    assert.equal(isReviewOperationConflict(null), false)
    assert.equal(isReviewOperationConflict({}), false)
  })

  it("9. conflito de operation só no índice de idempotência (study)", () => {
    assert.equal(isOperationIdConflict({ code: "23505", message: '... "study_history_client_operation_id_idx" ...' }, "some-id"), true)
    assert.equal(isOperationIdConflict({ code: "23505", message: "other" }, "some-id"), false)
    assert.equal(isOperationIdConflict({ code: "23505", message: '... "study_history_client_operation_id_idx" ...' }, null), false)
  })

  it("10. modal de review reutiliza o ID na retry do mesmo card (wiring)", () => {
    const body = src("src/features/reviews/components/review-session-modal.tsx")
    assert.match(body, /answerOpRef/)
    assert.match(body, /clientOperationId: answerOpRef\.current\.id/)
  })
})

// ---------------------------------------------------------------------------
// 10-11. Erro vs vazio; sem overwrite em dado corrompido (G-42–45).
// ---------------------------------------------------------------------------

describe("G-42–45 — erro nunca é vazio nem overwrite", () => {
  it("11. meta corrompida do edital vira erro, não overwrite (wiring)", () => {
    const body = src("src/application/edital/edital.action.ts")
    assert.equal((body.match(/Dados do concurso inválidos/g) ?? []).length, 2, "save + remove")
    assert.doesNotMatch(body, /catch \{\s*meta = \{\}/)
  })

  it("12. cobertura indisponível é flag, não 0/0 (wiring)", () => {
    assert.match(src("src/application/achievements/achievements.action.ts"), /editalCoverageUnavailable/)
    assert.match(src("src/features/conquistas/components/conquistas-view.tsx"), /Cobertura do edital indisponível/)
  })

  it("13. preferência corrompida não derruba o provider (wiring)", () => {
    const body = src("src/features/study-session/components/study-provider.tsx")
    assert.match(body, /floatingEnabled = JSON\.parse\(savedPref\) as boolean/)
    assert.match(body, /\} catch \{\n\s*floatingEnabled = true/)
    assert.doesNotMatch(body, /savedPref === null \? true : \(JSON\.parse\(savedPref\) as boolean\)/)
  })
})
