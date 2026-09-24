import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import { installFakeIndexedDb, resetFakeIndexedDb } from "./test-support/fake-indexeddb"

installFakeIndexedDb()

import { syncQueue } from "./sync-queue"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function enqueueBasic(userId: string, payload: unknown = {}) {
  return syncQueue.enqueue({ userId, type: "STUDY_SESSION_CREATE", entity: "study_history", payload })
}

describe("syncQueue", () => {
  beforeEach(() => resetFakeIndexedDb())

  it("enqueue gera um operationId único em formato UUID — nunca um timestamp (item 7 do pedido)", async () => {
    const id1 = await enqueueBasic("u1", { a: 1 })
    const id2 = await enqueueBasic("u1", { a: 2 })
    assert.notEqual(id1, id2)
    assert.match(id1, UUID_RE)
    assert.match(id2, UUID_RE)
  })

  it("uma operação recém-enfileirada começa como PENDING com retryCount 0", async () => {
    const id = await enqueueBasic("u2")
    const pending = await syncQueue.getPending("u2")
    assert.equal(pending.length, 1)
    assert.equal(pending[0]?.operationId, id)
    assert.equal(pending[0]?.status, "PENDING")
    assert.equal(pending[0]?.retryCount, 0)
    assert.equal(pending[0]?.lastError, null)
  })

  it("getPending isola operações por usuário", async () => {
    await enqueueBasic("u3")
    await enqueueBasic("u4")
    assert.equal((await syncQueue.getPending("u3")).length, 1)
    assert.equal((await syncQueue.getPending("u4")).length, 1)
  })

  it("markSyncing e markSynced transicionam o status corretamente", async () => {
    const id = await enqueueBasic("u5")
    await syncQueue.markSyncing(id)
    assert.equal((await syncQueue.getAllForUser("u5"))[0]?.status, "SYNCING")
    await syncQueue.markSynced(id)
    assert.equal((await syncQueue.getAllForUser("u5"))[0]?.status, "SYNCED")
  })

  it("markFailed incrementa retryCount e grava lastError a cada chamada (item 12)", async () => {
    const id = await enqueueBasic("u6")
    await syncQueue.markFailed(id, "network_error")
    let record = (await syncQueue.getAllForUser("u6"))[0]
    assert.equal(record?.status, "FAILED")
    assert.equal(record?.retryCount, 1)
    assert.equal(record?.lastError, "network_error")

    await syncQueue.markFailed(id, "network_error de novo")
    record = (await syncQueue.getAllForUser("u6"))[0]
    assert.equal(record?.retryCount, 2)
    assert.equal(record?.lastError, "network_error de novo")
  })

  it("retryFailed volta operações FAILED para PENDING e retorna quantas foram reenfileiradas", async () => {
    const id1 = await enqueueBasic("u7")
    await enqueueBasic("u7")
    await syncQueue.markFailed(id1, "erro")

    const count = await syncQueue.retryFailed("u7")
    assert.equal(count, 1)

    const pendingIds = (await syncQueue.getPending("u7")).map((r) => r.operationId).sort()
    assert.ok(pendingIds.includes(id1))
    assert.equal(pendingIds.length, 2) // a que já era PENDING + a que voltou de FAILED
  })

  it("getPendingCount/hasPending contam PENDING+SYNCING+FAILED, nunca SYNCED", async () => {
    const id1 = await enqueueBasic("u8")
    const id2 = await enqueueBasic("u8")
    await enqueueBasic("u8") // fica PENDING
    await syncQueue.markSynced(id1)
    await syncQueue.markFailed(id2, "erro")

    assert.equal(await syncQueue.getPendingCount("u8"), 2)
    assert.equal(await syncQueue.hasPending("u8"), true)
  })

  it("hasPending é false quando tudo já foi sincronizado", async () => {
    const id = await enqueueBasic("u9")
    await syncQueue.markSynced(id)
    assert.equal(await syncQueue.hasPending("u9"), false)
  })

  it("duas operações independentes (ex.: RLM 30min e RLM 20min) nunca colapsam numa só — item 22 do pedido", async () => {
    await enqueueBasic("u10", { discipline: "RLM", minutes: 30 })
    await enqueueBasic("u10", { discipline: "RLM", minutes: 20 })
    const pending = await syncQueue.getPending("u10")
    assert.equal(pending.length, 2)
  })

  it("reenviar a mesma operação (mesmo operationId) não duplica — idempotência via put sobrescreve o mesmo registro", async () => {
    const id = await enqueueBasic("u11", { minutes: 45 })
    await syncQueue.markSyncing(id)
    // Simula uma segunda tentativa de processar a MESMA operação (ex.: dois
    // triggers de sync disparando quase juntos) marcando-a de novo.
    await syncQueue.markSyncing(id)
    const all = await syncQueue.getAllForUser("u11")
    assert.equal(all.length, 1, "não deveria existir uma segunda linha para o mesmo operationId")
  })

  it("Fase C.1: enqueue reaproveita um operationId fornecido pelo chamador em vez de gerar um novo", async () => {
    const suppliedId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const returnedId = await syncQueue.enqueue({
      userId: "u12",
      type: "STUDY_SESSION_CREATE",
      entity: "study_history",
      payload: { minutes: 10 },
      operationId: suppliedId,
    })
    assert.equal(
      returnedId,
      suppliedId,
      "quando o chamador já gerou o operationId (ex.: uma tentativa online cuja resposta se perdeu), a fila deve preservá-lo — nunca substituí-lo por um novo",
    )
    const pending = await syncQueue.getPending("u12")
    assert.equal(pending[0]?.operationId, suppliedId)
  })

  it("enqueue sem operationId explícito continua gerando um novo UUID, como antes (compatibilidade)", async () => {
    const id = await enqueueBasic("u13", { minutes: 5 })
    assert.match(id, UUID_RE)
  })
})
