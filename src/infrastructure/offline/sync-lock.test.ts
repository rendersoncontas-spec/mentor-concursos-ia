import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { isSyncInFlight, releaseSyncLock, tryAcquireSyncLock, withSyncLock } from "./sync-lock"

describe("sync-lock (item 11 do pedido — nunca dois workers de sync para o mesmo usuário)", () => {
  it("primeira tentativa adquire a trava; segunda tentativa (mesmo usuário) é recusada até liberar", () => {
    const userId = "lock-user-1"
    assert.equal(tryAcquireSyncLock(userId), true)
    assert.equal(tryAcquireSyncLock(userId), false)
    assert.equal(isSyncInFlight(userId), true)
    releaseSyncLock(userId)
    assert.equal(isSyncInFlight(userId), false)
    assert.equal(tryAcquireSyncLock(userId), true)
    releaseSyncLock(userId)
  })

  it("travas são independentes por usuário", () => {
    assert.equal(tryAcquireSyncLock("lock-user-2"), true)
    assert.equal(tryAcquireSyncLock("lock-user-3"), true)
    releaseSyncLock("lock-user-2")
    releaseSyncLock("lock-user-3")
  })

  it("withSyncLock libera a trava mesmo se a função lançar exceção", async () => {
    const userId = "lock-user-4"
    await assert.rejects(
      withSyncLock(userId, async () => {
        throw new Error("falha simulada")
      }),
    )
    assert.equal(isSyncInFlight(userId), false)
  })

  it("withSyncLock recusa uma segunda chamada concorrente para o mesmo usuário (retorna { skipped: true })", async () => {
    const userId = "lock-user-5"
    let resolveFirst: () => void = () => {}
    const first = withSyncLock(
      userId,
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = () => resolve("first-done")
        }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = await withSyncLock(userId, async () => "should-not-run")
    assert.deepEqual(second, { skipped: true })
    resolveFirst()
    assert.equal(await first, "first-done")
  })
})
