// ============================================================================
// Fase I.6 — achados M1 e M2: o Mentor não produz nem persiste número inventado.
//
// M1: existia um "Global Score" (IGA) que era a média de cinco componentes, três
// deles (desempenho, retenção e questões) iguais a `overallAccuracy` — fixa em 0
// no IntelligenceHub —, com `trend: "STABLE"` e `confidence: 85` fixos. Nada era
// medido, o componente batizado de "retention" não tinha relação com revisões, e
// o conjunto inteiro era gravado em `mentor_history` a cada sessão. A Fase H já
// tinha parado de exibi-lo; agora ele deixou de existir.
//
// M2: a meta semanal começava em 20 horas, então quem nunca configurou meta
// aparecia para o mentor com "20h" — número que o aluno não escolheu.
//
// Testes estáticos onde montar o contexto exigiria Supabase e contexto de
// requisição do Next, e de comportamento onde é possível (o prompt).
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { PromptBuilder } from "@/application/mentor-ai/engine/prompt-builder"
import type { IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

/** Sem comentários: eles citam de propósito o que foi removido. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

const MODELS = "src/domain/mentor-ai/mentor-ai.models.ts"
const TYPES = "src/domain/mentor-ai/mentor-ai.types.ts"
const HUB = "src/application/mentor-ai/hub/intelligence.hub.ts"
const RULE_ENGINE = "src/application/mentor-ai/engine/rule-engine.ts"
const PROVIDER = "src/application/mentor-ai/providers/heuristic.provider.ts"
const PROMPT = "src/application/mentor-ai/engine/prompt-builder.ts"
const HISTORY = "src/application/mentor-ai/history/mentor-history.service.ts"
const SERVICE = "src/application/mentor-ai/mentor-ai.service.ts"

/** Contexto mínimo e fixo — o tipo já não tem onde encaixar número inventado. */
function contextWithoutGoal(): IntelligenceContext {
  return {
    version: "1.0.0",
    generatedAt: new Date("2026-03-10T15:00:00.000Z"),
    snapshotId: "snap-1",
    userId: "aluno-1",
    studyHistory: {
      totalMinutes: 120,
      averageEnergy: 4,
      averageFocus: 4,
      daysStudied: 3,
      streak: 2,
    },
    goals: { weeklyHoursTarget: null },
  }
}

describe("M1 — nenhum score inventado existe ou é persistido", () => {
  it("o tipo GlobalScore não existe mais no domínio", () => {
    const models = code(MODELS)
    assert.equal(/interface GlobalScore/.test(models), false)
    assert.equal(/confidence\s*:/.test(models), false, "nenhuma 'confiança' no contrato")
    assert.equal(/trend\s*:/.test(models), false, "nenhuma 'tendência' no contrato")
  })

  it("a resposta do Mentor não carrega score", () => {
    const types = code(TYPES)
    assert.equal(types.includes("GlobalScore"), false)
    assert.equal(types.includes("globalScore"), false)
  })

  it("o RuleEngine não compõe score nenhum", () => {
    const src = code(RULE_ENGINE)
    assert.equal(src.includes("calculateGlobalScore"), false)
    assert.equal(/trend:\s*"STABLE"/.test(src), false)
    assert.equal(/confidence:\s*85/.test(src), false)
    assert.equal(/grade\s*=/.test(src), false, "nenhuma nota A/B/C/D derivada de score falso")
    assert.match(src, /insights: Insight\[\]/, "o que sobra são os insights reais")
  })

  it("o provider devolve só feed e insights", () => {
    const src = code(PROVIDER)
    assert.equal(src.includes("globalScore"), false)
    assert.match(src, /rawInsights/)
  })

  it("o bloco de desempenho (acurácia fixa em 0) saiu do contexto e do hub", () => {
    assert.equal(/performance\s*:\s*\{/.test(code(MODELS)), false)
    assert.equal(/performance\s*:\s*\{/.test(code(HUB)), false)
    assert.equal(code(HUB).includes("overallAccuracy"), false)
  })

  it("o prompt não afirma acurácia nem \"pior disciplina\"", () => {
    const src = code(PROMPT)
    assert.equal(src.includes("context.performance"), false)
    assert.equal(src.includes("Acurácia Geral"), false)
    assert.equal(src.includes("Pior Disciplina"), false)
  })

  it("o prompt montado de um contexto real só contém o que foi medido", () => {
    const context = contextWithoutGoal()
    const human = PromptBuilder.buildHuman(context)

    assert.match(human, /Minutos na semana: 120/)
    assert.match(human, /Ofensiva: 2 dias/)
    assert.equal(/Acurácia/i.test(human), false)
    assert.equal(/undefined/.test(human), false, "nenhum placeholder interpolado")
    assert.equal(/\b0%/.test(human), false, "nenhum zero apresentado como medição")

    const llm = PromptBuilder.buildLLM(context)
    const parsed = JSON.parse(llm) as Record<string, unknown>
    assert.deepEqual(Object.keys(parsed).sort(), ["ctxId", "std"], "só contexto e estudo medido")
  })

  it("o histórico do Mentor grava a resposta, que já não tem score", () => {
    const history = code(HISTORY)
    assert.match(history, /response: params\.response/, "o que é gravado é a resposta")
    assert.equal(history.includes("globalScore"), false)
    // E o serviço não monta nenhum campo extra de score para o log.
    assert.equal(code(SERVICE).includes("globalScore"), false)
  })

  it("o resumo de sessão não carrega mais IGA", () => {
    const models = code("src/application/study-session/study-session.models.ts")
    assert.equal(models.includes("igaBefore"), false)
    assert.equal(models.includes("igaAfter"), false)
    const orchestrator = code("src/application/study-session/session-orchestrator.ts")
    assert.equal(orchestrator.includes("igaAfter"), false)
    assert.equal(orchestrator.includes("globalScore"), false)
    // E a homologação não valida um índice que não existe.
    assert.equal(code("src/application/testing/homologation.service.ts").includes("igaAfter"), false)
  })
})

describe("M2 — meta semanal ausente continua ausente", () => {
  it("o hub não tem meta inicial inventada", () => {
    const src = code(HUB)
    assert.equal(/weeklyHoursTarget\s*=\s*20/.test(src), false)
    assert.equal(/weeklyHoursTarget\s*=\s*10/.test(src), false)
    assert.equal(/weeklyHoursTarget\s*=\s*0\b/.test(src), false, "0 também não é substituto semântico")
    assert.match(src, /let weeklyHoursTarget: number \| null = null/)
  })

  it("o contrato aceita ausência de meta", () => {
    assert.match(read(MODELS), /weeklyHoursTarget: number \| null/)
  })

  it("a meta real do perfil continua sendo usada quando existe", () => {
    const src = code(HUB)
    assert.match(src, /profile\?\.weekly_study_hours && profile\.weekly_study_hours > 0/)
    assert.match(src, /weeklyHoursTarget = profile\.weekly_study_hours/)
  })

  it("o prompt não inventa \"meta semanal\" (ele não fala de meta)", () => {
    const human = PromptBuilder.buildHuman(contextWithoutGoal())
    assert.equal(/meta/i.test(human), false)
    assert.equal(/20h|20 h|20 horas/.test(human), false)
  })
})
