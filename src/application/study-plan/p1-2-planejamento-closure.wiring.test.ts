// ============================================================================
// P1.2 — FECHAMENTO DO PLANEJAMENTO (wiring: semântica + capacidade + concorrência).
// Por inspeção de fonte, no padrão dos wiring tests do repo.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const service = readFileSync(
  "src/application/study-plan/replan/adaptive-replan.service.ts",
  "utf8",
)
const card = readFileSync(
  "src/features/planejamento/components/planning-goals-progress-card.tsx",
  "utf8",
)
const daily = readFileSync(
  "src/features/planejamento/components/daily-planning-view.tsx",
  "utf8",
)
const wizard = readFileSync(
  "src/features/planejamento/components/planning-wizard-modal.tsx",
  "utf8",
)
const form = readFileSync(
  "src/features/planejamento/lib/planning-form.ts",
  "utf8",
)
const gen = readFileSync(
  "src/application/study-plan/study-plan.service.ts",
  "utf8",
)

describe("P1.2 — goalSource configured/suggested chega à UI", () => {
  it("PeriodGoalData declara goalSource e o serviço preenche nos dois ramos", () => {
    assert.match(service, /goalSource: "configured" \| "suggested"/)
    assert.match(service, /const goalSource/)
    assert.match(service, /goalMinutes,\s*\n\s*goalSource,/)
  })

  it("card de metas rotula 'Meta sugerida' quando suggested", () => {
    assert.match(card, /Meta sugerida/)
    assert.match(card, /goalSource === "suggested"/)
  })

  it("métrica diária rotula 'Meta sugerida' quando suggested", () => {
    assert.match(daily, /Meta sugerida/)
  })
})

describe("P1.2 — DAILY_STUDY_CAP_HOURS é heurística, nunca capacidade pessoal", () => {
  it("constante documentada como heurística interna", () => {
    assert.match(form, /HEURÍSTICA INTERNA/)
    assert.match(form, /Nunca exibir como/)
  })

  it("wizard não apresenta 3h como capacidade/disponibilidade pessoal", () => {
    assert.doesNotMatch(wizard, /sua capacidade/i)
    assert.doesNotMatch(wizard, /sua disponibilidade estimada/i)
    assert.doesNotMatch(wizard, /ultrapassa a disponibilidade/i)
    assert.match(wizard, /estimativa/i)
  })
})

describe("P1.2 — concorrência: sem dois ACTIVE após corrida de criação", () => {
  // G1.3/G1.4: a "cura otimista" em código (.neq) foi substituída por
  // atomicidade real — persistência só via RPC transacional + índice único
  // parcial (migration g14). A invariante (nunca 2 ACTIVE) ficou MAIS forte.
  it("geração persiste só via RPC atômica (sem insert direto de plano)", () => {
    const start = gen.indexOf("export async function generateStudyPlan(")
    const end = gen.indexOf("export async function getActiveStudyPlan(")
    const fn = gen.slice(start, end === -1 ? gen.length : end)
    assert.match(fn, /persistStudyPlanDraftAtomic\(/)
    assert.doesNotMatch(fn, /\.from\("study_plans"\)/)
  })

  it("índice único + archive-first garantem 1 ACTIVE (migration g14)", () => {
    const g14 = readFileSync(
      "supabase/migrations/20260929_g14_single_active_plan.sql",
      "utf8",
    )
    assert.match(g14, /uq_study_plans_single_active/)
    assert.match(g14, /WHERE active IS TRUE/)
  })

  it("nenhum study_history é criado pelo planejamento (só leitura)", () => {
    assert.doesNotMatch(gen, /\.from\("study_history"\)\s*\n\s*\.insert/)
    assert.doesNotMatch(service, /\.from\("study_history"\)\s*\n\s*\.insert/)
  })
})
