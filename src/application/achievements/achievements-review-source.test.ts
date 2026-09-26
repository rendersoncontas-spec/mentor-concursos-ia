// ============================================================================
// Fase I.6 — achado M7: as Conquistas contam revisões de UMA fonte só.
//
// O que existia: quando `review_history` estava vazio, sessões de estudo com
// `study_type = "REVISAO"` passavam a ser contadas como "revisões concluídas".
// São duas semânticas diferentes — o aluno registrando que estudou revisando, e
// uma resposta de revisão no motor de repetição espaçada — e a base do número
// mudava sozinha na primeira resposta real.
//
// Fonte canônica: os eventos de `review_history`. O texto da tela passou a dizer
// o que está sendo contado ("revisões respondidas").
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

/** Sem comentários: eles citam de propósito o fallback removido. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

const ACTION = "src/application/achievements/achievements.action.ts"
const VIEW = "src/features/conquistas/components/conquistas-view.tsx"

describe("M7 — fonte canônica das revisões nas Conquistas", () => {
  it("o número vem da contagem de eventos de review_history", () => {
    const src = code(ACTION)
    assert.match(src, /from\("review_history"\)\s*\n?\s*\.select\("id", \{ count: "exact", head: true \}\)/)
    assert.match(src, /reviews: reviewsRes\.count \?\? 0/, "a contagem real do banco")
  })

  it("não existe mais fallback por sessões de estudo com study_type REVISAO", () => {
    const src = code(ACTION)
    assert.equal(
      /study_type === "REVISAO"[\s\S]{0,120}facts\.reviews \+= 1/.test(src),
      false,
      "sessão de estudo não pode voltar a ser contada como revisão respondida",
    )
    assert.equal(
      /facts\.reviews \+= 1/.test(src),
      false,
      "o número não é incrementado por fora da fonte canônica",
    )
  })

  it("o fallback equivalente de simulados (que não é revisão) segue intocado", () => {
    // Prova que a remoção foi cirúrgica: o mesmo padrão para SIMULADO continua
    // como estava, porque não é objeto desta fase.
    const src = code(ACTION)
    assert.match(src, /study_type === "SIMULADO"[\s\S]{0,120}facts\.simulados \+= 1/)
  })

  it("as Conquistas não leem review_items nem inventam contagem", () => {
    const src = read(ACTION)
    assert.equal(src.includes('from("review_items")'), false)
    assert.equal(/reviews:\s*\d/.test(code(ACTION)), false, "nenhuma contagem fixa")
  })
})

describe("M7 — a tela diz o que está sendo contado", () => {
  const view = read(VIEW)

  it("fala de revisões respondidas, não de sessões", () => {
    assert.match(view, /revisões respondidas/)
    assert.match(view, /Você já respondeu/)
    assert.equal(view.includes("Você já concluiu"), false, "\"concluiu\" era ambíguo entre sessão e evento")
  })

  it("a primeira conquista de revisão aponta para onde se responde revisão", () => {
    assert.match(view, /Responda sua primeira revisão na página de Revisões/)
  })
})
