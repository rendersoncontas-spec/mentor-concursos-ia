import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import { installFakeIndexedDb, resetFakeIndexedDb } from "./test-support/fake-indexeddb"

installFakeIndexedDb()

import { isValidLegacySessionShape, migrateLegacyActiveSession } from "./legacy-session-migration"
import { sessionStore } from "./session-store"

const LEGACY_KEY = "mentor_active_study_session"

class FakeStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
}

function validLegacyPayload(): Record<string, unknown> {
  return {
    isActive: true,
    isMinimized: true,
    phase: "STUDYING",
    disciplineName: "RLM",
    disciplineId: "disc-1",
    topicName: "",
    studyType: "TEORIA",
    technique: "LIVRE",
    notes: "",
    startTime: Date.now() - 60_000,
    totalPausedMs: 0,
    lastPauseStartTime: null,
    plannedSeconds: 0,
    activeSeconds: 0,
    pausedSeconds: 0,
    planItemId: null,
    source: "FREE",
    cycleId: null,
    cycleItemId: null,
  }
}

describe("isValidLegacySessionShape", () => {
  it("aceita um snapshot válido e ativo", () => {
    assert.equal(isValidLegacySessionShape(validLegacyPayload()), true)
  })

  it("rejeita isActive: false (sessão inativa não vale a pena migrar)", () => {
    assert.equal(isValidLegacySessionShape({ ...validLegacyPayload(), isActive: false }), false)
  })

  it("rejeita startTime ausente ou inválido", () => {
    assert.equal(isValidLegacySessionShape({ ...validLegacyPayload(), startTime: null }), false)
    assert.equal(isValidLegacySessionShape({ ...validLegacyPayload(), startTime: -5 }), false)
  })

  it("rejeita phase desconhecida", () => {
    assert.equal(isValidLegacySessionShape({ ...validLegacyPayload(), phase: "VOANDO" }), false)
  })

  it("rejeita valores completamente fora de forma", () => {
    assert.equal(isValidLegacySessionShape(null), false)
    assert.equal(isValidLegacySessionShape("string"), false)
    assert.equal(isValidLegacySessionShape([]), false)
  })
})

describe("migrateLegacyActiveSession (item 5 do pedido)", () => {
  beforeEach(() => resetFakeIndexedDb())

  it("sem nada no localStorage -> not_found, nada é gravado no IndexedDB", async () => {
    const storage = new FakeStorage()
    const result = await migrateLegacyActiveSession("user-1", storage)
    assert.deepEqual(result, { migrated: false, reason: "not_found" })
    assert.equal(await sessionStore.get("user-1"), undefined)
  })

  it("snapshot válido: copia para IndexedDB, confirma, e só então remove do localStorage", async () => {
    const storage = new FakeStorage()
    storage.setItem(LEGACY_KEY, JSON.stringify(validLegacyPayload()))

    const result = await migrateLegacyActiveSession("user-2", storage)

    assert.equal(result.migrated, true)
    assert.equal(storage.getItem(LEGACY_KEY), null, "valor antigo deve ser removido após confirmar a gravação")
    const migrated = await sessionStore.get("user-2")
    assert.equal(migrated?.disciplineName, "RLM")
    assert.equal(migrated?.userId, "user-2")
  })

  it("JSON corrompido: descarta só aquele item, não quebra o app, não migra nada", async () => {
    const storage = new FakeStorage()
    storage.setItem(LEGACY_KEY, "{ isso não é json válido")

    const result = await migrateLegacyActiveSession("user-3", storage)

    assert.equal(result.migrated, false)
    assert.equal(result.reason, "invalid")
    assert.equal(storage.getItem(LEGACY_KEY), null)
    assert.equal(await sessionStore.get("user-3"), undefined)
  })

  it("formato inesperado (faltando campos): descarta só aquele item, não migra", async () => {
    const storage = new FakeStorage()
    storage.setItem(LEGACY_KEY, JSON.stringify({ foo: "bar" }))

    const result = await migrateLegacyActiveSession("user-4", storage)

    assert.equal(result.migrated, false)
    assert.equal(result.reason, "invalid")
    assert.equal(storage.getItem(LEGACY_KEY), null)
  })

  it("sem storage disponível (ex.: SSR): no_storage, não lança exceção", async () => {
    const result = await migrateLegacyActiveSession("user-5", null)
    assert.deepEqual(result, { migrated: false, reason: "no_storage" })
  })
})
