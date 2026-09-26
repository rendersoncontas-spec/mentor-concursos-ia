import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" (verificação estática do código-fonte) para as
 * otimizações de performance da Fase de Estabilização (redução de queries
 * redundantes / N+1). Seguem o mesmo padrão de
 * study-history.cycle-sync.wiring.test.ts: em vez de mockar o Supabase,
 * verificam diretamente no texto-fonte que o padrão de query esperado
 * (ou o padrão problemático removido) está presente/ausente.
 *
 * Isso garante que uma futura edição não reintroduza silenciosamente a
 * query duplicada ou o loop N+1 que foi corrigido aqui.
 */

function readSource(relativePath: string): string {
  const fullPath = path.join(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, "utf-8")
}

/**
 * Extrai o corpo de uma função top-level exportada, do início da assinatura
 * até a próxima declaração `export ` que começa em coluna 0 (ou o fim do
 * arquivo). Suficiente para os arquivos deste módulo, que são organizados
 * como uma sequência de exports de nível superior.
 */
function extractTopLevelExport(source: string, signatureNeedle: string): string {
  const start = source.indexOf(signatureNeedle)
  assert.notEqual(start, -1, `Não encontrou "${signatureNeedle}" no arquivo`)
  const rest = source.slice(start + signatureNeedle.length)
  const nextExportMatch = rest.match(/\n export |\nexport /)
  const end = nextExportMatch ? start + signatureNeedle.length + (nextExportMatch.index ?? rest.length) : source.length
  return source.slice(start, end)
}

describe("Auditoria de performance (queries redundantes / N+1)", () => {
  it("dashboard.service.ts não consulta mais user_dashboard_layouts (query morta/duplicada removida)", () => {
    const source = readSource("src/application/dashboard/dashboard.service.ts")
    assert.equal(
      source.includes("user_dashboard_layouts"),
      false,
      "getDashboardData não deve mais consultar user_dashboard_layouts: o resultado (snapshot.userLayout) não era lido por nenhum consumidor " +
        "e a lista de widgets realmente exibida vem de getDashboardLayoutAction (dashboard-layout.action.ts), que já consulta essa tabela.",
    )
  })

  it("dashboard-layout.action.ts continua sendo a única fonte de user_dashboard_layouts para a página do Dashboard", () => {
    const source = readSource("src/application/dashboard/dashboard-layout.action.ts")
    assert.ok(
      source.includes('.from("user_dashboard_layouts")'),
      "getDashboardLayoutAction deve continuar consultando user_dashboard_layouts normalmente",
    )
  })

  it("a visão geral de Revisões lê review_history uma única vez (a retenção medida não é buscada duas vezes)", () => {
    // Fase I.1: o antigo getReviewDashboardSummary deixou de existir junto com
    // o resumo de revisões do Dashboard; a mesma garantia passou para
    // getReviewsOverview, que é a única leitura da página de Revisões.
    const source = readSource("src/application/review-engine/review.service.ts")
    const fnBody = extractTopLevelExport(source, "export async function getReviewsOverview")
    const matches = fnBody.match(/repo\.recentGrades\(/g) ?? []
    assert.equal(
      matches.length,
      1,
      `getReviewsOverview deve ler o histórico de revisões uma única vez (encontrado ${matches.length}x)`,
    )
    assert.equal(
      source.includes('.from("review_history")'),
      false,
      "o serviço não fala com o banco direto: quem conhece as colunas é review.repository.ts",
    )
  })

  it("listImportsAction não faz uma query de contagem por lote (N+1); usa uma única query agregando em memória", () => {
    const source = readSource("src/application/import-history/import-history.actions.ts")
    const fnBody = extractTopLevelExport(source, "export async function listImportsAction")
    assert.equal(
      /for\s*\([^)]*\)\s*\{[\s\S]*?count:\s*"exact"/.test(fnBody),
      false,
      "Não deve haver uma query de contagem (count: 'exact') dentro de um loop for por lote",
    )
    assert.ok(
      fnBody.includes('.in("import_batch_id", batchIds)'),
      "Deve usar uma única query com .in(\"import_batch_id\", batchIds) para buscar todas as sessões de todos os lotes de uma vez",
    )
  })

  it("generateStudyPlanAction busca disciplinas existentes em lote (.in) em vez de uma query por nome", () => {
    const source = readSource("src/application/study-plan/generate-study-plan.action.ts")
    assert.ok(
      source.includes('.in("name", discNames)'),
      "Deve buscar todas as disciplinas já existentes com .in(\"name\", discNames) numa única query antes do loop",
    )
  })

  it("HISTORY_PATHS (revalidação após mutações do Histórico manual) revalida /estatisticas — a antiga /dashboard/analytics agora só redireciona", () => {
    const source = readSource("src/application/study-history/study-history.constants.ts")
    const start = source.indexOf("const HISTORY_PATHS = [")
    assert.notEqual(start, -1, "HISTORY_PATHS deve existir")
    const end = source.indexOf("]", start)
    const block = source.slice(start, end)
    // Até a Fase G.1 esta lista incluía /dashboard/analytics (que lia a mesma
    // getDashboardData de /dashboard). A rota virou um redirect para
    // /estatisticas (src/config/legacy-routes.ts); a tela que mostra esses
    // dados é /estatisticas, que continua na lista, junto com /dashboard.
    assert.equal(block.includes('"/dashboard/analytics"'), false, "HISTORY_PATHS não deve revalidar um redirect")
    assert.ok(block.includes('"/estatisticas"'), "HISTORY_PATHS deve continuar incluindo /estatisticas")
    assert.ok(block.includes('"/dashboard"'), "HISTORY_PATHS deve continuar incluindo /dashboard")
  })
})
