import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" para um bug real encontrado na Fase 3 da auditoria de
 * estabilizacao (item 10 - tratamento de erros): closeBlockManually
 * ("Marcar como concluido hoje" no Planejamento) reportava sucesso mesmo
 * quando uma falha real acontecia.
 *
 * Havia dois problemas encadeados:
 *
 * 1. adaptive-replan.service.ts: o catch externo de closeBlockManually
 *    capturava a excecao no Sentry mas retornava { ok: true } de qualquer
 *    forma. Isso fazia closeBlockManuallyAction (adaptive-replan.actions.ts)
 *    revalidar as rotas normalmente, como se o bloco tivesse sido fechado
 *    - mas nada foi persistido no banco, entao o bloco reaparecia como
 *    pendente apos um refresh.
 *
 * 2. daily-planning-view.tsx: handleConfirmCloseBlock ja marcava o bloco
 *    como fechado no localStorage (otimista) ANTES de chamar a action, e
 *    nunca verificava o retorno - sempre mostrava o toast de sucesso e
 *    nunca revertia a marcacao otimista, mesmo quando a action retornava
 *    { ok: false }. Ou seja, mesmo com o bug 1 corrigido (a action agora
 *    conseguindo reportar ok:false em falhas reais, como
 *    "Usuario nao autenticado"), a UI ainda ignorava esse retorno.
 *
 * Correcao: o catch externo de closeBlockManually agora retorna
 * { ok: false, error } (mantendo o Sentry.captureException), e
 * handleConfirmCloseBlock agora verifica result.ok, reverte a marcacao
 * otimista via revertOptimisticClose (forma funcional, sem closure stale)
 * e mostra o erro real quando a acao falha.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("closeBlockManually reporta falhas reais (Fase 3, item 10)", () => {
  const servicePath = "src/application/study-plan/replan/adaptive-replan.service.ts"
  const service = readSource(servicePath)

  it("o catch externo de closeBlockManually nao retorna mais { ok: true }", () => {
    const fnStart = service.indexOf("export async function closeBlockManually(")
    assert.ok(fnStart >= 0, "closeBlockManually nao encontrada")
    const stepMarker = 'step: "close_block_manually" } })'
    const catchIdx = service.indexOf(stepMarker, fnStart)
    assert.ok(catchIdx >= 0, "catch de close_block_manually nao encontrado")
    const after = service.slice(catchIdx, catchIdx + 200)
    assert.match(after, /return \{ ok: false, error:/)
    assert.doesNotMatch(after, /return \{ ok: true \}/)
  })

  it("ainda envia a excecao para o Sentry antes de retornar o erro", () => {
    const fnStart = service.indexOf("export async function closeBlockManually(")
    const stepMarker = 'step: "close_block_manually" } })'
    const catchIdx = service.indexOf(stepMarker, fnStart)
    const before = service.slice(catchIdx - 120, catchIdx)
    assert.match(before, /Sentry\.captureException/)
  })
})

describe("daily-planning-view verifica o retorno de closeBlockManuallyAction (Fase 3, item 10)", () => {
  const viewPath = "src/features/planejamento/components/daily-planning-view.tsx"
  const view = readSource(viewPath)

  it("define um helper para reverter a marcacao otimista", () => {
    assert.match(view, /const revertOptimisticClose = /)
  })

  it("handleConfirmCloseBlock verifica result.ok antes de mostrar sucesso", () => {
    const fnIdx = view.indexOf("const handleConfirmCloseBlock = async () => {")
    assert.ok(fnIdx >= 0, "handleConfirmCloseBlock nao encontrada")
    const fnBody = view.slice(fnIdx, fnIdx + 2000)
    assert.match(fnBody, /const result = await closeBlockManuallyAction\(/)
    assert.match(fnBody, /if \(!result\.ok\) \{/)
    assert.match(fnBody, /revertOptimisticClose\(newKeys\)/)
  })

  it("o catch da chamada tambem reverte a marcacao otimista", () => {
    const fnIdx = view.indexOf("const handleConfirmCloseBlock = async () => {")
    const callIdx = view.indexOf("await closeBlockManuallyAction(", fnIdx)
    assert.ok(callIdx >= 0, "chamada a closeBlockManuallyAction nao encontrada")
    const catchIdx = view.indexOf("} catch {", callIdx)
    assert.ok(catchIdx >= 0, "catch nao encontrado apos a chamada a closeBlockManuallyAction")
    const catchBody = view.slice(catchIdx, catchIdx + 150)
    assert.match(catchBody, /revertOptimisticClose\(newKeys\)/)
  })
})
