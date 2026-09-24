import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  isOperationIdConflict,
  resolveIdempotentReplay,
  saveOrReplayStudyHistory,
  OPERATION_ID_UNIQUE_INDEX,
  type CycleRegistrationResultLike,
  type InsertResultLike,
  type LookupResult,
} from "./study-session-idempotency"

/**
 * Fase C.1 — testes reais da lógica de idempotência de
 * `saveStudySessionAction`, extraída para `study-session-idempotency.ts`
 * justamente para poder ser exercitada aqui sem depender do runtime do Next
 * (importar o arquivo "use server" original trava o `tsx --test` fora dele —
 * mesmo problema documentado e resolvido na Fase C para `save-study-
 * session.ts`/`sync-worker.ts`). Todos os testes usam dublês reais de
 * insert/lookup/registerCycle injetados — nenhuma leitura de string.
 */

const OTHER_UNIQUE_INDEX_ERROR = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "study_history_pkey"',
}

const OPERATION_ID_CONFLICT_ERROR = {
  code: "23505",
  message: `duplicate key value violates unique constraint "${OPERATION_ID_UNIQUE_INDEX}"`,
}

describe("isOperationIdConflict (Fase C.1, item 4)", () => {
  it("true só quando o código é 23505, há operationId, e a mensagem cita o índice certo", () => {
    assert.equal(isOperationIdConflict(OPERATION_ID_CONFLICT_ERROR, "op-1"), true)
  })

  it("false para qualquer outro 23505 (ex.: colisão de PK) — nunca vira sucesso escondendo erro real", () => {
    assert.equal(isOperationIdConflict(OTHER_UNIQUE_INDEX_ERROR, "op-1"), false)
  })

  it("false quando não há operationId (chamada sem a camada offline)", () => {
    assert.equal(isOperationIdConflict(OPERATION_ID_CONFLICT_ERROR, null), false)
  })

  it("false para um código diferente de 23505 (ex.: violação de check constraint)", () => {
    assert.equal(
      isOperationIdConflict({ code: "23514", message: "check constraint" }, "op-1"),
      false,
    )
  })

  it("false quando o erro é nulo/indefinido", () => {
    assert.equal(isOperationIdConflict(null, "op-1"), false)
    assert.equal(isOperationIdConflict(undefined, "op-1"), false)
  })
})

describe("resolveIdempotentReplay (Fase C.1, itens 4-5)", () => {
  it("encontra o registro existente e devolve sucesso idempotente, sem inserir de novo", async () => {
    const existingRow = { id: "hist-1", client_operation_id: "op-1", active_minutes: 30 }
    let replayCalls = 0

    const result = await resolveIdempotentReplay({
      lookup: async (): Promise<LookupResult> => ({ data: existingRow, error: null }),
      onReplay: () => {
        replayCalls++
      },
    })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.historyId, "hist-1")
      assert.equal(result.session, existingRow)
      assert.equal(result.cycleSyncError, null)
      assert.equal(result.idempotentReplay, true)
    }
    assert.equal(replayCalls, 1, "onReplay deve rodar exatamente uma vez")
  })

  it("lookup com erro: devolve falha real, nunca inventa sucesso sem confirmação", async () => {
    let replayCalls = 0
    let failedCalls = 0

    const result = await resolveIdempotentReplay({
      lookup: async (): Promise<LookupResult> => ({
        data: null,
        error: { code: "PGRST116", message: "row not found" },
      }),
      onReplay: () => {
        replayCalls++
      },
      onLookupFailed: () => {
        failedCalls++
      },
      originalErrorCode: "23505",
    })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.code, "23505")
    }
    assert.equal(replayCalls, 0, "onReplay NUNCA deve rodar quando o lookup falha")
    assert.equal(failedCalls, 1)
  })

  it("lookup sem erro mas sem registro (null): mesmo tratamento de falha real", async () => {
    let replayCalls = 0
    const result = await resolveIdempotentReplay({
      lookup: async (): Promise<LookupResult> => ({ data: null, error: null }),
      onReplay: () => {
        replayCalls++
      },
    })
    assert.equal(result.success, false)
    assert.equal(replayCalls, 0)
  })
})

