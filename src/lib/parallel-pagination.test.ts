import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { fetchAllPagesInParallel, type PageResult } from "./parallel-pagination"

// Fonte falsa que imita o PostgREST: range inclusivo, count opcional e
// registro de quantas requisições estavam em voo ao mesmo tempo.
function fakeSource(total: number, opts: { withCount?: boolean; failAt?: number; jitter?: boolean } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  let inFlight = 0
  let maxInFlight = 0
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number, withCount: boolean): Promise<PageResult<{ id: number }>> => {
    calls.push([from, to])
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    // Com jitter, páginas posteriores podem responder ANTES das anteriores.
    await new Promise((r) => setTimeout(r, opts.jitter ? 1 + ((from / 1000) * 7) % 11 : 5))
    inFlight--
    if (opts.failAt !== undefined && from === opts.failAt) return { data: null, error: { message: "falha" } }
    return {
      data: rows.slice(from, to + 1),
      error: null,
      count: withCount && opts.withCount !== false ? total : null,
    }
  }
  return { fetchPage, calls, get maxInFlight() { return maxInFlight } }
}

// Referência: a leitura sequencial antiga (página a página até vir incompleta).
async function sequential(total: number, pageSize: number) {
  const src = fakeSource(total, { withCount: false })
  const all: Array<{ id: number }> = []
  let offset = 0
  for (;;) {
    const { data } = await src.fetchPage(offset, offset + pageSize - 1, false)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return all
}

describe("fetchAllPagesInParallel", () => {
  for (const total of [0, 1, 999, 1000, 1001, 1500, 2000, 2797, 3000, 5000, 10_000, 10_001]) {
    it(`devolve exatamente as mesmas linhas, na mesma ordem, que a leitura sequencial (${total} linhas)`, async () => {
      const src = fakeSource(total)
      const { data, error } = await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000 })
      assert.equal(error, null)
      assert.deepEqual(data, await sequential(total, 1000))
    })
  }

  it("com 2.797 linhas: 1 página com contagem + 2 páginas simultâneas (antes: 3 em sequência)", async () => {
    const src = fakeSource(2797)
    await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000 })
    assert.deepEqual(src.calls, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    assert.equal(src.maxInFlight, 2)
  })

  it("sem contagem, cai para a leitura sequencial e continua correta", async () => {
    const src = fakeSource(2500, { withCount: false })
    const { data } = await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000 })
    assert.equal(data.length, 2500)
    assert.equal(src.maxInFlight, 1)
  })

  it("respeita maxRows (limite de segurança de quem chama)", async () => {
    const src = fakeSource(5000)
    const { data } = await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000, maxRows: 2500 })
    assert.equal(data.length, 2500)
    assert.deepEqual(data.slice(-1), [{ id: 2499 }])
  })

  it("propaga erro de uma página", async () => {
    const src = fakeSource(2500, { failAt: 1000 })
    const { error } = await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000 })
    assert.deepEqual(error, { message: "falha" })
  })

  it("10.000+ linhas: no máximo `concurrency` requisições simultâneas (padrão 4), sem perder nem repetir linhas", async () => {
    const src = fakeSource(10_500, { jitter: true })
    const { data } = await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000 })
    assert.equal(data.length, 10_500)
    assert.equal(new Set(data.map((r) => r.id)).size, 10_500)
    assert.ok(src.maxInFlight <= 4, `maxInFlight=${src.maxInFlight}`)
  })

  it("mantém a ordem mesmo quando páginas posteriores respondem primeiro", async () => {
    const src = fakeSource(6000, { jitter: true })
    const { data } = await fetchAllPagesInParallel(src.fetchPage, { pageSize: 1000, concurrency: 5 })
    assert.deepEqual(
      data.map((r) => r.id),
      Array.from({ length: 6000 }, (_, i) => i),
    )
  })
})
