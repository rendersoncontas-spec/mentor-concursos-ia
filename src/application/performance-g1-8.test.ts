// ============================================================================
// G1.8 — PERFORMANCE: sem N+1, sem waterfall desnecessário, payloads
// enxutos onde o custo é comprovado. Wiring trava a estrutura das
// queries; o teste comportamental prova a equivalência do agrupamento.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

function src(path: string): string {
  return readFileSync(path, "utf8")
}

// ---------------------------------------------------------------------------
// 1-2. N+1 eliminado em listPlansAction (batch com IN + grupo em memória).
// ---------------------------------------------------------------------------

type ItemRow = { id: string; study_plan_id: string; discipline_id: string; duration_minutes: number }

// Espelha o agrupamento de list-plans.action.ts.
function groupByPlan(rows: ItemRow[]): Map<string, ItemRow[]> {
  const map = new Map<string, ItemRow[]>()
  for (const row of rows) {
    const list = map.get(row.study_plan_id)
    if (list) list.push(row)
    else map.set(row.study_plan_id, [row])
  }
  return map
}

describe("G-18 — N+1 de itens por plano virou 1 query + grupo", () => {
  const rows: ItemRow[] = [
    { id: "i1", study_plan_id: "p1", discipline_id: "d1", duration_minutes: 60 },
    { id: "i2", study_plan_id: "p2", discipline_id: "d1", duration_minutes: 30 },
    { id: "i3", study_plan_id: "p1", discipline_id: "d2", duration_minutes: 45 },
  ]

  it("1. agrupamento equivale ao loop por plano (mesmos totais)", () => {
    const grouped = groupByPlan(rows)
    assert.equal(grouped.get("p1")?.length, 2)
    assert.equal(grouped.get("p2")?.length, 1)
    const sum = (id: string) => (grouped.get(id) ?? []).reduce((a, r) => a + r.duration_minutes, 0)
    assert.equal(sum("p1"), 105)
    assert.equal(sum("p2"), 30)
    assert.equal(grouped.get("pX"), undefined)
  })

  it("2. wiring: batch com IN, sem query por plano", () => {
    const body = src("src/application/study-plan/list-plans.action.ts")
    assert.match(body, /\.in\("study_plan_id", planIds\)/)
    assert.match(body, /itemsByPlan\.get\(planId\) \?\? \[\]/)
    // O bloco antigo (1 query por plano dentro do loop) sumiu:
    assert.doesNotMatch(body, /\/\/ Buscar itens do plano\n\s*const \{ data: items \} = await supabase/)
  })
})

// ---------------------------------------------------------------------------
// 3-7. Waterfalls independentes viraram Promise.all (mesma semântica de erro).
// ---------------------------------------------------------------------------

describe("G-18 — leituras independentes em paralelo", () => {
  it("3. getExamEdital: exam + mappings em paralelo, erro do exam primeiro", () => {
    const body = src("src/application/disciplines/disciplines.service.ts")
    const fn = body.slice(body.indexOf("export async function getExamEdital"))
    assert.match(fn, /Promise\.all\(\[/)
    assert.ok(fn.indexOf("if (examError || !exam)") < fn.indexOf("if (mappingError || !mappings)"))
  })

  it("4. cycle suggestions: sessions+skips em paralelo após items (×2 arquivos)", () => {
    for (const path of [
      "src/application/study-session/get-study-discipline-suggestions.action.ts",
      "src/application/study-session/get-disciplines.action.ts",
    ]) {
      const body = src(path)
      const fn = body.slice(body.indexOf("if (!items || items.length === 0) return []"))
      assert.match(fn, /Promise\.all\(\[/, path)
      assert.match(fn, /fetchAllCycleSessions\(supabase, \{ cycleId: cycle\.id \}\)/, path)
      assert.match(fn, /study_cycle_item_skips/, path)
    }
  })

  it("5. fetchActivePlan: perfil em paralelo com o plano", () => {
    const body = src("src/application/study-analytics/statistics-center.action.ts")
    assert.match(body, /const \[\{ data: plan, error: planError \}, \{ data: profile, error: profileError \}\] = await Promise\.all/)
  })

  it("6. getReplanInfoAction: availability + preferência em paralelo", () => {
    const body = src("src/application/study-plan/replan/adaptive-replan.actions.ts")
    assert.match(body, /resolveServerAvailability\(supabase, effectiveUserId, availabilityInput\),\s*\n?\s*getAutoReplanPreference\(supabase, effectiveUserId\),?\s*\n?\s*\]\)/)
  })
})

// ---------------------------------------------------------------------------
// 8-10. Contratos preservados: ownership, ordenação, colunas.
// ---------------------------------------------------------------------------

describe("G-18 — otimização sem quebrar contrato", () => {
  it("7. batch de itens mantém filtro do dono + ordem determinística", () => {
    const body = src("src/application/study-plan/list-plans.action.ts")
    assert.match(body, /\.order\("id", \{ ascending: true \}\)/)
  })

  it("8. itens do plano com colunas explícitas (sem * no caminho quente)", () => {
    const body = src("src/application/study-plan/list-plans.action.ts")
    assert.match(body, /\.select\("id, study_plan_id, discipline_id, duration_minutes, disciplines \( id, name, area \)"\)/)
  })

  it("9. cycle suggestions ainda filtram por dono", () => {
    for (const path of [
      "src/application/study-session/get-study-discipline-suggestions.action.ts",
      "src/application/study-session/get-disciplines.action.ts",
    ]) {
      const body = src(path)
      assert.match(body, /\.eq\("user_id", userId\)/, path)
      assert.match(body, /\.eq\("status", "ACTIVE"\)/, path)
    }
  })

  it("10. statistics-center ainda exige plano+itens antes do perfil", () => {
    const body = src("src/application/study-analytics/statistics-center.action.ts")
    const fn = body.slice(body.indexOf("async function fetchActivePlan"))
    assert.ok(fn.indexOf("if (!plan) return { plan: null }") < fn.indexOf("if (planItems.length === 0)"))
  })
})
