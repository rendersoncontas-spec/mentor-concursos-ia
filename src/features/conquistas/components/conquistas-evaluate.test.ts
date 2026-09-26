import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import type { AchievementsFacts } from "@/application/achievements/achievements.action"
import { ACHIEVEMENTS_LIST } from "@/domain/achievements/achievements.types"
import { must } from "@/lib/testing/must"

/**
 * Fase H — conquistas só desbloqueiam/progridem por condição real. O módulo da
 * tela importa a Server Action (que valida as variáveis públicas do Supabase
 * ao carregar): valores falsos + import dinâmico, como nos outros testes.
 */
process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://mock.supabase.co"
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "mock-anon-key"

async function evaluate(id: string, overrides: Partial<AchievementsFacts>) {
  const { evaluateAchievement } = await import("./conquistas-view")
  const def = must(ACHIEVEMENTS_LIST.find((d) => d.id === id), id)
  return evaluateAchievement(def, facts(overrides))
}

function facts(overrides: Partial<AchievementsFacts>): AchievementsFacts {
  return {
    streak: 0,
    totalMinutes: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    overallAccuracy: 0,
    reviews: 0,
    simulados: 0,
    simuladoAvgScore: 0,
    plans: 0,
    sessions: 0,
    onboardingCompleted: false,
    firstSessionAt: null,
    lastSessionAt: null,
    morningSessions: 0,
    afternoonSessions: 0,
    nightSessions: 0,
    distinctTopicsStudied: 0,
    bestDisciplineAcc30: 0,
    bestDisciplineAcc50: 0,
    planDaysTotal: 0,
    planDaysDone: 0,
    adherencePercentage: 0,
    replanRecoveredCount: 0,
    editalTopicsTotal: 0,
    editalTopicsStudied: 0,
    ...overrides,
  }
}

describe("Conquistas — REPLAN_* não desbloqueiam sem pendência recuperada", () => {
  it("sequência longa não desbloqueia mais (antes: streak ≥ 7 = 'Pendência recuperada')", async () => {
    for (const id of ["REPLAN_FAST_RECOVERY", "REPLAN_ROUTE_TURN"]) {
      const r = await evaluate(id, { streak: 60 })
      assert.equal(r.unlocked, false, id)
      assert.equal(r.currentValue, 0)
      assert.equal(/recuperada/i.test(r.progressText), false)
    }
  })
})

describe("Conquistas — cobertura do edital usa o total real de tópicos", () => {
  it("40 tópicos digitados NÃO são mais '100% do edital'", async () => {
    const r = await evaluate("COVERAGE_100_PCT", { distinctTopicsStudied: 40 })
    assert.equal(r.unlocked, false)
    assert.equal(r.currentValue, 0)
    assert.match(r.progressText, /Sem edital/)
  })

  it("percentual = tópicos estudados ÷ tópicos do edital, e muda com a entrada", async () => {
    const a = await evaluate("COVERAGE_25_PCT", { editalTopicsTotal: 200, editalTopicsStudied: 49 })
    assert.equal(a.currentValue, 25)
    assert.equal(a.unlocked, true)
    const b = await evaluate("COVERAGE_50_PCT", { editalTopicsTotal: 200, editalTopicsStudied: 49 })
    assert.equal(b.currentValue, 25)
    assert.equal(b.unlocked, false)
    const c = await evaluate("COVERAGE_50_PCT", { editalTopicsTotal: 200, editalTopicsStudied: 100 })
    assert.equal(c.unlocked, true)
  })
})

describe("Conquistas — PLAN_MASTER_4_WEEKS sem progresso inventado", () => {
  it("aderência alta sem sequência não vira '1 de 4 semanas'", async () => {
    const r = await evaluate("PLAN_MASTER_4_WEEKS", { adherencePercentage: 100, streak: 3 })
    assert.equal(r.currentValue, 0)
    assert.equal(r.unlocked, false)
  })
  it("progresso = semanas completas de estudo diário; desbloqueia com 28 dias + aderência ≥ 90", async () => {
    assert.equal((await evaluate("PLAN_MASTER_4_WEEKS", { adherencePercentage: 100, streak: 15 })).currentValue, 2)
    const done = await evaluate("PLAN_MASTER_4_WEEKS", { adherencePercentage: 95, streak: 28 })
    assert.equal(done.unlocked, true)
    assert.equal(done.currentValue, 4)
  })
})

describe("Conquistas — consultas usam as colunas reais do banco", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/application/achievements/achievements.action.ts"), "utf-8")
  it("question_attempts.correct (não is_correct) e simulados.total_questions/score_percentage", () => {
    assert.ok(src.includes('.from("question_attempts").select("correct"'))
    assert.equal(/is_correct/.test(src.replace(/\/\/.*$/gm, "")), false)
    assert.ok(src.includes('.select("id, total_questions, total_correct, score_percentage")'))
    assert.equal(/pontuacao|total_questoes/.test(src.replace(/\/\/.*$/gm, "")), false)
  })
})
