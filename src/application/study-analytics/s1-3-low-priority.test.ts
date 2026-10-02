// ============================================================================
// S1.3 — fechamento de baixa prioridade:
// question_id (contrato honesto), goalSource no card de metas, auth por caso.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  computePlanning,
  sanitizeAttempt,
  type ActivePlan,
} from "@/application/study-analytics/engine/stats-engine.ts"

const actions = readFileSync(
  "src/application/study-analytics/study-analytics.actions.ts",
  "utf8",
)
const centerAction = readFileSync(
  "src/application/study-analytics/statistics-center.action.ts",
  "utf8",
)
const view = readFileSync(
  "src/features/statistics/components/statistics-center-view.tsx",
  "utf8",
)

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  const next = src.indexOf("export async function", start + 10)
  return src.slice(start, next === -1 ? undefined : next)
}

describe("S1.3 question_id: contrato honesto, consumers intactos", () => {
  it("sanitize preserva question_id quando presente e null quando ausente", () => {
    assert.equal(
      sanitizeAttempt({ id: "a", question_id: "q1", correct: true })?.questionId,
      "q1",
    )
    assert.equal(sanitizeAttempt({ id: "a", correct: false })?.questionId, null)
  })

  it("loader do center não seleciona question_id (ninguém consome) e documenta", () => {
    assert.doesNotMatch(centerAction, /select\("id, correct, answered_at, attempt_source, question_id/)
    assert.match(centerAction, /question_id NÃO é selecionado/)
  })
})

describe("S1.3 goalSource no card de metas", () => {
  const plan = (source: "configured" | "suggested"): ActivePlan => ({
    weeklyHours: 20,
    weeklyQuestions: null,
    weeklyDays: null,
    weeklyHoursSource: source,
    items: [{ dayOfWeek: 1, durationMinutes: 60, disciplineId: null }],
  })

  it("3 configured → weeklyTargetSource configured", () => {
    const r = computePlanning(plan("configured"), [], new Date("2026-08-27T12:00:00Z"), "America/Sao_Paulo", 0)
    assert.equal(r.weeklyTargetSource, "configured")
  })

  it("4 suggested → weeklyTargetSource suggested", () => {
    const r = computePlanning(plan("suggested"), [], new Date("2026-08-27T12:00:00Z"), "America/Sao_Paulo", 0)
    assert.equal(r.weeklyTargetSource, "suggested")
  })

  it("5 ausência de plano → sem fonte (hasPlan false)", () => {
    const r = computePlanning(null, [], new Date("2026-08-27T12:00:00Z"), "America/Sao_Paulo", 0)
    assert.equal(r.hasPlan, false)
    assert.ok(r.weeklyTargetSource == null)
  })

  it("6 erro do profile não fabrica fonte (fetchActivePlan retorna null antes)", () => {
    const idx = centerAction.indexOf("async function fetchActivePlan")
    const body = centerAction.slice(idx, idx + 6000)
    assert.match(body, /if \(profileError\)/)
    const retIdx = body.indexOf("return null")
    const srcIdx = body.indexOf("weeklyHoursSource")
    assert.ok(retIdx > 0 && srcIdx > 0 && retIdx < srcIdx)
  })

  it("wiring: card rotula 'Meta sugerida' só quando suggested", () => {
    assert.match(view, /Meta sugerida/)
    assert.match(view, /weeklyTargetSource === "suggested"/)
  })
})

describe("S1.3 auth por caso", () => {
  it("7 casos B usam getEffectiveUserId e nada de getUser no corpo", () => {
    for (const fn of ["getUserStatisticsAction", "getRankingPersonalContextAction"]) {
      const body = fnBody(actions, fn)
      assert.match(body, /getEffectiveUserId\(supabase\)/, fn)
      assert.doesNotMatch(body, /auth\.getUser\(\)/, fn)
    }
  })

  it("9 ranking global mantém auth.getUser com justificativa (caso A)", () => {
    const body = fnBody(actions, "getGlobalRankingAction")
    assert.match(body, /auth\.getUser\(\)/)
    assert.match(body, /S1\.3 \(caso A/)
  })

  it("8/10 isolamento: filtros user_id do usuário efetivo nos casos B", () => {
    const u = fnBody(actions, "getUserStatisticsAction")
    assert.match(u, /\.eq\("user_id", effectiveUserId\)/)
    const r = fnBody(actions, "getRankingPersonalContextAction")
    assert.match(r, /\.eq\("id", effectiveUserId\)/)
    assert.match(r, /getStudyHistoryForAnalytics\(supabase, effectiveUserId, 365\)/)
  })
})
