// ============================================================================
// S1.1 — paginação e erro honesto nas actions auxiliares de estatísticas.
// ----------------------------------------------------------------------------
// Comportamental: replica EXATAMENTE as formas de consulta das duas actions
// (mesmas colunas, filtros e ORDER BY) sobre FakePostgrest com corte de 1000:
//   A) 1500 attempts → todos considerados (sem corte);
//   C) 600 linhas de histórico → sem corte de 500, ordem desc preservada;
//   E) isolamento por usuário; F) ordenação determinística; G) conjuntos
//      pequenos idênticos ao formato antigo.
// Wiring: as actions usam fetchAllRowsPaged + erro→{data:null} (nunca []).
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination.ts"
import { FakePostgrest } from "@/lib/testing/fake-postgrest.ts"

const source = readFileSync(
  "src/application/study-analytics/study-analytics.actions.ts",
  "utf8",
)

function attemptRows(n: number, userId = "u1") {
  return Array.from({ length: n }, (_, k) => ({
    id: `a-${String(k).padStart(4, "0")}`,
    correct: k % 3 !== 0,
    answered_at: new Date(Date.UTC(2026, 0, 1, 0, 0, k)).toISOString(),
    user_id: userId,
  }))
}

function historyRows(n: number, userId = "u1") {
  return Array.from({ length: n }, (_, k) => ({
    id: `h-${String(k).padStart(4, "0")}`,
    discipline_id: "d1",
    duration_minutes: 30,
    started_at: new Date(Date.UTC(2026, 7, 20, 12, 0, k)).toISOString(),
    study_plan_item_id: null,
    user_id: userId,
  }))
}

async function readAttemptsPaged(db: FakePostgrest, userId: string) {
  return fetchAllRowsPaged<{ id: string; correct: boolean | null }>(
    (withCount) =>
      db
        .from("question_attempts")
        .select("id, correct", countOption(withCount))
        .eq("user_id", userId),
    [
      { column: "answered_at", ascending: true },
      { column: "id", ascending: true },
    ],
    { maxRows: 50_000 },
  )
}

async function readRecentPaged(db: FakePostgrest, userId: string, since: string) {
  return fetchAllRowsPaged<{
    discipline_id: string | null
    duration_minutes: number | null
    started_at: string | null
    study_plan_item_id: string | null
  }>(
    (withCount) =>
      db
        .from("study_history")
        .select(
          "discipline_id, duration_minutes, started_at, study_plan_item_id",
          countOption(withCount),
        )
        .eq("user_id", userId)
        .gte("started_at", since),
    [
      { column: "started_at", ascending: false },
      { column: "id", ascending: false },
    ],
    { maxRows: 50_000 },
  )
}

describe("S1.1-A attempts 1500+: todos considerados (era cortado em ~1000)", () => {
  it("paginado devolve as 1500 linhas com contagem correta", async () => {
    const db = new FakePostgrest({ question_attempts: attemptRows(1500) }, 1000)
    const res = await readAttemptsPaged(db, "u1")
    assert.equal(res.error, null)
    assert.equal(res.data.length, 1500)
    const correct = res.data.filter((a) => a.correct).length
    assert.equal(correct, 1000)
    assert.equal(res.data.length - correct, 500)
  })

  it("forma antiga (sem range) cortaria no limite do PostgREST", async () => {
    const db = new FakePostgrest({ question_attempts: attemptRows(1500) }, 1000)
    const raw = await db.from("question_attempts").select("correct").eq("user_id", "u1")
    assert.ok((raw.data as unknown[]).length < 1500)
  })
})

describe("S1.1-C recente >500: sem corte, ordem desc preservada", () => {
  it("600 linhas voltam todas, started_at desc com id de desempate", async () => {
    const db = new FakePostgrest({ study_history: historyRows(600) }, 1000)
    const res = await readRecentPaged(db, "u1", "2026-01-01T00:00:00.000Z")
    assert.equal(res.error, null)
    assert.equal(res.data.length, 600)
    for (let i = 1; i < res.data.length; i++) {
      const prev = res.data[i - 1]?.started_at as string
      const cur = res.data[i]?.started_at as string
      assert.ok(prev >= cur, `fora de ordem em ${i}`)
    }
  })
})

