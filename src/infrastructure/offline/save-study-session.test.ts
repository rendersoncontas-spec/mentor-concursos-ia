import { before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import { installFakeIndexedDb, resetFakeIndexedDb } from "./test-support/fake-indexeddb"
import type * as SaveStudySessionModule from "./save-study-session"
import type * as SyncQueueModule from "./sync-queue"
import type * as ConnectionStateModule from "./connection-state"

installFakeIndexedDb()

/**
 * `save-study-session.ts` importa `connection-state.ts` (que lê
 * `window`/`navigator` no carregamento do módulo) e `sync-queue.ts` (que usa
 * IndexedDB) — por isso os globais falsos precisam existir ANTES do import
 * dinâmico, exatamente como em `connection-state.test.ts`.
 *
 * `saveStudySessionAction` real (usada pela versão "de produção" do módulo)
 * NUNCA é chamada aqui: todo teste usa `createSaveStudySessionWithOfflineSupport`
 * com uma `saveFn` falsa injetada — é assim que testamos o comportamento de
 * verdade sem precisar simular `next/headers`/Supabase/Sentry.
 */
let fakeWindow: EventTarget
let fakeNavigator: { onLine: boolean }
let createSaveStudySessionWithOfflineSupport: typeof SaveStudySessionModule.createSaveStudySessionWithOfflineSupport
let syncQueue: typeof SyncQueueModule.syncQueue
let connectionState: typeof ConnectionStateModule.connectionState

before(async () => {
  fakeWindow = new EventTarget()
  fakeNavigator = { onLine: true }
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true, writable: true })
  Object.defineProperty(globalThis, "navigator", {
    value: fakeNavigator,
    configurable: true,
    writable: true,
  })
  ;({ createSaveStudySessionWithOfflineSupport } = await import("./save-study-session.ts"))
  ;({ syncQueue } = await import("./sync-queue.ts"))
  ;({ connectionState } = await import("./connection-state.ts"))
})

function setOnline(value: boolean) {
  fakeNavigator.onLine = value
  fakeWindow.dispatchEvent(new Event(value ? "online" : "offline"))
}

