import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" (verificacao estatica do codigo-fonte) para a
 * revalidacao de rotas apos mutacoes no ciclo de vida de um plano de
 * estudos, adicionada no QA funcional de 2026-09.
 *
 * Contexto do bug encontrado: activatePlanAction, togglePausePlanAction e
 * deletePlanAction mudam qual plano esta ativo (ou removem o plano ativo)
 * mas nao chamavam revalidatePath para nenhuma rota - diferente da acao
 * irma generateStudyPlanAction (criar plano), que sempre revalidou
 * /planejamento, /study-plan, /dashboard e /planos ao mudar o plano ativo.
 * A tela /planos ficava correta so porque ela mesma recarrega via
 * loadPlans() (fetch client-side direto) apos cada acao, mas outras rotas
 * que dependem do plano ativo (/dashboard, /planejamento, /study-plan)
 * podiam continuar servindo a versao antiga pelo cache de rota do Next ate
 * expirar por conta propria - inconsistente com o resto do app, onde toda
 * mutacao real que muda dado exibido em outra tela revalida explicitamente
 * (ver HISTORY_PATHS em study-history.constants.ts para o mesmo padrao).
 *
 * Por que teste estatico e nao renderizado/integrado: mesmo motivo
 * documentado em study-provider-context-split.wiring.test.ts (projeto nao
 * tem infraestrutura de testes com Supabase real nem de renderizacao React;
 * os testes de service/action usam node:test puro).
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

const ACTIONS_PATH = "src/application/study-plan/list-plans.action.ts"

const EXPECTED_PATHS = ["/planejamento", "/study-plan", "/dashboard", "/planos"]

function extractFunctionBody(source: string, fnSignature: string): string {
  const start = source.indexOf(fnSignature)
  assert.ok(start !== -1, `${fnSignature} deve existir em ${ACTIONS_PATH}`)
  // Todas as funcoes deste arquivo terminam em uma linha "}" isolada seguida
  // de linha em branco ou fim de arquivo antes da proxima "export async
  // function" (ou fim do arquivo) - suficiente para isolar o corpo aqui.
  const nextExportIdx = source.indexOf("\nexport async function", start + fnSignature.length)
  return source.slice(start, nextExportIdx === -1 ? source.length : nextExportIdx)
}

describe("Ciclo de vida do plano: revalidacao de rotas apos ativar/pausar/excluir", () => {
  it("importa revalidatePath de next/cache", () => {
    const source = readSource(ACTIONS_PATH)
    assert.ok(
      /import\s*\{\s*revalidatePath\s*\}\s*from\s*"next\/cache"/.test(source),
      "deve importar revalidatePath de next/cache",
    )
  })

  it("activatePlanAction revalida /planejamento, /study-plan, /dashboard e /planos", () => {
    const source = readSource(ACTIONS_PATH)
    const body = extractFunctionBody(source, "export async function activatePlanAction")
    for (const p of EXPECTED_PATHS) {
      assert.ok(body.includes(`revalidatePath("${p}")`), `activatePlanAction deve revalidar ${p}`)
    }
  })

  it("togglePausePlanAction revalida /planejamento, /study-plan, /dashboard e /planos", () => {
    const source = readSource(ACTIONS_PATH)
    const body = extractFunctionBody(source, "export async function togglePausePlanAction")
    for (const p of EXPECTED_PATHS) {
      assert.ok(body.includes(`revalidatePath("${p}")`), `togglePausePlanAction deve revalidar ${p}`)
    }
  })

  it("deletePlanAction revalida /planejamento, /study-plan, /dashboard e /planos", () => {
    const source = readSource(ACTIONS_PATH)
    const body = extractFunctionBody(source, "export async function deletePlanAction")
    for (const p of EXPECTED_PATHS) {
      assert.ok(body.includes(`revalidatePath("${p}")`), `deletePlanAction deve revalidar ${p}`)
    }
  })
})
