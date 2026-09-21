import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" (verificacao estatica do codigo-fonte) para a
 * invalidacao do cache de /estatisticas apos finalizeSession, adicionada no
 * QA funcional de 2026-09.
 *
 * Contexto do bug encontrado: finalizeSession() (review-engine) grava uma
 * linha real em study_history (study_source: "REVIEW") sempre que uma
 * sessao de revisao com pelo menos uma resposta e concluida. Toda outra
 * rotina que muta study_history (ver study-history.actions.ts e
 * import-history.actions.ts) chama invalidateStatisticsCenterCache() logo
 * em seguida, porque getStatisticsCenterAction() (usado por /estatisticas)
 * mantem um cache em memoria de 5 minutos que so e limpo por essa chamada
 * explicita - revalidatePath() do Next NAO o invalida. finalizeSession()
 * era a unica rotina de mutacao real de study_history que nao fazia essa
 * chamada: apos concluir uma revisao, o Historico e o Ciclo ja refletiam o
 * estudo correto, mas /estatisticas podia ficar ate 5 minutos com o tempo
 * de estudo da revisao ausente.
 *
 * Por que teste estatico e nao renderizado/integrado: mesmo motivo
 * documentado em study-provider-context-split.wiring.test.ts (projeto nao
 * tem infraestrutura de testes com Supabase real nem de renderizacao React;
 * os testes de service usam node:test puro).
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

const SERVICE_PATH = "src/application/review-engine/review.service.ts"

describe("finalizeSession: invalidacao do cache de estatisticas apos gravar study_history", () => {
  it("importa invalidateStatisticsCenterCache do modulo de estatisticas", () => {
    const source = readSource(SERVICE_PATH)
    assert.ok(
      /import\s*\{\s*invalidateStatisticsCenterCache\s*\}\s*from\s*"@\/application\/study-analytics\/statistics-center\.action"/.test(
        source,
      ),
      "deve importar invalidateStatisticsCenterCache de @/application/study-analytics/statistics-center.action",
    )
  })

  it("chama invalidateStatisticsCenterCache(userId) apos o insert bem-sucedido em study_history", () => {
    const source = readSource(SERVICE_PATH)
    const fnStart = source.indexOf("export async function finalizeSession")
    assert.ok(fnStart !== -1, "finalizeSession deve existir")
    const fnEnd = source.indexOf("\nexport async function", fnStart + 1)
    const fnBody = source.slice(fnStart, fnEnd === -1 ? source.length : fnEnd)

    // Precisa estar dentro do bloco "if (!historyError)" (so quando o insert
    // realmente aconteceu), nao incondicionalmente antes dele.
    const guardIdx = fnBody.indexOf("if (!historyError)")
    assert.ok(guardIdx !== -1, "deve existir a guarda if (!historyError)")
    const afterGuard = fnBody.slice(guardIdx)

    assert.ok(
      /await invalidateStatisticsCenterCache\(userId\)/.test(afterGuard),
      "deve chamar await invalidateStatisticsCenterCache(userId) dentro do bloco if (!historyError)",
    )
  })

  it("mantem a reconciliacao do ciclo e passa a revalidar HISTORY_PATHS (fonte unica) em vez de uma lista propria parcial", () => {
    const source = readSource(SERVICE_PATH)

    assert.ok(
      /import\s*\{\s*HISTORY_PATHS\s*\}\s*from\s*"@\/application\/study-history\/study-history\.constants"/.test(
        source,
      ),
      "deve importar HISTORY_PATHS de @/application/study-history/study-history.constants",
    )

    const fnStart = source.indexOf("export async function finalizeSession")
    const fnEnd = source.indexOf("\nexport async function", fnStart + 1)
    const fnBody = source.slice(fnStart, fnEnd === -1 ? source.length : fnEnd)

    assert.ok(fnBody.includes('await registerStudyToCycle()'), "deve continuar reconciliando o ciclo")
    assert.ok(
      /for\s*\(const path of HISTORY_PATHS\)\s*revalidatePath\(path\)/.test(fnBody),
      "deve revalidar todas as rotas de HISTORY_PATHS (nao so /ciclos, /dashboard, /dashboard/history), " +
        "para cobrir tambem o auto-finalize ao responder o ultimo card (answerReviewCard), que nao " +
        "passa por finalizeReviewSessionAction",
    )
  })
})