describe("saveOrReplayStudyHistory (Fase C.1 — cenários A, B, D, G do brief)", () => {
  function makeCycleSpy(result: CycleRegistrationResultLike | null = { success: true }) {
    let calls = 0
    const registerCycle = async () => {
      calls++
      return result
    }
    return { registerCycle, getCalls: () => calls }
  }

  it("[A] primeiro operationId: INSERT realizado, retorna sucesso e aciona o Ciclo uma vez", async () => {
    const insertedRow = { id: "hist-A", client_operation_id: "op-A" }
    const cycle = makeCycleSpy({ success: true })
    let revalidateCalls = 0

    const result = await saveOrReplayStudyHistory({
      operationId: "op-A",
      insert: async (): Promise<InsertResultLike> => ({ data: insertedRow, error: null }),
      lookupByOperationId: async (): Promise<LookupResult> => {
        throw new Error("não deveria ser chamado quando o INSERT tem sucesso")
      },
      shouldRegisterCycle: true,
      registerCycle: cycle.registerCycle,
      onRevalidate: () => {
        revalidateCalls++
      },
    })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.historyId, "hist-A")
      assert.equal(result.idempotentReplay, undefined)
    }
    assert.equal(cycle.getCalls(), 1, "Ciclo deve ser acionado exatamente uma vez no INSERT normal")
    assert.equal(revalidateCalls, 1)
  })

  it("[B] mesmo operationId novamente: não insere de novo (o insert falha com 23505), devolve exatamente o registro existente", async () => {
    const existingRow = { id: "hist-B", client_operation_id: "op-B", active_minutes: 45 }
    const cycle = makeCycleSpy()
    let insertAttempts = 0

    const result = await saveOrReplayStudyHistory({
      operationId: "op-B",
      insert: async (): Promise<InsertResultLike> => {
        insertAttempts++
        return { data: null, error: OPERATION_ID_CONFLICT_ERROR }
      },
      lookupByOperationId: async (): Promise<LookupResult> => ({ data: existingRow, error: null }),
      shouldRegisterCycle: true,
      registerCycle: cycle.registerCycle,
      onRevalidate: () => {},
    })

    assert.equal(insertAttempts, 1, "o orquestrador só tenta o INSERT uma vez; a duplicata vem do próprio banco")
    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.historyId, "hist-B")
      assert.equal(result.session, existingRow)
      assert.equal(result.idempotentReplay, true)
    }
    assert.equal(cycle.getCalls(), 0, "Ciclo NUNCA é acionado num replay idempotente")
  })

  it("[D] 23505 de outra constraint: continua erro real, nunca vira sucesso idempotente", async () => {
    const cycle = makeCycleSpy()
    let lookupCalls = 0

    const result = await saveOrReplayStudyHistory({
      operationId: "op-D",
      insert: async (): Promise<InsertResultLike> => ({ data: null, error: OTHER_UNIQUE_INDEX_ERROR }),
      lookupByOperationId: async (): Promise<LookupResult> => {
        lookupCalls++
        return { data: null, error: null }
      },
      shouldRegisterCycle: true,
      registerCycle: cycle.registerCycle,
      onRevalidate: () => {},
    })

    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.code, "23505")
    }
    assert.equal(lookupCalls, 0, "não deve nem tentar buscar por operationId — não é esse tipo de conflito")
    assert.equal(cycle.getCalls(), 0)
  })

  it("[G] replay idempotente nunca aciona o Ciclo, mesmo quando shouldRegisterCycle é true", async () => {
    const existingRow = { id: "hist-G", client_operation_id: "op-G" }
    const cycle = makeCycleSpy({ success: true })

    const result = await saveOrReplayStudyHistory({
      operationId: "op-G",
      insert: async (): Promise<InsertResultLike> => ({ data: null, error: OPERATION_ID_CONFLICT_ERROR }),
      lookupByOperationId: async (): Promise<LookupResult> => ({ data: existingRow, error: null }),
      shouldRegisterCycle: true, // mesmo com duração > 0, não deve acionar o Ciclo no replay
      registerCycle: cycle.registerCycle,
      onRevalidate: () => {},
    })

    assert.equal(result.success, true)
    assert.equal(cycle.getCalls(), 0)
  })

  it("erro genuíno de negócio (sem operationId): comportamento igual ao anterior à Fase C.1", async () => {
    const cycle = makeCycleSpy()
    const result = await saveOrReplayStudyHistory({
      operationId: null,
      insert: async (): Promise<InsertResultLike> => ({
        data: null,
        error: { code: "23503", message: "foreign key violation" },
      }),
      lookupByOperationId: async (): Promise<LookupResult> => {
        throw new Error("não deveria ser chamado sem operationId")
      },
      shouldRegisterCycle: true,
      registerCycle: cycle.registerCycle,
      onRevalidate: () => {},
    })

    assert.equal(result.success, false)
    assert.equal(cycle.getCalls(), 0)
  })
})
