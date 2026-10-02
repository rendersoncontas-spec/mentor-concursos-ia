// ============================================================================
// P1.6.2 — persistência de weekly_study_hours no wizard:
// 1-2. normalizeExperienceLevel canônico; 3-5. erro do UPDATE propagado;
// 6. geração intacta quando o UPDATE funciona (+ INTERMEDIATE/ADVANCED).
// Parte pura via import direto; parte wiring por inspeção de fonte.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it, test } from "node:test"

import { normalizeExperienceLevel } from "./planning-preferences.ts"

const src = readFileSync(
  "src/application/study-plan/generate-study-plan.action.ts",
  "utf8",
)

test("P1.6.2-1 iniciante/ausência vira BEGINNER (nunca 'iniciante')", () => {
  assert.equal(normalizeExperienceLevel(undefined), "BEGINNER")
  assert.equal(normalizeExperienceLevel("iniciante"), "BEGINNER")
  assert.equal(normalizeExperienceLevel("qualquer-coisa"), "BEGINNER")
})

test("P1.6.2-6 INTERMEDIATE e ADVANCED continuam compatíveis (canônico + PT)", () => {
  assert.equal(normalizeExperienceLevel("INTERMEDIATE"), "INTERMEDIATE")
  assert.equal(normalizeExperienceLevel("ADVANCED"), "ADVANCED")
  assert.equal(normalizeExperienceLevel("intermediário"), "INTERMEDIATE")
  assert.equal(normalizeExperienceLevel("avancado"), "ADVANCED")
})

describe("P1.6.2-2/3/5 UPDATE com weekly_hours e erro propagado", () => {
  it("update inclui weekly_study_hours junto do nível canônico", () => {
    assert.match(src, /weekly_study_hours: targetWeeklyHours/)
    assert.match(src, /experience_level: normalizeExperienceLevel\(config\.nivel\)/)
    assert.doesNotMatch(src, /"iniciante"/)
  })

  // G1.3 (G-21): o UPDATE direto de profile na action foi absorvido pela
  // RPC atômica — falha de profile/plano agora é falha da transação inteira
  // ("Nenhum dado foi alterado"), sem meio-plano. Invariante preservada.
  it("erro de persistência retorna falha identificável sem criar plano", () => {
    assert.match(src, /persistStudyPlanDraftAtomic\(/)
    assert.match(src, /if \(!persisted\)/)
    assert.match(src, /Nenhum dado foi alterado/)
  })

  it("nenhum catch silencioso esconde o erro do UPDATE", () => {
    assert.doesNotMatch(src, /\.catch\(\(\) => (null|undefined|\{\})\)/)
  })
})
