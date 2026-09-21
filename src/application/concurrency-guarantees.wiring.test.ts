import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" para as garantias de concorrencia/idempotencia
 * pedidas na Fase 4 da auditoria de estabilizacao.
 *
 * IMPORTANTE — leia antes de confiar neste arquivo: esta sandbox nao tem
 * um servidor Next.js persistente nem um banco Postgres acessivel entre
 * chamadas de ferramenta (verificado nesta sessao: conexao direta ao
 * Postgres do Supabase falha por DNS, e a API REST/HTTPS do Supabase
 * tambem falha por rede indisponivel neste ambiente). Por isso NENHUM
 * teste aqui dispara duas requisicoes de verdade em paralelo contra o
 * banco — isso seria simulado, nao concorrencia real, e o prompt desta
 * fase pede explicitamente para nao fingir isso. Em vez disso, cada teste
 * verifica uma GARANTIA ESTRUTURAL no codigo-fonte (o padrao que existe
 * hoje e que, se removido, tornaria o cenario correspondente inseguro).
 * Onde a garantia estrutural NAO existe (ex.: duas importacoes
 * concorrentes de verdade), isso e declarado explicitamente como um
 * risco conhecido, nao testado como se estivesse resolvido.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("1. Duas operacoes de importacao identicas (mesmo request)", () => {
  const source = readSource("src/application/import-history/import-history.actions.ts")

  it("previewImportAction deduplica registros identicos dentro do mesmo run (seenInRun)", () => {
    const fnStart = source.indexOf("export async function previewImportAction(")
    assert.ok(fnStart >= 0)
    const fnEnd = source.indexOf("\nexport async function", fnStart + 10)
    const body = source.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 3000)
    assert.match(body, /const seenInRun = new Set<string>\(\)/)
    assert.match(body, /existingSet\.has\(finalFp\) \|\| seenInRun\.has\(finalFp\)/)
  })

  it("importHistoryChunkAction deduplica registros identicos dentro do mesmo chunk (seenInRun)", () => {
    const fnStart = source.indexOf("export async function importHistoryChunkAction(")
    assert.ok(fnStart >= 0)
    const fnEnd = source.indexOf("\nexport async function", fnStart + 10)
    const body = source.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000)
    assert.match(body, /const seenInRun = new Set<string>\(\)/)
    assert.match(body, /existingSet\.has\(finalFp\) \|\| seenInRun\.has\(finalFp\)/)
    // a escrita final e um unico insert em lote, nao inserts individuais por linha
    assert.match(body, /\.from\("study_history"\)\s*\n\s*\.insert\(rows\)/)
  })

  it("CONCORRENCIA (duplo clique, duas abas): duas requisicoes concorrentes de verdade "
    + "cada uma carrega seu proprio existingSet no inicio do request (loadExistingFingerprints e chamada "
    + "uma unica vez por request, ver assercao abaixo) — isso NAO mudou. O que mudou desde a Fase 14/15: "
    + "existe agora um indice UNICO parcial no banco real (study_history_import_fingerprint_idx, ver "
    + "supabase/migrations/20260921_2_study_history_import_fingerprint_unique_idx.sql) que replica o mesmo "
    + "fingerprint usado aqui, e importHistoryChunkAction trata o erro 23505 (unique_violation) desse "
    + "indice com fallback de insercao linha a linha, contando o conflito como duplicata em vez de falhar "
    + "(ver import-concurrency-conflict-handling.wiring.test.ts). Ou seja: o dedupe em memoria continua "
    + "checando o banco uma unica vez por request (nao ha uma segunda verificacao logo antes do insert), "
    + "mas a corrida entre duas requisicoes concorrentes agora e coberta por uma constraint real no banco, "
    + "nao apenas pelo dedupe em memoria. Este teste documenta o comportamento estrutural atual (uma unica "
    + "chamada a loadExistingFingerprints por request) e nao afirma, por si so, cobertura de concorrencia — "
    + "essa cobertura esta em import-concurrency-conflict-handling.wiring.test.ts.", () => {
    // loadExistingFingerprints e chamada uma unica vez por request, antes do loop de insercao —
    // ou seja, duas chamadas concorrentes de importHistoryChunkAction podem ambas carregar o
    // mesmo existingSet (sem o registro uma da outra ainda inserido) e ambas decidirem inserir.
    const fnStart = source.indexOf("export async function importHistoryChunkAction(")
    const fnEnd = source.indexOf("\nexport async function", fnStart + 10)
    const body = source.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 4000)
    const loadCalls = (body.match(/loadExistingFingerprints\(/g) ?? []).length
    assert.equal(loadCalls, 1, "loadExistingFingerprints deveria ser chamada exatamente uma vez por request (confirma a lacuna: nada re-verifica no banco logo antes do insert)")
  })
})