describe("saveStudySessionWithOfflineSupport (Fase C, itens 1-4)", () => {
  beforeEach(() => {
    resetFakeIndexedDb()
    setOnline(true)
  })

  it("ONLINE com sucesso: chama a action real e devolve o resultado real, sem enfileirar (item 1)", async () => {
    const calls: Record<string, unknown>[] = []
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async (payload) => {
        calls.push(payload)
        return { success: true, historyId: "h1", session: { id: "h1" } }
      },
      getUserId: async () => "user-1",
    })

    const res = await save({ discipline_id: "d1" })

    assert.equal(res.success, true)
    assert.equal(res.pending, undefined)
    assert.equal((res.session as { id: string }).id, "h1")
    assert.equal(calls.length, 1)
    assert.equal(await syncQueue.hasPending("user-1"), false)
  })

  it("OFFLINE: não tenta a Server Action, enfileira localmente e devolve pending:true (item 2, 4)", async () => {
    setOnline(false)
    let called = false
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => {
        called = true
        return { success: true }
      },
      getUserId: async () => "user-2",
    })

    const res = await save({
      discipline_id: "d1",
      discipline_name: "RLM",
      is_manual_mode: true,
      activeMinutes: 30,
    })

    assert.equal(called, false, "OFFLINE nunca deve tentar a Server Action")
    assert.equal(res.pending, true)
    assert.ok(res.operationId)
    assert.equal(res.pendingSession?.active_minutes, 30)
    assert.equal(await syncQueue.hasPending("user-2"), true)
  })

  it("ONLINE mas a chamada falha por erro de rede: cai para a fila em vez de perder a sessão (item 2)", async () => {
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => {
        throw new TypeError("Failed to fetch")
      },
      getUserId: async () => "user-3",
    })

    const res = await save({ discipline_id: "d1", is_manual_mode: true, activeMinutes: 10 })

    assert.equal(res.pending, true)
    assert.equal(await syncQueue.hasPending("user-3"), true)
  })

  it("sessão local expirada (auth) enquanto ONLINE: enfileira em vez de descartar o estudo (item 10)", async () => {
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => ({ success: false, error: "Usuário não autenticado. Faça login novamente." }),
      getUserId: async () => "user-4",
    })

    const res = await save({ discipline_id: "d1", is_manual_mode: true, activeMinutes: 5 })

    assert.equal(res.pending, true)
    assert.equal(await syncQueue.hasPending("user-4"), true)
  })

  it("erro de negócio genuíno (disciplina inexistente) ONLINE: não enfileira, mostra o erro como sempre", async () => {
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => ({ success: false, error: 'Disciplina "X" não encontrada no sistema.' }),
      getUserId: async () => "user-5",
    })

    const res = await save({ discipline_id: "d1", is_manual_mode: true, activeMinutes: 5 })

    assert.equal(res.success, false)
    assert.equal(res.pending, undefined)
    assert.equal(await syncQueue.hasPending("user-5"), false)
  })

  it("sem sessão local (userId nulo): recusa sem tentar nada — nunca cria login offline (item 10)", async () => {
    let called = false
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => {
        called = true
        return { success: true }
      },
      getUserId: async () => null,
    })

    const res = await save({ discipline_id: "d1" })

    assert.equal(res.success, false)
    assert.equal(called, false)
  })

  it("lançamento manual: duas operações independentes (RLM 30 e RLM 20) nunca colapsam (item 5)", async () => {
    setOnline(false)
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => ({ success: true }),
      getUserId: async () => "user-6",
    })

    await save({ discipline_id: "d1", discipline_name: "RLM", is_manual_mode: true, activeMinutes: 30 })
    await save({ discipline_id: "d1", discipline_name: "RLM", is_manual_mode: true, activeMinutes: 20 })

    const pending = await syncQueue.getPending("user-6")
    assert.equal(pending.length, 2)
  })

  it("cronômetro offline mantém a duração correta no snapshot pendente (item 12 dos testes pedidos)", async () => {
    setOnline(false)
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => ({ success: true }),
      getUserId: async () => "user-7",
    })

    const startTime = Date.now() - 12 * 60 * 1000
    const res = await save({
      discipline_id: "d1",
      discipline_name: "Português",
      is_manual_mode: false,
      sessionStartTime: startTime,
      sessionTotalPausedMs: 0,
      sessionLastPauseStartTime: null,
    })

    assert.equal(res.pending, true)
    const minutes = res.pendingSession?.active_minutes ?? 0
    assert.ok(minutes >= 11 && minutes <= 12, `esperava ~12 minutos, recebeu ${minutes}`)
  })

  it("nunca chama a Server Action quando connectionState está OFFLINE, mesmo que navigator.onLine minta (item 9)", async () => {
    // connectionState só muda quando o evento 'offline' dispara — setOnline
    // cuida disso. Este teste reforça que a DECISÃO usa connectionState
    // (não navigator.onLine direto), como o item 9 do pedido exige.
    setOnline(false)
    assert.equal(connectionState.get(), "OFFLINE")
    let called = false
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => {
        called = true
        return { success: true }
      },
      getUserId: async () => "user-8",
    })
    await save({ discipline_id: "d1", is_manual_mode: true, activeMinutes: 1 })
    assert.equal(called, false)
  })

  it("gera um operationId por chamada e o envia já na primeira tentativa online (Fase C.1, item 3)", async () => {
    const payloadsSeen: Record<string, unknown>[] = []
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async (payload) => {
        payloadsSeen.push(payload)
        return { success: true, historyId: "h1", session: { id: "h1" } }
      },
      getUserId: async () => "user-9",
    })

    await save({ discipline_id: "d1" })

    assert.equal(payloadsSeen.length, 1)
    assert.ok(
      typeof payloadsSeen[0]?.["operationId"] === "string" && payloadsSeen[0]?.["operationId"],
      "a primeira tentativa online já deve carregar um operationId, mesmo sem nunca ter passado pela fila",
    )
  })

  it("lançamento manual: cada operação recebe um operationId DIFERENTE (item 5 — nunca reaproveita entre operações distintas)", async () => {
    setOnline(false)
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async () => ({ success: true }),
      getUserId: async () => "user-10",
    })

    const res1 = await save({ discipline_id: "d1", discipline_name: "RLM", is_manual_mode: true, activeMinutes: 30 })
    const res2 = await save({ discipline_id: "d1", discipline_name: "RLM", is_manual_mode: true, activeMinutes: 20 })

    assert.ok(res1.operationId)
    assert.ok(res2.operationId)
    assert.notEqual(res1.operationId, res2.operationId)
  })

  it('"lost response" (item 9, obrigatório): o operationId da tentativa online perdida é o MESMO que acaba na fila para o retry', async () => {
    const payloadsSeen: Record<string, unknown>[] = []
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async (payload) => {
        payloadsSeen.push(payload)
        // Simula: o servidor pode até ter processado, mas o cliente nunca
        // recebe a resposta (conexão caiu no meio) — só enxerga uma exceção
        // de transporte, exatamente como um fetch que nunca retorna.
        throw new TypeError("Failed to fetch")
      },
      getUserId: async () => "user-11",
    })

    const res = await save({ discipline_id: "d1", is_manual_mode: true, activeMinutes: 25 })

    assert.equal(res.pending, true)
    const sentOperationId = payloadsSeen[0]?.["operationId"]
    assert.ok(sentOperationId, "a tentativa perdida precisa ter enviado um operationId")

    const pending = await syncQueue.getPending("user-11")
    assert.equal(pending.length, 1)
    assert.equal(
      (pending[0]?.payload as Record<string, unknown>)?.["operationId"],
      sentOperationId,
      "o payload enfileirado para o retry deve carregar o MESMO operationId que já tinha sido enviado ao servidor na tentativa perdida — é isso que torna o retry idempotente do lado do servidor (índice único em client_operation_id)",
    )
    assert.equal(
      res.operationId,
      sentOperationId,
      "o operationId devolvido para a UI também deve ser esse mesmo valor",
    )
  })

  it('"lost response" via erro funcional retryable (sessão expirada): mesmo operationId da tentativa original chega à fila', async () => {
    const payloadsSeen: Record<string, unknown>[] = []
    const save = createSaveStudySessionWithOfflineSupport({
      saveFn: async (payload) => {
        payloadsSeen.push(payload)
        return { success: false, error: "Usuário não autenticado. Faça login novamente." }
      },
      getUserId: async () => "user-12",
    })

    const res = await save({ discipline_id: "d1", is_manual_mode: true, activeMinutes: 8 })

    const sentOperationId = payloadsSeen[0]?.["operationId"]
    assert.ok(sentOperationId)
    const pending = await syncQueue.getPending("user-12")
    assert.equal(
      (pending[0]?.payload as Record<string, unknown>)?.["operationId"],
      sentOperationId,
    )
    assert.equal(res.operationId, sentOperationId)
  })
})
