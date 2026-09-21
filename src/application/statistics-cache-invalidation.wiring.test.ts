import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" para um bug real de consistência encontrado na Fase 3
 * da auditoria de estabilização: getStatisticsCenterAction (Estatísticas)
 * mantém um cache em memória por usuário com TTL de 5 minutos
 * (statistics-center.action.ts), que NENHUM revalidatePath invalida — só
 * invalidateStatisticsCenterCache(userId) faz isso.
 *
 * Antes desta correção, invalidateStatisticsCenterCache só era chamada a
 * partir de goals.action.ts. Nenhuma mutação real de study_history
 * (criar/editar/excluir sessão manual, importar/excluir importação,
 * finalizar uma revisão que gera study_history) invalidava esse cache —
 * ou seja, Estatísticas podia ficar até 5 minutos desatualizada em relação
 * a Dashboard/Histórico/Ciclos após qualquer uma dessas ações, mesmo com
 * revalidatePath sendo chamado corretamente para as outras páginas.
 *
 * Um segundo bug relacionado (mesma raiz: listas de revalidação divergentes)
 * também foi encontrado e corrigido: importHistoryChunkAction (o COMMIT de
 * uma importação — o caminho mais comum) revalidava só 3 rotas hardcoded,
 * enquanto deleteImportBatchAction/deleteAllImportedAction (excluir) já
 * revalidavam as 7 de IMPORT_REVALIDATE_PATHS. Agora todos usam a mesma
 * lista.
 *
 * Um terceiro bug (mais grave, encontrado na Fase 5) tinha a mesma raiz:
 * HISTORY_PATHS era `export const` dentro de study-history.actions.ts, um
 * arquivo "use server" — e um arquivo "use server" só pode exportar funções
 * async. Isso quebrava o build em runtime ("A \"use server\" file can only
 * export async functions, found object") sempre que o Dashboard era
 * renderizado, derrubando em loop TODAS as Server Actions da rota /dashboard
 * (500 repetido, Fast Refresh reconstruindo sem parar) — na prática, o
 * widget de Ciclo nunca carregava e a aba Ciclos não abria. Corrigido
 * extraindo HISTORY_PATHS para study-history.constants.ts (sem "use
 * server"), importado tanto por study-history.actions.ts quanto por
 * review.actions.ts.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("Invalidação do cache de Estatísticas (statistics-center.action.ts) em toda mutação de study_history", () => {
  it("study-history.actions.ts: toda revalidação de HISTORY_PATHS é acompanhada de invalidateStatisticsCenterCache", () => {
    const source = readSource("src/application/study-history/study-history.actions.ts")
    const revalidateCount = (source.match(/for \(const path of HISTORY_PATHS\) revalidatePath\(path\)/g) ?? []).length
    const invalidateCount = (source.match(/await invalidateStatisticsCenterCache\(effectiveUserId\)/g) ?? []).length
    assert.ok(revalidateCount > 0, "deveria haver pelo menos uma revalidação de HISTORY_PATHS")
    assert.equal(
      invalidateCount,
      revalidateCount,
      `Toda revalidação de HISTORY_PATHS (${revalidateCount}x) deve ter uma invalidação correspondente do cache de Estatísticas (encontradas ${invalidateCount}x)`,
    )
  })

  it("HISTORY_PATHS é exportado a partir de study-history.constants.ts, SEM \"use server\" (fonte única reusada por review.actions.ts, evitando listas divergentes)", () => {
    const constantsSource = readSource("src/application/study-history/study-history.constants.ts")
    assert.ok(constantsSource.includes("export const HISTORY_PATHS"), "HISTORY_PATHS precisa ser exportado")
    assert.equal(
      constantsSource.trimStart().startsWith('"use server"'),
      false,
      "study-history.constants.ts não pode ter \"use server\": esse diretiva só permite exportar funções async, " +
        "e HISTORY_PATHS é um array — reintroduzir \"use server\" aqui quebra o build em runtime " +
        "(já aconteceu em produção: /dashboard voltava 500 em loop e a aba Ciclos não abria)",
    )
  })

  it("study-history.actions.ts NÃO redefine HISTORY_PATHS localmente (deve só importar de study-history.constants.ts)", () => {
    const source = readSource("src/application/study-history/study-history.actions.ts")
    assert.equal(
      source.includes("const HISTORY_PATHS = ["),
      false,
      "HISTORY_PATHS não deve ser definido dentro de study-history.actions.ts (arquivo \"use server\"); " +
        "deve ser importado de ./study-history.constants",
    )
    assert.ok(
      source.includes('import { HISTORY_PATHS } from "./study-history.constants"'),
      "study-history.actions.ts deve importar HISTORY_PATHS de ./study-history.constants",
    )
  })

  it("review.actions.ts importa HISTORY_PATHS de study-history.constants.ts, não de study-history.actions.ts", () => {
    const source = readSource("src/application/review-engine/review.actions.ts")
    assert.ok(
      source.includes('import { HISTORY_PATHS } from "@/application/study-history/study-history.constants"'),
      "review.actions.ts deve importar HISTORY_PATHS de @/application/study-history/study-history.constants",
    )
    assert.equal(
      source.includes('from "@/application/study-history/study-history.actions"'),
      false,
      "review.actions.ts não deve mais importar de study-history.actions.ts (HISTORY_PATHS foi movido)",
    )
  })

  it("import-history.actions.ts: toda revalidação de IMPORT_REVALIDATE_PATHS é acompanhada de invalidateStatisticsCenterCache", () => {
    const source = readSource("src/application/import-history/import-history.actions.ts")
    const revalidateCount = (source.match(/for \(const path of IMPORT_REVALIDATE_PATHS\) revalidatePath\(path\)/g) ?? []).length
    const invalidateCount = (source.match(/await invalidateStatisticsCenterCache\(user\.id\)/g) ?? []).length
    assert.ok(revalidateCount > 0, "deveria haver pelo menos uma revalidação de IMPORT_REVALIDATE_PATHS")
    assert.equal(
      invalidateCount,
      revalidateCount,
      `Toda revalidação de IMPORT_REVALIDATE_PATHS (${revalidateCount}x) deve ter uma invalidação correspondente do cache de Estatísticas (encontradas ${invalidateCount}x)`,
    )
  })

  it("importHistoryChunkAction (commit de uma importação) usa a lista completa IMPORT_REVALIDATE_PATHS, não uma lista menor hardcoded", () => {
    const source = readSource("src/application/import-history/import-history.actions.ts")
    const start = source.indexOf("export async function importHistoryChunkAction")
    assert.notEqual(start, -1)
    const end = source.indexOf("\nexport async function", start + 1)
    const body = source.slice(start, end === -1 ? source.length : end)
    assert.ok(
      body.includes("for (const path of IMPORT_REVALIDATE_PATHS) revalidatePath(path)"),
      "importHistoryChunkAction deve revalidar usando IMPORT_REVALIDATE_PATHS (a mesma lista completa usada ao excluir uma importação)",
    )
    assert.equal(
      /revalidatePath\("\/dashboard\/history"\)\s*\n\s*revalidatePath\("\/ciclos"\)\s*\n\s*revalidatePath\("\/dashboard"\)/.test(body),
      false,
      "não deve voltar a usar a lista curta hardcoded de 3 rotas",
    )
  })

  it("finalizeReviewSessionAction (review.actions.ts) revalida HISTORY_PATHS e invalida o cache de Estatísticas, já que finalizeSession pode gravar study_history", () => {
    const source = readSource("src/application/review-engine/review.actions.ts")
    const start = source.indexOf("export async function finalizeReviewSessionAction")
    assert.notEqual(start, -1)
    const end = source.indexOf("\nexport async function", start + 1)
    const body = source.slice(start, end === -1 ? source.length : end)
    assert.ok(body.includes("for (const path of HISTORY_PATHS) revalidatePath(path)"), "deve revalidar HISTORY_PATHS")
    assert.ok(body.includes("await invalidateStatisticsCenterCache(user.id)"), "deve invalidar o cache de Estatísticas")
  })
})
