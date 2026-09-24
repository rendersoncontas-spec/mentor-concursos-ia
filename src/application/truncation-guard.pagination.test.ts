import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getPendingReviewsSummary } from "@/application/review-engine/review-engine.service"
import { getStudyHistoryForAnalytics } from "@/application/study-analytics/study-analytics.service"
import { getAllUserHistory } from "@/application/study-history/study-history.service"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"

/**
 * Fase F.1 — proteção contra truncamento (limite de 1.000 linhas por resposta
 * do PostgREST, que continua ativo como proteção do banco: a solução é
 * PAGINAR, nunca aumentar o limite global). O banco falso corta cada resposta
 * em 1.000 linhas e embaralha a ordem quando não há ORDER BY.
 */

const USER = "u1"

function historyRows(n: number, opts: { nullEvery?: number; tieEvery?: number } = {}) {
  const base = Date.UTC(2020, 9, 25)
  return Array.from({ length: n }, (_, k) => {
    // Pares de sessões com o MESMO started_at (há 18 empates na base real).
    const slot = opts.tieEvery && k % opts.tieEvery === 1 ? k - 1 : k
    return {
      id: `h${String(k).padStart(6, "0")}`,
      user_id: USER,
      discipline_id: `d${k % 7}`,
      started_at: new Date(base + slot * 6 * 3_600_000).toISOString(),
      duration_minutes: opts.nullEvery && k % opts.nullEvery === 0 ? null : 15 + (k % 90),
      metadata: { questions_answered: k % 5, questions_correct: k % 3 },
      disciplines: { id: `d${k % 7}`, name: `D${k % 7}`, area: null },
    }
  })
}

function client(tables: Record<string, Record<string, unknown>[]>) {
  const db = new FakePostgrest(tables)
  return { db, supabase: db as unknown as SupabaseClient }
}

describe("study_history acima de 1.000 linhas", () => {
  for (const n of [999, 1000, 1001, 2000, 2797, 5000, 10_000]) {
    it(`Histórico completo (getAllUserHistory) com ${n} sessões: todas, sem repetir, started_at desc + id desc`, async () => {
      const rows = historyRows(n, { tieEvery: 150 })
      const other = historyRows(50).map((r) => ({ ...r, id: `x${r.id}`, user_id: "u2" }))
      const { supabase, db } = client({ study_history: [...rows, ...other] })
      const data = (await getAllUserHistory(supabase, USER)) as Array<{ id: string; started_at: string; user_id: string }>
      assert.equal(data.length, n)
      assert.equal(new Set(data.map((r) => r.id)).size, n)
      assert.ok(data.every((r) => r.user_id === USER))
      const desc = (x: string, y: string) => (x < y ? 1 : -1)
      const expected = [...rows].sort((a, b) =>
        a.started_at === b.started_at ? desc(a.id, b.id) : desc(a.started_at, b.started_at),
      )
      assert.deepEqual(
        data.map((r) => r.id),
        expected.map((r) => r.id),
      )
      assert.equal(db.writes.length, 0)
    })
  }

  it("analytics do Dashboard (getStudyHistoryForAnalytics, período 0 = tudo) com 2.797 sessões: soma de minutos exata, nulos fora", async () => {
    const rows = historyRows(2797, { nullEvery: 400 })
    const { supabase } = client({ study_history: rows })
    const data = await getStudyHistoryForAnalytics(supabase, USER, 0)
    const expected = rows.filter((r) => r.duration_minutes !== null)
    assert.equal(data.length, expected.length)
    assert.equal(
      data.reduce((a, r) => a + (r.duration_minutes ?? 0), 0),
      expected.reduce((a, r) => a + (r.duration_minutes ?? 0), 0),
    )
    // ordem cronológica crescente preservada
    const times = data.map((r) => r.started_at)
    assert.deepEqual(times, [...times].sort())
  })

  it("a leitura antiga (1 requisição) devolveria só 1.000 de 2.797 sessões", async () => {
    const { db } = client({ study_history: historyRows(2797) })
    const res = (await db.from("study_history").select("*").eq("user_id", USER)) as unknown as { data: unknown[] }
    assert.equal(res.data.length, 1000)
  })
})

describe("review_items acima de 1.000 linhas", () => {
  it("KPI 'Revisões pendentes' do Dashboard conta TODOS os itens vencidos (1.500), não só 1.000", async () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString()
    const items = Array.from({ length: 1800 }, (_, k) => ({
      id: `r${String(k).padStart(6, "0")}`,
      user_id: USER,
      next_review_at: k < 1500 ? past : future,
      lapses_count: k % 4,
      difficulty: 5,
      deleted_at: null,
      is_suspended: false,
    }))
    const { supabase } = client({ review_items: items })
    const summary = await getPendingReviewsSummary(supabase, USER)
    assert.equal(summary.count, 1500)
    assert.equal(summary.overdue + summary.today, 1500)
    assert.equal(summary.nextReview, future)
  })
})
