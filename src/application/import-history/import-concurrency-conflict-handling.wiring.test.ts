import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" para o tratamento de conflito de importação concorrente
 * na Fase 14 (banco real + concorrência).
 *
 * ACHADO REAL: importHistoryChunkAction deduplica registros comparando um
 * snapshot de fingerprints carregado no início da requisição
 * (loadExistingFingerprints) contra o lote atual — isso nunca pega duas
 * requisições concorrentes (duas abas importando o mesmo arquivo ao mesmo
 * tempo), pois ambas podem carregar o mesmo snapshot "sem duplicata" antes
 * de qualquer uma delas inserir. Esse gap era documentado, mas
 * explicitamente NÃO coberto, em concurrency-guarantees.wiring.test.ts
 * ("RISCO CONHECIDO, NAO COBERTO").
 *
 * Corrigido nesta fase em dois níveis:
 * 1) banco: índice único parcial study_history_import_fingerprint_idx
 *    (supabase/migrations/20260921_2_study_history_import_fingerprint_unique_idx.sql),
 *    escopado a WHERE import_batch_id IS NOT NULL, replicando exatamente a
 *    mesma identidade lógica da função fingerprint() usada em memória.
 * 2) aplicação: quando o INSERT em lote esbarra nesse índice (erro Postgres
 *    23505 — unique_violation), importHistoryChunkAction refaz a gravação
 *    linha a linha, tratando cada violação de unicidade como duplicata (não
 *    como falha), e prossegue com as demais linhas do lote — em vez de
 *    falhar a importação inteira ou duplicar silenciosamente.
 *
 * Por que teste estático: mesma limitação documentada nos demais
 * *.wiring.test.ts deste projeto — não há infraestrutura de teste com
 * Supabase real nem simulação de duas requisições HTTP concorrentes de
 * verdade neste ambiente.
 */

function readSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "application", "import-history", "import-history.actions.ts"),
    "utf-8",
  )
}

function extractFunctionBody(source: string): string {
  const start = source.indexOf("export async function importHistoryChunkAction(")
  assert.ok(start !== -1, "importHistoryChunkAction deve existir")
  const end = source.indexOf("\nexport async function", start + 1)
  return source.slice(start, end === -1 ? source.length : end)
}

describe("importHistoryChunkAction trata conflito de índice único (importação concorrente)", () => {
  it("mantém o insert em lote original (rows) como primeira tentativa", () => {
    const fnBody = extractFunctionBody(readSource())
    assert.match(fnBody, /\.from\("study_history"\)\s*\n\s*\.insert\(rows\)/)
  })

  it("ao receber erro 23505 no insert em lote, refaz a gravação linha a linha", () => {
    const fnBody = extractFunctionBody(readSource())
    assert.match(fnBody, /if \(error\.code === "23505"\)/)
    assert.match(fnBody, /for \(const row of rows\)/)
    assert.match(fnBody, /\.insert\(row\)/)
  })

  it("uma violação de unicidade por linha (23505) é contada como duplicata, não falha a importação", () => {
    const fnBody = extractFunctionBody(readSource())
    assert.match(fnBody, /if \(singleError\.code === "23505"\)\s*\{\s*\n\s*concurrentDuplicates\+\+/)
  })

  it("um erro diferente de 23505 durante a gravação linha a linha ainda falha a ação (não é silenciado)", () => {
    const fnBody = extractFunctionBody(readSource())
    // Depois do bloco "if (singleError.code === '23505') { ...; continue }",
    // deve haver um retorno de falha explícito para qualquer outro erro.
    const idx = fnBody.indexOf('if (singleError.code === "23505")')
    assert.ok(idx !== -1)
    const after = fnBody.slice(idx, idx + 400)
    assert.match(after, /return \{ success: false, error: `Erro ao gravar histórico: \$\{singleError\.message\}` \}/)
  })

  it("o total de 'imported' reflete o que realmente foi inserido (insertedHistoryIds.length), não o tamanho do lote tentado", () => {
    const fnBody = extractFunctionBody(readSource())
    assert.match(fnBody, /imported: insertedHistoryIds\.length,/)
    assert.doesNotMatch(
      fnBody,
      /imported: rows\.length,/,
      "não deve mais reportar 'imported' como rows.length — isso mascararia duplicatas concorrentes descartadas",
    )
  })

  it("duplicatas concorrentes (23505) somam ao contador de 'duplicates' já existente (dedupe em memória)", () => {
    const fnBody = extractFunctionBody(readSource())
    assert.match(fnBody, /duplicates: duplicates \+ concurrentDuplicates,/)
  })
})
