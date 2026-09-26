// ============================================================================
// Fase I.6 — achado M6: o cronômetro de estudo não mexe em revisão.
//
// O que existia: o runner de sessão coletava "Revisões concluídas (tópicos)", o
// número ia para o metadata do estudo (ninguém lia) e o orquestrador chamava
// `logReviewsToEngine` — um stub que apenas escrevia no console. Nenhum item do
// motor de revisões era concluído, mas o campo dava a entender que sim.
//
// Decisão D2 continua valendo: estudo não cria, conclui nem agenda revisão. Este
// teste garante as duas coisas: o campo enganoso não volta e o fluxo de estudo
// segue sem nenhum contato com o motor de revisões.
// ============================================================================

import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

/** Sem comentários: eles citam de propósito o que foi removido. */
function code(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
}

function walkSource(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walkSource(rel))
    else if (/\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

const RUNNER = "src/features/study-session/components/active-session-runner.tsx"
const PROVIDER = "src/features/study-session/components/study-provider.tsx"
const ORCHESTRATOR = "src/application/study-session/session-orchestrator.ts"
const ACTION = "src/application/study-session/study-session.action.ts"
const MODELS = "src/application/study-session/study-session.models.ts"

describe("M6 — o campo enganoso de revisões saiu do cronômetro", () => {
  it("o runner não tem mais campo de revisões concluídas", () => {
    const src = code(RUNNER)
    assert.equal(src.includes("reviews-completed"), false, "o input não pode voltar")
    assert.equal(src.includes("Revisões concluídas"), false)
    assert.equal(/setReviews|\[reviews,/.test(src), false, "nem o estado que o alimentava")
  })

  it("nada no fluxo de estudo envia ou grava a anotação", () => {
    for (const file of [RUNNER, PROVIDER, ACTION, MODELS, ORCHESTRATOR]) {
      const src = code(file)
      assert.equal(src.includes("reviews_completed"), false, `${file} não pode enviar/gravar a anotação`)
      assert.equal(src.includes("reviewsCompleted"), false, `${file} não pode carregar a contagem`)
    }
  })

  it("o stub que fingia concluir revisões não existe mais", () => {
    const src = code(ORCHESTRATOR)
    assert.equal(src.includes("logReviewsToEngine"), false)
    assert.equal(/ReviewEngine/.test(src), false, "nenhuma delegação ao motor de revisões")
  })
})

describe("M6 — D2 continua de pé: estudo não toca no motor de revisões", () => {
  it("nenhum arquivo do fluxo de estudo escreve nas tabelas de revisão", () => {
    for (const file of [RUNNER, PROVIDER, ACTION, MODELS, ORCHESTRATOR]) {
      const src = read(file)
      for (const table of ["review_items", "review_history", "review_sessions"]) {
        assert.equal(src.includes(`from("${table}")`), false, `${file} não pode tocar em ${table}`)
      }
    }
  })

  it("nenhum arquivo do fluxo de estudo importa o módulo de revisões", () => {
    for (const file of walkSource("src/application/study-session").concat(
      walkSource("src/features/study-session"),
    )) {
      if (/\.test\.tsx?$/.test(file)) continue
      const src = read(file)
      assert.equal(
        /review-engine\/review\.(service|actions|repository)/.test(src),
        false,
        `${file} não pode chamar o módulo de revisões (D2)`,
      )
    }
  })

  it("o único ponto que grava estudo a partir de revisão continua sendo o próprio módulo de revisões", () => {
    const reviewService = read("src/application/review-engine/review.service.ts")
    assert.match(reviewService, /from\("study_history"\)\s*\.insert\(/, "a revisão grava seu estudo")
    // E o caminho inverso não existe: no código do orquestrador (sem
    // comentários) não sobrou nenhuma menção a revisão.
    assert.equal(/review/i.test(code(ORCHESTRATOR)), false)
  })
})
