import { before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import { installFakeIndexedDb, resetFakeIndexedDb } from "./test-support/fake-indexeddb"
import type * as SyncWorkerModule from "./sync-worker"
import type * as SyncQueueModule from "./sync-queue"
import type * as ConnectionStateModule from "./connection-state"

installFakeIndexedDb()

/**
 * Mesma estratégia de `save-study-session.test.ts`: globais falsos ANTES do
 * import dinâmico (connection-state lê `window`/`navigator` no load), e
 * `createSyncPendingStudySessions` recebe uma `saveFn` falsa — nunca a
 * `saveStudySessionAction` real (que não roda fora do runtime do Next).
 */
let fakeWindow: EventTarget
let fakeNavigator: { onLine: boolean }
let createSyncPendingStudySessions: typeof SyncWorkerModule.createSyncPendingStudySessions
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
  ;({ createSyncPendingStudySessions } = await import("./sync-worker.ts"))
  ;({ syncQueue } = await import("./sync-queue.ts"))
  ;({ connectionState } = await import("./connection-state.ts"))
})

function setOnline(value: boolean) {
  fakeNavigator.onLine = value
  fakeWindow.dispatchEvent(new Event(value ? "online" : "offline"))
}

async function enqueue(userId: string, payload: unknown = {}) {
  return syncQueue.enqueue({ userId, type: "STUDY_SESSION_CREATE", entity: "study_history", payload })
}

