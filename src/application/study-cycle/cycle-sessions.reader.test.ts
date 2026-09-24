import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"

import { buildCycleOverview } from "./cycle-progress.service"
import { fetchAllCycleSessions } from "./cycle-sessions.reader"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"
import type { StudyCycle, StudyCycleItemWithDetails, StudyCycleSession } from "@/domain/study-cycle/study-cycle.types"

/**
 * Fase F.1 — study_cycle_sessions acima de 1.000 linhas.
 *
 * O PostgREST corta cada resposta em 1.000 linhas (o fake reproduz isso). A
 * leitura antiga (1 requisição) perdia o excedente em silêncio; a nova
 * pagina com ordenação por id e deve devolver TODAS as linhas, sem repetir
 * nenhuma, e o resultado do Cycle Engine (buildCycleOverview) deve ser
 * idêntico ao calculado com o conjunto completo.
 */

const ITEMS = 9
const CYCLE: StudyCycle = {
  id: "cycle-a",
  user_id: "u1",
  name: "Ciclo",
  contest_name: null,
  edital_name: null,
  status: "ACTIVE",
  current_item_index: 4,
  current_round: 7,
  total_rounds_done: 6,
  current_item_progress_min: 12,
  current_item_progress_seconds: 725,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
}

const items: StudyCycleItemWithDetails[] = Array.from({ length: ITEMS }, (_, i) => ({
  id: `item-${i}`,
  cycle_id: CYCLE.id,
  discipline_id: `disc-${i}`,
  order: i + 1,
  priority: "MEDIA",
  planned_minutes: 45 + i * 5,
  last_studied_at: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  discipline: { id: `disc-${i}`, name: `D${i}`, area: null, color_hex: null },
}))

function makeSessions(n: number, cycleId = CYCLE.id): StudyCycleSession[] {
  return Array.from({ length: n }, (_, k) => {
    const round = 1 + Math.floor(k / 140) // ~140 sessões por volta
    const seconds = 300 + ((k * 7919) % 3300)
    return {
      id: `${cycleId}-s${String(k).padStart(6, "0")}`,
      cycle_id: cycleId,
      cycle_item_id: `item-${k % ITEMS}`,
      round_number: Math.min(round, CYCLE.current_round),
      minutes_contributed: Math.round(seconds / 60),
      extra_minutes: k % 11 === 0 ? 3 : 0,
      seconds_contributed: seconds,
      extra_seconds: k % 11 === 0 ? 180 : 0,
      is_skip: k % 97 === 0,
      created_at: new Date(Date.UTC(2025, 0, 1) + k * 3_600_000).toISOString(),
    }
  })
}

function fakeClient(sessions: StudyCycleSession[]) {
  const db = new FakePostgrest({ study_cycle_sessions: sessions as unknown as Record<string, unknown>[] })
  return { db, supabase: db as unknown as SupabaseClient }
}

function assertOverviewClose(actual: unknown, expected: unknown, path = "overview"): void {
  if (typeof expected === "number" && typeof actual === "number") {
    assert.ok(Math.abs(actual - expected) <= 1e-9, `${path}: ${actual} vs ${expected}`)
    return
  }
  if (expected && typeof expected === "object") {
    assert.equal(typeof actual, "object", path)
    const keys = new Set([...Object.keys(expected as object), ...Object.keys(actual as object)])
    for (const k of keys) {
      assertOverviewClose((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k], `${path}.${k}`)
    }
    return
  }
  assert.deepEqual(actual, expected, path)
}

function byId(a: { id: string }, b: { id: string }): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

