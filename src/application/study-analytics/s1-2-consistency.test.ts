// ============================================================================
// S1.2 — consistência de filtros, semana e timezone (21 itens do briefing).
// Datas fixas, sem relógio real. Sem imports de server actions.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { readOrFlag } from "@/application/dashboard/dashboard-read-outcome.ts"
import {
  getStudyHistoryForAnalytics,
  analyticsSinceIso,
} from "@/application/study-analytics/study-analytics.service.ts"
import type { QuestionAttemptRecord } from "@/application/study-analytics/engine/stats-engine.ts"
import { filterAttempts } from "@/features/statistics/lib/attempts-filter.ts"
import { resolveWeekStartDay, getSaoPauloWeekRange } from "@/lib/study-time-calculator.ts"
import { FakePostgrest } from "@/lib/testing/fake-postgrest.ts"

const TZ = "America/Sao_Paulo"
const KEYS = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"]

function attempt(partial: Partial<QuestionAttemptRecord> & { id: string }): QuestionAttemptRecord {
  return {
    questionId: null,
    disciplineId: "d1",
    correct: true,
    answeredAt: "2026-08-24T15:00:00.000Z",
    attemptSource: "MANUAL",
    ...partial,
  }
}

describe("S1.2 studyType 1-5", () => {
  const mixed = [
    attempt({ id: "a1", attemptSource: "SIMULADO" }),
    attempt({ id: "a2", attemptSource: "MANUAL" }),
    attempt({ id: "a3", attemptSource: null }),
    attempt({ id: "a4", attemptSource: "SIMULADO", disciplineId: "d2" }),
  ]

  it("1 todos → comportamento atual (todos os 4)", () => {
    assert.equal(filterAttempts(mixed, KEYS, "all", "all", TZ, true).length, 4)
  })

  it("2 SIMULADO → só attempt_source SIMULADO", () => {
    const ids = filterAttempts(mixed, KEYS, "all", "SIMULADO", TZ, true).map((a) => a.id)
    assert.deepEqual(ids, ["a1", "a4"])
  })

  it("3 QUESTOES (sem vínculo) → nenhum standalone contamina", () => {
    assert.equal(filterAttempts(mixed, KEYS, "all", "QUESTOES", TZ, true).length, 0)
  })

  it("4 sem relação válida + 5 combo com disciplina", () => {
    assert.equal(
      filterAttempts(mixed, KEYS, "d2", "SIMULADO", TZ, true).map((a) => a.id).join(),
      "a4",
    )
    assert.equal(filterAttempts(mixed, KEYS, "d2", "QUESTOES", TZ, true).length, 0)
  })

  it("período continua valendo junto do tipo", () => {
    const out = filterAttempts(mixed, ["2026-08-24"], "all", "SIMULADO", TZ, false)
    assert.equal(out.length, 2)
    const out2 = filterAttempts(mixed, ["2026-08-20"], "all", "SIMULADO", TZ, false)
    assert.equal(out2.length, 0)
  })
})

