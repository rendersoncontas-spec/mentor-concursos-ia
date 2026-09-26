// ============================================================================
// P1.5 — consolidação (wiring por inspeção de fonte):
// banco vence local / sem falsa persistência min-max-style-custom /
// replan com config resolvida / views sincronizam / update cirúrgico.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const saveAction = readFileSync(
  "src/application/study-plan/planning-preferences.action.ts",
  "utf8",
)
const replanActions = readFileSync(
  "src/application/study-plan/replan/adaptive-replan.actions.ts",
  "utf8",
)
const wizard = readFileSync(
  "src/features/planejamento/components/planning-wizard-modal.tsx",
  "utf8",
)
const weekly = readFileSync(
  "src/features/planejamento/components/weekly-planning-view.tsx",
  "utf8",
)
const daily = readFileSync(
  "src/features/planejamento/components/daily-planning-view.tsx",
  "utf8",
)
const calendar = readFileSync(
  "src/features/planejamento/components/study-calendar-view.tsx",
  "utf8",
)

describe("P1.5.5 banco vence localStorage; update cirúrgico", () => {
  it("save action só atualiza as 4 colunas, escopado ao usuário efetivo", () => {
    assert.match(saveAction, /updateData\["work_scale"\]/)
    assert.match(saveAction, /updateData\["first_shift_day"\]/)
    assert.match(saveAction, /updateData\["shift_anchor_date"\]/)
    assert.match(saveAction, /updateData\["study_days"\]/)
    assert.match(saveAction, /\.eq\("id", effectiveUserId\)/)
    assert.doesNotMatch(saveAction, /updateData\["weekly_study_hours"\]/)
  })

  it("resolveServerAvailability: input válido > banco > default", () => {
    assert.match(saveAction, /inputMode \?\? dbMode \?\? DEFAULT_AVAILABILITY/)
  })
})

describe("P1.5.13 sessão min/max/style sem falsa persistência", () => {
  it("wizard não grava mais min/max/style/custom_scale no localStorage", () => {
    assert.doesNotMatch(wizard, /setItem\(LS_MIN_MIN/)
    assert.doesNotMatch(wizard, /setItem\(LS_MAX_MIN/)
    assert.doesNotMatch(wizard, /setItem\(LS_STYLE/)
    assert.doesNotMatch(wizard, /setItem\(\s*LS_CUSTOM_SCALE/)
  })

  it("wizard persiste preferências validadas no banco ao salvar", () => {
    assert.match(wizard, /savePlanningPreferencesAction\(/)
  })

  it("wizard carrega banco primeiro e sinaliza valor sugerido", () => {
    assert.match(wizard, /getPlanningPreferencesAction\(/)
    assert.match(wizard, /Valor sugerido/)
  })
})

describe("P1.5.14/15 replan usa configuração resolvida e validada", () => {
  it("as 3 actions resolvem disponibilidade no servidor", () => {
    const uses = replanActions.match(/resolveServerAvailability\(supabase, effectiveUserId/g) ?? []
    assert.equal(uses.length, 3)
  })
})

describe("P1.5.14 views sincronizam com o servidor (não só local)", () => {
  it("weekly, daily e calendar chamam o sync servidor-primeiro", () => {
    for (const [name, src] of [
      ["weekly", weekly],
      ["daily", daily],
      ["calendar", calendar],
    ] as const) {
      assert.match(src, /syncPlanningPreferencesFromServer\(\)/, name)
    }
  })
})