describe("fetchAllCycleSessions — leitura completa de study_cycle_sessions", () => {
  for (const n of [0, 999, 1000, 1001, 1500, 2000, 2500, 5000, 10_000]) {
    it(`${n} sessões: todas lidas, nenhuma repetida, ordem por id`, async () => {
      const all = makeSessions(n)
      const { supabase } = fakeClient(all)
      const { data, error } = await fetchAllCycleSessions<StudyCycleSession>(supabase, { cycleId: CYCLE.id })
      assert.equal(error, null)
      assert.equal(data.length, n)
      assert.equal(new Set(data.map((s) => s.id)).size, n)
      assert.deepEqual(data, [...all].sort(byId))
    })

    it(`${n} sessões: o Cycle Engine calcula exatamente o mesmo resultado que com o conjunto completo`, async () => {
      const all = makeSessions(n)
      const { supabase } = fakeClient(all)
      const { data } = await fetchAllCycleSessions<StudyCycleSession>(supabase, { cycleId: CYCLE.id })
      const expected = buildCycleOverview(CYCLE, items, [...all].sort(byId), new Set(["item-2"]))
      const actual = buildCycleOverview(CYCLE, items, data, new Set(["item-2"]))
      assert.deepEqual(actual, expected)
    })
  }

  it("a leitura ANTIGA (1 requisição sem paginação) perdia sessões acima de 1.000 — e o progresso mudava", async () => {
    const all = makeSessions(1500)
    const { db } = fakeClient(all)
    const old = (await db.from("study_cycle_sessions").select("*").eq("cycle_id", CYCLE.id)) as unknown as {
      data: StudyCycleSession[]
    }
    assert.equal(old.data.length, 1000) // corte silencioso do PostgREST
    const truncated = buildCycleOverview(CYCLE, items, old.data)
    const full = buildCycleOverview(CYCLE, items, all)
    assert.notDeepEqual(truncated, full)
  })

  it("ordem das sessões só afeta a soma em ponto flutuante (≤ 1e-9 min); por isso a leitura fixa ORDER BY id", () => {
    // Antes a consulta não tinha ORDER BY: o banco devolvia as linhas na ordem
    // física, que pode mudar. Somas de minutos fracionários (segundos/60) em
    // ordens diferentes diferem só na 12ª casa decimal. Com ORDER BY id a
    // ordem agora é sempre a mesma → resultado bit a bit estável.
    const all = makeSessions(1500)
    const base = buildCycleOverview(CYCLE, items, all, new Set(["item-2"]))
    for (const variant of [[...all].reverse(), [...all.slice(700), ...all.slice(0, 700)]]) {
      assertOverviewClose(buildCycleOverview(CYCLE, items, variant, new Set(["item-2"])), base)
    }
  })

  it("vários ciclos (.in cycle_id): 1.200 + 900 sessões lidas por completo e separáveis por ciclo", async () => {
    const a = makeSessions(1200, "cycle-a")
    const b = makeSessions(900, "cycle-b")
    const { supabase } = fakeClient([...a, ...b])
    const { data } = await fetchAllCycleSessions<StudyCycleSession>(supabase, { cycleIds: ["cycle-a", "cycle-b"] })
    assert.equal(data.length, 2100)
    assert.equal(data.filter((s) => s.cycle_id === "cycle-a").length, 1200)
    assert.equal(data.filter((s) => s.cycle_id === "cycle-b").length, 900)
  })

  it("lista de ciclos vazia não consulta o banco", async () => {
    const { db, supabase } = fakeClient(makeSessions(10))
    const { data } = await fetchAllCycleSessions(supabase, { cycleIds: [] })
    assert.deepEqual(data, [])
    assert.equal(db.requests.length, 0)
  })

  it("só lê: nenhuma escrita em study_cycle_sessions", async () => {
    const { db, supabase } = fakeClient(makeSessions(2500))
    await fetchAllCycleSessions(supabase, { cycleId: CYCLE.id })
    assert.equal(db.writes.length, 0)
    assert.ok(db.requests.every((r) => r.ordered), "toda página precisa de ORDER BY determinístico")
    assert.ok(db.requests.every((r) => r.from !== null && r.to !== null && r.to - r.from + 1 <= 1000))
  })
})
