import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getStudyHistoryForAnalytics } from "@/application/study-analytics/study-analytics.service"
import { FakePostgrest } from "@/lib/testing/fake-postgrest"

import { DASHBOARD_METADATA_KEYS } from "./dashboard.service"

/**
 * Fase F.2 — o Dashboard lê o histórico inteiro para agregar, mas do
 * `metadata` só usa questions_answered/questions_correct. Pedir só essas
 * chaves (caminho JSON no PostgREST) não pode mudar linhas, ordem, campos nem
 * os números calculados.
 */

const USER = "u1"

function rows(n: number) {
  const base = Date.UTC(2020, 9, 25, 15)
  return Array.from({ length: n }, (_, k) => ({
    id: `h${String(k).padStart(6, "0")}`,
    user_id: USER,
    discipline_id: `d${k % 7}`,
    study_source: k % 9 === 0 ? "REVIEW" : "FREE",
    study_type: k % 5 === 0 ? "REVISAO" : "TEORIA",
    started_at: new Date(base + Math.floor(k / 2) * 6.5 * 3_600_000).toISOString(),
    duration_minutes: k % 211 === 0 ? null : 15 + (k % 120),
    completed: k % 8 !== 0,
    interrupted: k % 17 === 0,
    focus_score: k % 5,
    energy_level: k % 4,
    difficulty: k % 3,
    metadata: {
      questions_answered: k % 6 === 0 ? null : k % 20,
      questions_correct: k % 6 === 0 ? undefined : k % 11,
      topic_name: `Tópico ${k}`,
      focus_percentage: k % 100,
      imported_seconds: k * 60,
      big_blob: "x".repeat(80),
    },
    disciplines: { name: `D${k % 7}`, area: "A" },
  }))
}

function client(n: number) {
  const db = new FakePostgrest({ study_history: rows(n) as unknown as Record<string, unknown>[] })
  return db as unknown as SupabaseClient
}

/** Os mesmos cálculos de metadata que dashboard.service.ts faz. */
function questionTotals(list: Array<{ metadata: Record<string, unknown> | null; completed: boolean | null; discipline_id: string | null }>) {
  let answered = 0
  let correct = 0
  const byDisc = new Map<string, [number, number]>()
  for (const s of list) {
    const meta = (s.metadata || {}) as Record<string, unknown>
    const a = Number(meta["questions_answered"] || 0)
    const c = Number(meta["questions_correct"] || 0)
    if (a > 0) {
      answered += a
      correct += Math.min(a, Math.max(0, c))
    }
    if (s.completed && s.discipline_id) {
      const cur = byDisc.get(s.discipline_id) ?? [0, 0]
      if (meta["questions_answered"]) cur[0] += Number(meta["questions_answered"])
      if (meta["questions_correct"]) cur[1] += Number(meta["questions_correct"])
      byDisc.set(s.discipline_id, cur)
    }
  }
  return { answered, correct, byDisc: [...byDisc.entries()].sort() }
}

describe("Dashboard — histórico com metadata reduzido", () => {
  it("2.797 sessões: mesmas linhas, mesma ordem, mesmos campos; metadata só com as chaves usadas", async () => {
    const full = await getStudyHistoryForAnalytics(client(2797), USER, 0)
    const slim = await getStudyHistoryForAnalytics(client(2797), USER, 0, { metadataKeys: DASHBOARD_METADATA_KEYS })
    assert.equal(slim.length, full.length)
    assert.deepEqual(
      slim.map((r) => r.id),
      full.map((r) => r.id),
    )
    for (let i = 0; i < full.length; i++) {
      const { metadata: mf, ...restFull } = full[i] as unknown as Record<string, unknown>
      const { metadata: ms, ...restSlim } = slim[i] as unknown as Record<string, unknown>
      assert.deepEqual(restSlim, restFull)
      const keys = Object.keys(ms as object)
      assert.ok(keys.every((k) => (DASHBOARD_METADATA_KEYS as readonly string[]).includes(k)), keys.join(","))
      for (const k of keys) assert.equal((ms as Record<string, unknown>)[k], (mf as Record<string, unknown>)[k])
    }
  })

  it("acertos por período e por disciplina calculados com o metadata reduzido são idênticos", async () => {
    const full = await getStudyHistoryForAnalytics(client(2797), USER, 0)
    const slim = await getStudyHistoryForAnalytics(client(2797), USER, 0, { metadataKeys: DASHBOARD_METADATA_KEYS })
    assert.deepEqual(questionTotals(slim), questionTotals(full))
  })

  it("dashboard.service só lê do metadata as chaves de DASHBOARD_METADATA_KEYS; o Analytics Engine não lê metadata", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/application/dashboard/dashboard.service.ts"), "utf-8")
    const used = new Set([...src.matchAll(/meta\["([a-z_]+)"\]/g)].map((m) => m[1]))
    assert.deepEqual([...used].sort(), [...DASHBOARD_METADATA_KEYS].sort())
    assert.ok(src.includes("getStudyHistoryForAnalytics(supabase, userId, 0, { metadataKeys: DASHBOARD_METADATA_KEYS })"))
    for (const f of ["context", "aggregations", "heatmap", "rankings", "evolution", "goals", "insights"]) {
      const engine = fs.readFileSync(path.join(process.cwd(), `src/application/study-analytics/${f}.ts`), "utf-8")
      assert.equal(/\bmetadata\b/.test(engine), false, `${f}.ts não deveria ler metadata`)
    }
  })
})
