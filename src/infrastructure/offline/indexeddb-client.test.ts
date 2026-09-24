import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import { installFakeIndexedDb, resetFakeIndexedDb } from "./test-support/fake-indexeddb"

installFakeIndexedDb()

import {
  STORE_NAMES,
  SYNC_QUEUE_BY_USER_STATUS_INDEX,
  deleteRecord,
  getAllByIndex,
  getRecord,
  openOfflineDatabase,
  putRecord,
} from "./indexeddb-client"

/**
 * Testes REAIS (não apenas leitura de código-fonte) da camada mais baixa
 * de IndexedDB, usando um fake em memória (ver test-support/fake-indexeddb.ts
 * — a lib `fake-indexeddb` não pôde ser instalada nesta máquina, ver
 * relatório da Fase B).
 */
describe("indexeddb-client", () => {
  beforeEach(() => resetFakeIndexedDb())

  it("cria todas as stores esperadas na primeira abertura", async () => {
    const db = await openOfflineDatabase()
    for (const name of Object.values(STORE_NAMES)) {
      assert.ok(db.objectStoreNames.contains(name), `store ${name} deveria existir`)
    }
    db.close()
  })

  it("put/get fazem round-trip", async () => {
    await putRecord(STORE_NAMES.sessionState, { userId: "user-1", isActive: true })
    const record = await getRecord<{ userId: string; isActive: boolean }>(
      STORE_NAMES.sessionState,
      "user-1",
    )
    assert.deepEqual(record, { userId: "user-1", isActive: true })
  })

  it("get retorna undefined para chave inexistente", async () => {
    const record = await getRecord(STORE_NAMES.sessionState, "nao-existe")
    assert.equal(record, undefined)
  })

  it("delete remove o registro", async () => {
    await putRecord(STORE_NAMES.sessionState, { userId: "user-2", isActive: true })
    await deleteRecord(STORE_NAMES.sessionState, "user-2")
    const record = await getRecord(STORE_NAMES.sessionState, "user-2")
    assert.equal(record, undefined)
  })

  it("getAllByIndex filtra por chave composta [userId, status] sem misturar usuários", async () => {
    await putRecord(STORE_NAMES.syncQueue, { operationId: "op-1", userId: "user-3", status: "PENDING" })
    await putRecord(STORE_NAMES.syncQueue, { operationId: "op-2", userId: "user-3", status: "SYNCED" })
    await putRecord(STORE_NAMES.syncQueue, { operationId: "op-3", userId: "user-4", status: "PENDING" })

    const pendingForUser3 = await getAllByIndex<{ operationId: string }>(
      STORE_NAMES.syncQueue,
      SYNC_QUEUE_BY_USER_STATUS_INDEX,
      ["user-3", "PENDING"],
    )

    assert.equal(pendingForUser3.length, 1)
    assert.equal(pendingForUser3[0]?.operationId, "op-1")
  })
})
