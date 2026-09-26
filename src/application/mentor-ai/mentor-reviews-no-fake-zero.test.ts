// ============================================================================
// Fase I.3 — o Mentor não recebe número inventado de revisão.
//
// O que existia: o IntelligenceHub montava um bloco de revisões com zeros fixos
// (atrasadas, atrasadas críticas e itens do dia), sem nenhuma consulta por trás,
// e o PromptBuilder mandava isso ao mentor como "Atrasadas Críticas: 0" — ou
// seja, com a fila de revisões cheia, o mentor lia zero.
//
// Correção: o bloco saiu do contrato (IntelligenceContext), do hub e do prompt.
// As revisões continuam concentradas na própria área (decisão D6) e o mentor
// simplesmente não fala delas, em vez de falar com dado falso.
//
// Este teste é estático de propósito: montar o contexto de verdade exige
// Supabase e contexto de requisição do Next. O que precisa ser travado aqui é a
// ausência do dado inventado, e isso se lê no código-fonte.
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

const HUB = "src/application/mentor-ai/hub/intelligence.hub.ts"
const PROMPT = "src/application/mentor-ai/engine/prompt-builder.ts"
const MODELS = "src/domain/mentor-ai/mentor-ai.models.ts"

describe("Mentor AI — nenhum zero inventado de revisão", () => {
  it("o hub não monta bloco de revisão com zeros fixos", () => {
    const src = code(HUB)
    for (const field of ["totalOverdue", "criticalOverdue", "itemsToReviewToday"]) {
      assert.equal(src.includes(field), false, `${field} não pode voltar como valor fixo no hub`)
    }
    assert.equal(/reviews\s*:\s*\{/.test(src), false, "o hub não pode devolver um bloco reviews inventado")
  })

  it("o contrato do contexto não exige campos de revisão sem fonte", () => {
    const src = code(MODELS)
    for (const field of ["totalOverdue", "criticalOverdue", "itemsToReviewToday"]) {
      assert.equal(src.includes(field), false, `${field} não pode voltar ao IntelligenceContext sem consulta real`)
    }
  })

  it("o prompt do mentor não menciona número de revisão", () => {
    const src = code(PROMPT)
    assert.equal(src.includes("context.reviews"), false)
    assert.equal(/Atrasadas Críticas/.test(src), false)
    assert.equal(/rev:\s*context/.test(src), false)
  })

  it("nenhum zero fixo de revisão sobrou em qualquer arquivo do mentor", () => {
    for (const file of [HUB, PROMPT, MODELS]) {
      const src = code(file)
      assert.equal(/totalOverdue\s*:\s*0/.test(src), false, file)
      assert.equal(/criticalOverdue\s*:\s*0/.test(src), false, file)
      assert.equal(/itemsToReviewToday\s*:\s*0/.test(src), false, file)
    }
  })

  it("o mentor NÃO passou a consultar as tabelas de revisão só para preencher prompt (D6)", () => {
    const src = read(HUB)
    for (const table of ["review_items", "review_history", "review_sessions"]) {
      assert.equal(src.includes(table), false, `o hub não pode consultar ${table}`)
    }
  })

  it("o prompt montado a partir de um contexto real não contém texto de revisão", () => {
    // Contexto mínimo e fixo — o tipo já não tem onde encaixar número de revisão.
    const context: IntelligenceContext = {
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

    const human = PromptBuilder.buildHuman(context)
    assert.equal(/Revis/i.test(human), false, "o texto do prompt não fala de revisões")
    assert.equal(human.includes("Atrasadas"), false)

    const llm = PromptBuilder.buildLLM(context)
    assert.equal(llm.includes("rev"), false, "o JSON compacto não carrega bloco de revisão")
    assert.equal(llm.includes("perf"), false, "nem bloco de desempenho (Fase I.6, M1)")
  })
})