describe("S1.1-B/D erro de leitura vira indisponibilidade, nunca []", () => {
  it("falha em question_attempts retorna erro (action: data null)", async () => {
    const db = new FakePostgrest({ question_attempts: attemptRows(10) }, 1000)
    db.failOn("question_attempts", 99)
    const res = await readAttemptsPaged(db, "u1")
    assert.ok(res.error !== null)
  })

  it("falha em study_history retorna erro (action: data null)", async () => {
    const db = new FakePostgrest({ study_history: historyRows(10) }, 1000)
    db.failOn("study_history", 99)
    const res = await readRecentPaged(db, "u1", "2026-01-01T00:00:00.000Z")
    assert.ok(res.error !== null)
  })

  it("wiring: attempts com erro retorna {data:null} (sem `|| []`)", () => {
    const fnStart = source.indexOf("export async function getUserStatisticsAction")
    const fnEnd = source.indexOf("export async function getGlobalRankingAction")
    const fn = source.slice(fnStart, fnEnd)
    assert.match(fn, /if \(attemptsResult\.error\)/)
    assert.match(fn, /return \{ data: null, error:/)
    assert.doesNotMatch(fn, /attemptsRows \|\| \[\]/)
  })

  it("wiring: recente com erro retorna {data:null, error} (sem `rows ?? []` mascarando)", () => {
    const fnStart = source.indexOf("export async function getRecentStudyHistoryAction")
    const fn = source.slice(fnStart)
    assert.match(fn, /if \(historyResult\.error\) return \{ data: null, error:/)
  })
})

describe("S1.1-E isolamento por usuário preservado", () => {
  it("linhas de outro usuário nunca entram", async () => {
    const db = new FakePostgrest(
      { question_attempts: [...attemptRows(5, "u1"), ...attemptRows(7, "u2")] },
      1000,
    )
    const res = await readAttemptsPaged(db, "u1")
    assert.equal(res.data.length, 5)
  })

  it("wiring: leituras filtram pelo usuário efetivo (S1.3 migrou user.id)", () => {
    assert.match(source, /\.eq\("user_id", effectiveUserId\)/)
    assert.doesNotMatch(source, /\.eq\("user_id", user\.id\)/)
  })
})

describe("S1.1-F/G ordenação determinística; pequenos inalterados", () => {
  it("tie-break por id: mesma chave de data não embaralha entre páginas", async () => {
    const rows = historyRows(30).map((r) => ({ ...r, started_at: "2026-08-20T12:00:00.000Z" }))
    const db = new FakePostgrest({ study_history: rows }, 1000)
    const first = await readRecentPaged(db, "u1", "2026-01-01T00:00:00.000Z")
    const second = await readRecentPaged(db, "u1", "2026-01-01T00:00:00.000Z")
    assert.deepEqual(
      first.data.map((r) => (r as unknown as Record<string, unknown>)["id"]),
      second.data.map((r) => (r as unknown as Record<string, unknown>)["id"]),
    )
  })

  it("3 linhas: resultado idêntico ao formato antigo", async () => {
    const db = new FakePostgrest({ question_attempts: attemptRows(3) }, 1000)
    const res = await readAttemptsPaged(db, "u1")
    assert.equal(res.data.length, 3)
    assert.equal(res.data.filter((a) => a.correct).length, 2)
  })

  it("wiring: sem .limit(500); order started_at desc + id desc", () => {
    const fnStart = source.indexOf("export async function getRecentStudyHistoryAction")
    const code = source.slice(fnStart).replace(/\/\/[^\n]*/g, "")
    assert.doesNotMatch(code, /\.limit\(500\)/)
    assert.match(code, /\{ column: "started_at", ascending: false \}/)
    assert.match(code, /\{ column: "id", ascending: false \}/)
  })
})