describe("2/3/4. Editar/excluir/criar manualmente + refresh", () => {
  it("ja coberto por statistics-cache-invalidation.wiring.test.ts e close-block-manually.wiring.test.ts "
    + "(HISTORY_PATHS revalidado + cache de Estatisticas invalidado em todo mutation de study_history) "
    + "— nao duplicado aqui.", () => {
    assert.ok(fs.existsSync(path.join(process.cwd(), "src/application/statistics-cache-invalidation.wiring.test.ts")))
  })
})

describe("5. Duas gravacoes rapidas de estudo / 6. Importacao + estudo (ponto unico de sincronizacao do ciclo)", () => {
  it("startStudySessionAction e finishStudySessionAction passam pelo mesmo registerStudyToCycle central", () => {
    const source = readSource("src/application/study-session/study-session.action.ts")
    assert.match(source, /import \{ registerStudyToCycle \} from "@\/application\/study-cycle\/cycle-study-registration\.service"/)
    const calls = (source.match(/registerStudyToCycle\(\)/g) ?? []).length
    assert.ok(calls >= 1, "registerStudyToCycle deveria ser chamada em study-session.action.ts")
  })

  it("todas as mutacoes de study_history em study-history.actions.ts passam por registerStudyToCycle", () => {
    const source = readSource("src/application/study-history/study-history.actions.ts")
    const calls = (source.match(/await registerStudyToCycle\(\)/g) ?? []).length
    // Fase 18: saveManualStudyTimeAction perdeu os ramos de UPDATE-on-existing e
    // de tratamento de conflito 23505 (a regra "1 lancamento manual por dia" foi
    // revertida — lancamentos manuais agora sao ilimitados), entao o total caiu
    // de 8 para 7: cada ramo removido tinha sua propria chamada a
    // registerStudyToCycle, e agora so sobra a do caminho unico de INSERT. O
    // numero minimo aqui existe para travar que nenhuma mutacao real perca essa
    // chamada, nao para congelar a contagem de ramos de codigo.
    assert.ok(calls >= 7, `esperado pelo menos 7 chamadas a registerStudyToCycle, encontrado ${calls}`)
  })

  it("a importacao (commit) registra os estudos no ciclo pelo mesmo mecanismo central (registerStudiesToCycleBatch)", () => {
    const source = readSource("src/application/import-history/import-history.actions.ts")
    assert.match(source, /import \{ registerStudiesToCycleBatch \} from "@\/application\/study-cycle\/cycle-study-registration\.service"/)
    const calls = (source.match(/registerStudiesToCycleBatch\(\)/g) ?? []).length
    assert.ok(calls >= 1)
  })
})

describe("7. Operacao repetida / idempotente", () => {
  it("reconcileWeeklyPlan declara seu proprio contrato de idempotencia no comentario da funcao", () => {
    const source = readSource("src/application/study-plan/weekly-planner.service.ts")
    const idx = source.indexOf("export async function reconcileWeeklyPlan(")
    assert.ok(idx >= 0)
    const before = source.slice(Math.max(0, idx - 700), idx)
    assert.match(before, /IDEMPOTENTE/)
    assert.match(before, /NUNCA sejam apagados ou modificados/)
  })

  it("closeBlockManually e seguro para chamar duas vezes seguidas para o mesmo bloco "
    + "(procura o bloco existente antes de decidir entre UPDATE e INSERT, nao insere duplicado)", () => {
    const source = readSource("src/application/study-plan/replan/adaptive-replan.service.ts")
    const idx = source.indexOf("export async function closeBlockManually(")
    assert.ok(idx >= 0)
    const fnEnd = source.indexOf("\nexport async function", idx + 10)
    const body = source.slice(idx, fnEnd > 0 ? fnEnd : idx + 3000)
    // busca o bloco por id ou por item_id+data ANTES de decidir se atualiza ou insere
    assert.match(body, /if \(block\) \{/)
    assert.match(body, /\} else \{/)
    // o branch "else" (bloco nao encontrado) insere; o branch "if" atualiza — uma segunda
    // chamada para o mesmo bloco vai encontrar o registro ja criado na primeira chamada
    // e cair no branch de UPDATE, nao duplicar o INSERT.
    assert.match(body, /\.update\(\{/)
    assert.match(body, /\.insert\(\{/)
  })
})
