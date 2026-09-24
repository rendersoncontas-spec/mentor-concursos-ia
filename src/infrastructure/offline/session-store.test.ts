import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import { installFakeIndexedDb, resetFakeIndexedDb } from "./test-support/fake-indexeddb"

installFakeIndexedDb()

import { sessionStore } from "./session-store"
import type { ActiveSessionRecord } from "./types"

function baseSession(overrides: Partial<Omit<ActiveSessionRecord, "userId">> = {}): Omit<
  ActiveSessionRecord,
  "userId"
> {
  return {
    isActive: true,
    isMinimized: false,
    phase: "STUDYING",
    disciplineName: "RLM",
    disciplineId: "disc-1",
    topicName: "",
    studyType: "TEORIA",
    technique: "LIVRE",
    notes: "",
    startTime: Date.now(),
    totalPausedMs: 0,
    lastPauseStartTime: null,
    plannedSeconds: 0,
    activeSeconds: 0,
    pausedSeconds: 0,
    planItemId: null,
    source: "FREE",
    cycleId: null,
    cycleItemId: null,
    ...overrides,
  }
}

describe("sessionStore (migração do cronômetro para IndexedDB)", () => {
  beforeEach(() => resetFakeIndexedDb())

  it("get retorna undefined quando não há sessão salva para o usuário", async () => {
    const result = await sessionStore.get("user-a")
    assert.equal(result, undefined)
  })

  it("set/get fazem round-trip preservando os campos", async () => {
    await sessionStore.set("user-b", baseSession({ disciplineName: "Português" }))
    const result = await sessionStore.get("user-b")
    assert.equal(result?.disciplineName, "Português")
    assert.equal(result?.userId, "user-b")
  })

  it("isola sessões por usuário — nunca mistura dados de usuários diferentes (item 3 do pedido)", async () => {
    await sessionStore.set("user-c", baseSession({ disciplineName: "RLM" }))
    await sessionStore.set("user-d", baseSession({ disciplineName: "Estatística" }))
    const c = await sessionStore.get("user-c")
    const d = await sessionStore.get("user-d")
    assert.equal(c?.disciplineName, "RLM")
    assert.equal(d?.disciplineName, "Estatística")
  })

  it("clear remove a sessão daquele usuário", async () => {
    await sessionStore.set("user-e", baseSession())
    await sessionStore.clear("user-e")
    const result = await sessionStore.get("user-e")
    assert.equal(result, undefined)
  })

  it("subscribe notifica outra aba quando a sessão do MESMO usuário muda", async () => {
    const userId = "user-f"
    const received: string[] = []
    const unsubscribe = sessionStore.subscribe(userId, () => received.push("changed"))
    await sessionStore.set(userId, baseSession())
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(received.length, 1)
    unsubscribe()
  })

  it("subscribe NÃO notifica para um userId diferente", async () => {
    const received: string[] = []
    const unsubscribe = sessionStore.subscribe("user-g", () => received.push("changed"))
    await sessionStore.set("user-h", baseSession())
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(received.length, 0)
    unsubscribe()
  })
})
