import { beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  __resetServerActionCacheForTests,
  fetchWithCache,
  readFreshCache,
  seedCache,
} from "./server-action-cache"

// Fase F (performance): garante que leituras via Server Action no cliente não
// são repetidas sem necessidade (o Next.js executa Server Actions de um mesmo
// cliente em fila, então cada chamada duplicada atrasa as demais).

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("server-action-cache", () => {
  beforeEach(() => __resetServerActionCacheForTests())

  it("chamadas simultâneas da mesma chave disparam o fetcher UMA vez", async () => {
    let calls = 0
    const d = deferred<string>()
    const fetcher = () => {
      calls++
      return d.promise
    }
    const a = fetchWithCache("k", fetcher, { ttl: 60_000 })
    const b = fetchWithCache("k", fetcher, { ttl: 60_000 })
    const c = fetchWithCache("k", fetcher, { ttl: 60_000 })
    d.resolve("valor")
    assert.deepEqual(await Promise.all([a, b, c]), ["valor", "valor", "valor"])
    assert.equal(calls, 1)
  })

  it("com cache fresco não chama o fetcher", async () => {
    let calls = 0
    await fetchWithCache("k", async () => (calls++, 1), { ttl: 60_000 })
    const again = await fetchWithCache("k", async () => (calls++, 2), { ttl: 60_000 })
    assert.equal(again, 1)
    assert.equal(calls, 1)
  })

  it("cache expirado busca de novo", async () => {
    seedCache("k", "velho", Date.now() - 10_000)
    assert.equal(readFreshCache("k", 5_000), null)
    const v = await fetchWithCache("k", async () => "novo", { ttl: 5_000 })
    assert.equal(v, "novo")
  })

  it("force ignora cache fresco e busca de novo (refresh após salvar estudo)", async () => {
    seedCache("k", "antigo")
    let calls = 0
    const v = await fetchWithCache("k", async () => (calls++, "atual"), { ttl: 60_000, force: true })
    assert.equal(v, "atual")
    assert.equal(calls, 1)
    assert.equal(readFreshCache<string>("k", 60_000)?.data, "atual")
  })

  it("dado semeado pelo servidor é servido sem chamar o fetcher, inclusive null", async () => {
    seedCache("ciclo", null)
    let calls = 0
    const v = await fetchWithCache("ciclo", async () => (calls++, { id: "x" }), { ttl: 60_000 })
    assert.equal(v, null)
    assert.equal(calls, 0)
  })

  it("erro não fica preso: a próxima chamada tenta de novo", async () => {
    let calls = 0
    await assert.rejects(
      fetchWithCache("k", async () => {
        calls++
        throw new Error("falhou")
      }, { ttl: 60_000 }),
    )
    const v = await fetchWithCache("k", async () => (calls++, "ok"), { ttl: 60_000 })
    assert.equal(v, "ok")
    assert.equal(calls, 2)
  })

  it("chaves diferentes não compartilham resultado", async () => {
    const a = await fetchWithCache("mes:2026:9", async () => "set", { ttl: 60_000 })
    const b = await fetchWithCache("mes:2026:10", async () => "out", { ttl: 60_000 })
    assert.equal(a, "set")
    assert.equal(b, "out")
  })
})