describe("syncPendingStudySessions (Fase C, item 7-9, 11)", () => {
  beforeEach(() => {
    resetFakeIndexedDb()
    setOnline(true)
  })

  it("sucesso: marca SYNCED e devolve a sessão real para os consumidores dispararem o evento (item 5, 10 dos testes)", async () => {
    await enqueue("u1", { discipline_id: "d1" })
    const sync = createSyncPendingStudySessions({
      saveFn: async () => ({ success: true, session: { id: "real-1" } }),
      getUserId: async () => "u1",
    })

    const summary = await sync()

    assert.equal(summary.attempted, 1)
    assert.equal(summary.synced, 1)
    assert.equal(summary.failed, 0)
    assert.equal(summary.syncedSessions.length, 1)
    assert.equal((summary.syncedSessions[0]?.session as { id: string }).id, "real-1")
    assert.equal(await syncQueue.hasPending("u1"), false)
  })

  it("erro de rede é retryable: marca FAILED (não perde a operação) — item 6 dos testes pedidos", async () => {
    await enqueue("u2")
    const sync = createSyncPendingStudySessions({
      saveFn: async () => {
        throw new TypeError("Failed to fetch")
      },
      getUserId: async () => "u2",
    })

    const summary = await sync()

    assert.equal(summary.failed, 1)
    const failed = await syncQueue.getByStatus("u2", "FAILED")
    assert.equal(failed.length, 1)
    assert.match(failed[0]?.lastError ?? "", /^\[retryable\]/)
  })

  it("erro 4xx (funcional) marca FAILED como não-retryable e não é reprocessado sozinho — item 7 dos testes pedidos", async () => {
    await enqueue("u3")
    const saveFn = async () => ({ success: false, error: "Disciplina não encontrada no sistema." })
    await createSyncPendingStudySessions({ saveFn, getUserId: async () => "u3" })()

    const failed = await syncQueue.getByStatus("u3", "FAILED")
    assert.equal(failed.length, 1)
    assert.match(failed[0]?.lastError ?? "", /^\[non_retryable\]/)

    let calls = 0
    await createSyncPendingStudySessions({
      saveFn: async () => {
        calls++
        return { success: false, error: "Disciplina não encontrada no sistema." }
      },
      getUserId: async () => "u3",
    })()
    assert.equal(calls, 0, "erro não-retryable nunca deve ser tentado de novo automaticamente")
  })

  it("erro retryable é reprocessado automaticamente na próxima chamada (reconexão) — item 4 dos testes pedidos", async () => {
    await enqueue("u4")
    let attempt = 0
    const saveFn = async () => {
      attempt++
      if (attempt === 1) throw new TypeError("Failed to fetch")
      return { success: true, session: { id: "real-4" } }
    }

    const first = await createSyncPendingStudySessions({ saveFn, getUserId: async () => "u4" })()
    assert.equal(first.failed, 1)

    const second = await createSyncPendingStudySessions({ saveFn, getUserId: async () => "u4" })()
    assert.equal(second.synced, 1)
    assert.equal(attempt, 2)
  })

  it("duas operações diferentes não colapsam — cada uma sincroniza separadamente (item 8 dos testes pedidos)", async () => {
    await enqueue("u5", { a: 1 })
    await enqueue("u5", { a: 2 })
    let calls = 0
    const sync = createSyncPendingStudySessions({
      saveFn: async () => {
        calls++
        return { success: true, session: { id: `real-${calls}` } }
      },
      getUserId: async () => "u5",
    })

    const summary = await sync()

    assert.equal(summary.synced, 2)
    assert.equal(calls, 2)
  })

  it("a mesma operationId nunca é sincronizada duas vezes (item 9 dos testes pedidos)", async () => {
    await enqueue("u6")
    let calls = 0
    const saveFn = async () => {
      calls++
      return { success: true, session: { id: "real-6" } }
    }
    const sync = createSyncPendingStudySessions({ saveFn, getUserId: async () => "u6" })

    await sync()
    await sync()

    assert.equal(calls, 1, "a operação já SYNCED não deveria ser reenviada")
  })

  it("OFFLINE: não tenta sincronizar nada (item 2)", async () => {
    await enqueue("u7")
    setOnline(false)
    let called = false
    const sync = createSyncPendingStudySessions({
      saveFn: async () => {
        called = true
        return { success: true }
      },
      getUserId: async () => "u7",
    })

    const summary = await sync()

    assert.equal(summary.skipped, true)
    assert.equal(called, false)
  })

  it("duas sincronizações concorrentes do mesmo usuário: a segunda é ignorada pela trava (item 11)", async () => {
    await enqueue("u8")
    let inFlight = 0
    let maxInFlight = 0
    const saveFn = async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inFlight--
      return { success: true, session: { id: "real-8" } }
    }
    const sync = createSyncPendingStudySessions({ saveFn, getUserId: async () => "u8" })

    const [a, b] = await Promise.all([sync(), sync()])

    assert.equal(maxInFlight, 1, "nunca deveria haver duas sincronizações do mesmo usuário ao mesmo tempo")
    const skippedCount = [a, b].filter((r) => r.skipped && r.reason === "already_syncing").length
    assert.equal(skippedCount, 1)
  })

  it("connectionState fica SYNC_ERROR quando sobra algo não sincronizado após a rodada", async () => {
    await enqueue("u9")
    const sync = createSyncPendingStudySessions({
      saveFn: async () => ({ success: false, error: "Disciplina não encontrada no sistema." }),
      getUserId: async () => "u9",
    })
    await sync()
    assert.equal(connectionState.get(), "SYNC_ERROR")
  })

  it("connectionState volta para ONLINE quando tudo sincroniza com sucesso", async () => {
    await enqueue("u10")
    const sync = createSyncPendingStudySessions({
      saveFn: async () => ({ success: true, session: { id: "real-10" } }),
      getUserId: async () => "u10",
    })
    await sync()
    assert.equal(connectionState.get(), "ONLINE")
  })

  it("lançamento manual continua ilimitado dentro do worker: N operações do mesmo usuário sincronizam todas (item 11 dos testes pedidos)", async () => {
    await enqueue("u11", { discipline_name: "RLM", activeMinutes: 30 })
    await enqueue("u11", { discipline_name: "RLM", activeMinutes: 20 })
    await enqueue("u11", { discipline_name: "Português", activeMinutes: 40 })
    let calls = 0
    const sync = createSyncPendingStudySessions({
      saveFn: async () => {
        calls++
        return { success: true, session: { id: `real-${calls}` } }
      },
      getUserId: async () => "u11",
    })

    const summary = await sync()

    assert.equal(summary.synced, 3)
    assert.equal(calls, 3)
  })
})
