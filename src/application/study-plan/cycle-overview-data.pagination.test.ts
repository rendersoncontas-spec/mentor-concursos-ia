import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getCycleOverviewData } from "./study-plan.service"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"

/**
 * Fase F.1 — getCycleOverviewData (Planejamento / Dashboard) com mais de 1.000
 * sessões desde a criação do plano. Antes: 1 requisição sem paginação → o
 * PostgREST devolvia só 1.000 linhas e o "estudado" ficava subcontado. O
 * banco falso reproduz esse corte.
 */

const USER = "u1"
const PLAN_DATE = "2025-06-01T00:00:00.000Z"
const DISCS = ["d-port", "d-trib", "d-cont", "d-adm"]

function makeDb(sessionsSincePlan: number, sessionsBeforePlan = 150) {
  const history: Record<string, unknown>[] = []
  const start = Date.parse(PLAN_DATE)
  for (let k = 0; k < sessionsBeforePlan; k++) {
    history.push({
      id: `h-old-${String(k).padStart(6, "0")}`,
      user_id: USER,
      discipline_id: DISCS[k % DISCS.length],
      duration_minutes: 30,
      started_at: new Date(start - (k + 1) * 3_600_000).toISOString(),
    })
  }
  for (let k = 0; k < sessionsSincePlan; k++) {
    history.push({
      id: `h-${String(k).padStart(6, "0")}`,
      user_id: USER,
      discipline_id: DISCS[(k * 7) % DISCS.length],
      duration_minutes: 20 + (k % 50),
      // Mesmo horário para pares de sessões: exercita o desempate por id.
      started_at: new Date(start + Math.floor(k / 2) * 5_400_000).toISOString(),
    })
  }
  // Outro usuário não pode entrar na soma.
  history.push({ id: "h-other", user_id: "u2", discipline_id: "d-port", duration_minutes: 999, started_at: PLAN_DATE })

  const db = new FakePostgrest({
    study_plans: [
      { id: "plan-1", user_id: USER, active: true, version: 3, generated_at: PLAN_DATE, created_at: PLAN_DATE },
    ],
    study_plan_items: DISCS.map((d, i) => ({
      id: `item-${d}`,
      study_plan_id: "plan-1",
      discipline_id: d,
      day_of_week: i,
      duration_minutes: 600,
      priority: i + 1,
      priority_score: 10 - i,
      recommended_sessions: 3,
      created_at: PLAN_DATE,
      disciplines: { id: d, name: d, area: null },
    })),
    study_history: history,
  })
  return { db, supabase: db as unknown as SupabaseClient, history }
}

function expectedStudied(history: Record<string, unknown>[]) {
  const map = new Map<string, number>()
  for (const h of history) {
    if (h["user_id"] !== USER || (h["started_at"] as string) < PLAN_DATE) continue
    const d = h["discipline_id"] as string
    map.set(d, (map.get(d) || 0) + (h["duration_minutes"] as number))
  }
  return map
}

describe("getCycleOverviewData — study_history desde o plano, paginado", () => {
  for (const n of [0, 999, 1000, 1001, 2000, 2500, 5000]) {
    it(`${n} sessões desde o plano: "estudado" por disciplina e histórico completos, sem duplicar`, async () => {
      const { supabase, history } = makeDb(n)
      const data = await getCycleOverviewData(supabase, USER)
      assert.ok(data)
      const exp = expectedStudied(history)
      for (const block of data.blocks) {
        assert.equal(block.studiedMinutes, exp.get(block.disciplineId) || 0, block.disciplineId)
      }
      assert.equal(data.history?.length, n)
      const totalExpected = [...exp.values()].reduce((a, b) => a + b, 0)
      assert.equal(
        (data.history ?? []).reduce((a, h) => a + h.minutes, 0),
        totalExpected,
      )
    })
  }

  it("a leitura antiga (1 requisição) com 1.500 sessões devolvia só 1.000 linhas", async () => {
    const { db } = makeDb(1500, 0)
    const old = (await db
      .from("study_history")
      .select("discipline_id, duration_minutes, started_at")
      .eq("user_id", USER)
      .gte("started_at", PLAN_DATE)) as unknown as { data: unknown[] }
    assert.equal(old.data.length, 1000)
  })

  it("só lê e ordena de forma determinística (started_at + id) em páginas de até 1.000", async () => {
    const { db, supabase } = makeDb(2200)
    await getCycleOverviewData(supabase, USER)
    assert.equal(db.writes.length, 0)
    const pages = db.requests.filter((r) => r.table === "study_history")
    assert.equal(pages.length, 3)
    assert.ok(pages.every((p) => p.ordered && p.to !== null && p.from !== null && p.to - p.from + 1 <= 1000))
  })
})
