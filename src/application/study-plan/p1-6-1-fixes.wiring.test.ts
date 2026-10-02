// ============================================================================
// P1.6.1 — os 2 achados da validação ao vivo:
// A/B: wizard mostra erro persistente e acionável quando a geração falha;
// C–G: first-day-of-week canônico (banco vence, fallback preservado).
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const wizard = readFileSync(
  "src/features/planejamento/components/planning-wizard-modal.tsx",
  "utf8",
)
const genAction = readFileSync(
  "src/application/study-plan/generate-study-plan.action.ts",
  "utf8",
)
const prefsAction = readFileSync(
  "src/application/study-plan/planning-preferences.action.ts",
  "utf8",
)
const weekly = readFileSync(
  "src/features/planejamento/components/weekly-planning-view.tsx",
  "utf8",
)
const weeklyPlanner = readFileSync(
  "src/application/study-plan/weekly-planner.service.ts",
  "utf8",
)
const replanService = readFileSync(
  "src/application/study-plan/replan/adaptive-replan.service.ts",
  "utf8",
)

describe("P1.6.1-A/B wizard sem pré-requisito: erro visível, nenhum plano", () => {
  it("wizard guarda o erro em estado e mostra painel persistente com retry", () => {
    assert.match(wizard, /const \[saveError, setSaveError\]/)
    assert.match(wizard, /Tentar novamente/)
    assert.match(wizard, /Não foi possível gerar o planejamento/)
  })

  it("wizard usa a causa real da aplicação e trava duplo clique", () => {
    assert.match(wizard, /setSaveError\(message\)/)
    assert.match(wizard, /if \(isSaving\) return/)
  })

  it("sem concurso ativo a action retorna antes de qualquer insert", () => {
    const noTargetIdx = genAction.indexOf("Nenhum concurso ativo")
    const firstInsertIdx = genAction.indexOf(".insert(")
    assert.ok(noTargetIdx > 0 && firstInsertIdx > noTargetIdx)
  })
})

describe("P1.6.1-C/D banco week_start_day vence na agenda", () => {
  it("action resolve pelo canônico resolveWeekStartDay com fonte explícita", () => {
    assert.match(prefsAction, /resolveWeekStartDay\(/)
    assert.match(prefsAction, /weekStartDaySource/)
  })

  it("agenda aplica o valor do servidor quando configurado", () => {
    assert.match(weekly, /weekStartDaySource !== "configured"/)
    assert.match(weekly, /Segunda-feira/)
  })
})

describe("P1.6.1-E/F fallback preservado sem configuração", () => {
  it("agenda mantém legado local e default Domingo quando banco é default", () => {
    assert.match(weekly, /mentor_user_first_day_of_week/)
    assert.match(weekly, /return "Domingo"/)
  })

  it("ausência real no banco cai em default (nunca erro)", () => {
    assert.match(prefsAction, /"configured"[\s\S]{0,60}:\s*"default"/)
  })
})

describe("P1.6.1-G mesmo resolver em planejamento, agenda e replan", () => {
  it("weekly-planner, replan service e prefs action usam resolveWeekStartDay", () => {
    assert.match(weeklyPlanner, /resolveWeekStartDay\(/)
    assert.match(replanService, /resolveWeekStartDay\(/)
    assert.match(prefsAction, /resolveWeekStartDay\(/)
  })
})
