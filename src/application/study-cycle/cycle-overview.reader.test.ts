import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"

import { buildCycleOverview } from "./cycle-progress.service"
import { loadActiveCycleOverview, loadCycleOverviewById, loadCyclesOverview } from "./cycle-overview.reader"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"
import type { StudyCycle, StudyCycleItemWithDetails, StudyCycleSession } from "@/domain/study-cycle/study-cycle.types"

/**
 * Fase F.1 — abrir /ciclos (e o widget "Foco de hoje") é SOMENTE LEITURA e
 * enxerga todas as sessões do ciclo, mesmo acima de 1.000.
 *
 * Estas funções são exatamente o corpo de getCyclesAction /
 * getActiveCycleAction / getCycleByIdAction (as actions só resolvem o usuário
 * e delegam). O banco falso corta cada resposta em 1.000 linhas como o
 * PostgREST real.
 */

const USER = "u1"
const ITEMS = 9

function cycle(id: string, status: StudyCycle["status"], extra: Partial<StudyCycle> = {}): StudyCycle {
  return {
    id,
    user_id: USER,
    name: id,
    contest_name: null,
    edital_name: null,
    status,
    current_item_index: 3,
    current_round: 8,
    total_rounds_done: 7,
    current_item_progress_min: 20,
    current_item_progress_seconds: 1210,
    created_at: `2025-0${status === "ACTIVE" ? 2 : 1}-01T00:00:00Z`,
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  }
}

function items(cycleId: string): StudyCycleItemWithDetails[] {
  return Array.from({ length: ITEMS }, (_, i) => ({
    id: `${cycleId}-item-${i}`,
    cycle_id: cycleId,
    discipline_id: `disc-${i}`,
    order: i + 1,
    priority: "MEDIA",
    planned_minutes: 50 + i * 5,
    last_studied_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    discipline: { id: `disc-${i}`, name: `D${i}`, area: null, color_hex: null },
  }))
}

function sessions(cycleId: string, n: number): StudyCycleSession[] {
  return Array.from({ length: n }, (_, k) => {
    const seconds = 600 + ((k * 7919) % 3000)
    return {
      id: `${cycleId}-s${String(k).padStart(6, "0")}`,
      cycle_id: cycleId,
      cycle_item_id: `${cycleId}-item-${k % ITEMS}`,
      round_number: Math.min(8, 1 + Math.floor(k / 130)),
      minutes_contributed: Math.round(seconds / 60),
      extra_minutes: 0,
      seconds_contributed: seconds,
      extra_seconds: k % 13 === 0 ? 240 : 0,
      is_skip: k % 101 === 0,
      created_at: new Date(Date.UTC(2025, 1, 1) + k * 3_600_000).toISOString(),
    }
  })
}

function byId(a: { id: string }, b: { id: string }): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function setup(activeSessions: number, pausedSessions = 0) {
  const active = cycle("c-active", "ACTIVE")
  const paused = cycle("c-paused", "PAUSED", { current_round: 2, current_item_index: 0 })
  const archived = cycle("c-archived", "ARCHIVED")
  const tables = {
    study_cycles: [active, paused, archived],
    study_cycle_items: [...items(active.id), ...items(paused.id), ...items(archived.id)],
    study_cycle_sessions: [...sessions(active.id, activeSessions), ...sessions(paused.id, pausedSessions)],
    study_cycle_item_skips: [
      { id: "sk1", cycle_id: active.id, cycle_item_id: `${active.id}-item-1`, round_number: 8 },
      { id: "sk2", cycle_id: active.id, cycle_item_id: `${active.id}-item-2`, round_number: 5 },
    ],
  }
  // Cópia profunda para provar depois que nada foi alterado.
  const snapshot = JSON.parse(JSON.stringify(tables)) as typeof tables
  const db = new FakePostgrest(tables as unknown as Record<string, Record<string, unknown>[]>)
  return { db, supabase: db as unknown as SupabaseClient, active, paused, tables, snapshot }
}

describe("Ciclos — leitura (Fase F.1)", () => {
  for (const n of [0, 999, 1000, 1001, 1500, 2000, 3500]) {
    it(`ciclo ativo com ${n} sessões: overview idêntico ao calculado com TODAS as sessões`, async () => {
      const { supabase, active, tables } = setup(n)
      const overview = await loadActiveCycleOverview(supabase, USER)
      const expected = buildCycleOverview(
        active,
        items(active.id),
        tables.study_cycle_sessions.filter((s) => s.cycle_id === active.id).sort(byId),
        new Set([`${active.id}-item-1`]),
      )
      assert.deepEqual(overview, expected)
    })
  }

  it("lista de ciclos (2 ciclos, 1.400 + 1.100 sessões): cada ciclo recebe todas as suas sessões; ARCHIVED fica de fora", async () => {
    const { supabase, active, paused, tables } = setup(1400, 1100)
    const list = await loadCyclesOverview(supabase, USER)
    assert.equal(list.length, 2)
    const all = tables.study_cycle_sessions
    const expectedActive = buildCycleOverview(
      active,
      items(active.id),
      all.filter((s) => s.cycle_id === active.id).sort(byId),
      new Set([`${active.id}-item-1`]),
    )
    const expectedPaused = buildCycleOverview(paused, items(paused.id), all.filter((s) => s.cycle_id === paused.id).sort(byId), new Set())
    // Ordem: created_at desc (ACTIVE criado depois do PAUSED neste cenário).
    assert.deepEqual(list, [expectedActive, expectedPaused])
  })

  it("ciclo por id: mesmo resultado do ciclo ativo, com 2.000 sessões", async () => {
    const { supabase, active } = setup(2000)
    assert.deepEqual(await loadCycleOverviewById(supabase, USER, active.id), await loadActiveCycleOverview(supabase, USER))
  })

  it("abrir /ciclos é SOMENTE LEITURA: nenhuma escrita, nenhum dado alterado (cursor, volta, progresso, skips)", async () => {
    const { db, supabase, tables, snapshot } = setup(2500, 300)
    await loadCyclesOverview(supabase, USER)
    await loadActiveCycleOverview(supabase, USER)
    assert.equal(db.writes.length, 0)
    assert.deepEqual(tables, snapshot)
    const touched = new Set(db.requests.map((r) => r.table))
    assert.deepEqual([...touched].sort(), [
      "study_cycle_item_skips",
      "study_cycle_items",
      "study_cycle_sessions",
      "study_cycles",
    ])
    // Não consulta study_history (rebuild/reconcile leriam o histórico inteiro).
    assert.equal(touched.has("study_history"), false)
  })

  it("todas as páginas de sessões têm ORDER BY e no máximo 1.000 linhas", async () => {
    const { db, supabase } = setup(3500)
    await loadActiveCycleOverview(supabase, USER)
    const pages = db.requests.filter((r) => r.table === "study_cycle_sessions")
    assert.equal(pages.length, 4) // 3.500 → 4 páginas
    assert.ok(pages.every((p) => p.ordered && p.from !== null && p.to !== null && p.to - p.from + 1 <= 1000))
  })

  it("sem ciclo ativo → null, sem ler sessões", async () => {
    const { db, supabase } = setup(10)
    const res = await loadActiveCycleOverview(supabase, "outro-usuario")
    assert.equal(res, null)
    assert.equal(db.requests.filter((r) => r.table === "study_cycle_sessions").length, 0)
  })
})