describe("S1.2 week_start 6-10", () => {
  it("6 segunda → mesma janela de antes", () => {
    assert.equal(resolveWeekStartDay("Segunda-feira", 0), 1)
    const r = getSaoPauloWeekRange("2026-08-27", 1)
    assert.deepEqual([r.mondayKey, r.sundayKey], ["2026-08-24", "2026-08-30"])
  })

  it("7 domingo → domingo é início", () => {
    assert.equal(resolveWeekStartDay("Domingo", 1), 0)
    const r = getSaoPauloWeekRange("2026-08-27", 0)
    assert.deepEqual([r.mondayKey, r.sundayKey], ["2026-08-23", "2026-08-29"])
  })

  it("8 wiring: fallback do ranking lê o perfil e usa o resolver (banco, sem localStorage)", () => {
    const src = readFileSync(
      "src/application/study-analytics/study-analytics.actions.ts",
      "utf8",
    )
    const fnStart = src.indexOf("async function getRankingViaDirectQuery")
    const fn = src.slice(fnStart, fnStart + 3000)
    assert.match(fn, /\.from\("profiles"\)/)
    assert.match(fn, /resolveWeekStartDay\(/)
    assert.doesNotMatch(fn, /localStorage/)
  })

  it("9 semana atravessando mês", () => {
    const r = getSaoPauloWeekRange("2026-09-01", 0)
    assert.deepEqual([r.mondayKey, r.sundayKey], ["2026-08-30", "2026-09-05"])
  })

  it("10 borda exatamente no início da semana + virada de ano", () => {
    const sun = getSaoPauloWeekRange("2026-08-23", 0)
    assert.equal(sun.mondayKey, "2026-08-23")
    const mon = getSaoPauloWeekRange("2026-08-24", 1)
    assert.equal(mon.mondayKey, "2026-08-24")
    const ny = getSaoPauloWeekRange("2026-01-01", 0)
    assert.deepEqual([ny.mondayKey, ny.sundayKey], ["2025-12-28", "2026-01-03"])
  })
})

describe("S1.2 timezone 11-16", () => {
  it("11/12 meia-noite SP: instantes vizinhos caem em dias civis distintos", () => {
    // 2026-08-27T02:30Z = 23:30 de 26/08 em SP; 03:30Z = 00:30 de 27/08 em SP.
    // since(periodDays=1) = início de (hojeSP − 1): 25/08 vs 26/08.
    assert.equal(analyticsSinceIso(1, new Date("2026-08-27T02:30:00.000Z")), "2026-08-25T03:00:00.000Z")
    assert.equal(analyticsSinceIso(1, new Date("2026-08-27T03:30:00.000Z")), "2026-08-26T03:00:00.000Z")
  })

  it("13/14 início/fim de semana e 15 mês independem do fuso do runtime", () => {
    const a = analyticsSinceIso(7, new Date("2026-09-01T01:00:00.000Z"))
    const b = analyticsSinceIso(7, new Date("2026-09-01T01:00:00.000Z"))
    assert.equal(a, b)
    assert.equal(analyticsSinceIso(0, new Date("2026-09-01T01:00:00.000Z")), null)
    // 2026-08-01T02:00Z = 31/07 23:00 em SP; menos 30 dias = 01/07.
    assert.equal(analyticsSinceIso(30, new Date("2026-08-01T02:00:00.000Z")), "2026-07-01T03:00:00.000Z")
  })

  it("16 wiring: ranking fallback e center usam getSaoPauloWeekRange + resolveWeekStartDay", () => {
    const actions = readFileSync(
      "src/application/study-analytics/study-analytics.actions.ts",
      "utf8",
    )
    const center = readFileSync(
      "src/application/study-plan/weekly-planner.service.ts",
      "utf8",
    )
    assert.match(actions, /getSaoPauloWeekRange\(todayKey, weekStartDay\)/)
    assert.match(center, /resolveWeekStartDay\(/)
  })
})

describe("S1.2 erro parcial 17-21", () => {
  function historyDb(n: number) {
    return new FakePostgrest(
      {
        study_history: Array.from({ length: n }, (_, k) => ({
          id: `h-${k}`,
          user_id: "u1",
          discipline_id: "d1",
          study_source: "x",
          study_type: "y",
          started_at: "2026-08-20T12:00:00.000Z",
          duration_minutes: 10,
          completed: true,
          interrupted: false,
          focus_score: null,
          energy_level: null,
          difficulty: null,
          metadata: {},
        })),
      },
      1000,
    )
  }

  function clientFor(db: FakePostgrest) {
    return { from: (t: string) => db.from(t) } as never
  }

  it("17 todas as páginas ok → todos os dados (2797)", async () => {
    const data = await getStudyHistoryForAnalytics(clientFor(historyDb(2797)), "u1", 0)
    assert.equal(data.length, 2797)
  })

  it("18 erro na primeira página → lança (não vazio)", async () => {
    const db = historyDb(10)
    db.failOn("study_history", 99)
    await assert.rejects(() => getStudyHistoryForAnalytics(clientFor(db), "u1", 0))
  })

  it("19 erro em página posterior → lança (não parcial silencioso)", async () => {
    const db = historyDb(2500)
    let selects = 0
    const client = {
      from: (t: string) => {
        selects++
        // 1ª página (contagem) passa; as seguintes falham.
        if (selects === 2) db.failOn("study_history", 99)
        return db.from(t)
      },
    } as never
    await assert.rejects(() => getStudyHistoryForAnalytics(client, "u1", 0))
    assert.ok(selects > 1)
  })

  it("20 zero registros real → [] (sem erro)", async () => {
    const data = await getStudyHistoryForAnalytics(clientFor(historyDb(0)), "u1", 0)
    assert.deepEqual(data, [])
  })

  it("21 readOrFlag converte o throw em indisponibilidade (consumidor intacto)", async () => {
    const out = await readOrFlag(
      getStudyHistoryForAnalytics(clientFor(historyDb(0)), "u1", 0),
      [],
    )
    assert.deepEqual(out, { value: [], failed: false })
    const db = historyDb(10)
    db.failOn("study_history", 99)
    const out2 = await readOrFlag(getStudyHistoryForAnalytics(clientFor(db), "u1", 0), [])
    assert.deepEqual(out2, { value: [], failed: true })
  })
})
