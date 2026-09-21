import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" (Fase 6 — auditoria de Loading/UX funcional) para um bug
 * real encontrado em planning-view.tsx: o botão "Remover" (que desativa todo
 * o planejamento do usuário via deactivateStudyPlanAction) não tinha
 * confirmação nem proteção contra duplo clique, ao contrário de outras ações
 * destrutivas do projeto (ex.: excluir sessão em history-view.tsx, que já
 * usa window.confirm) e ao contrário de outros botões de exclusão do
 * projeto, que já desabilitam durante o processamento
 * (ex.: manage-imports-modal.tsx com `disabled={deletingId !== null}`).
 *
 * Não é possível renderizar o componente diretamente (o projeto não tem
 * @testing-library/react para Client Components), então este teste verifica
 * estruturalmente, via texto-fonte, que a correção está presente.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("planning-view.tsx: handleRemovePlan pede confirmação e evita duplo clique", () => {
  const source = readSource("src/features/planejamento/components/planning-view.tsx")

  it("declara um estado de pendência (isRemovingPlan) para a remoção do planejamento", () => {
    assert.match(source, /const \[isRemovingPlan, setIsRemovingPlan\] = useState\(false\)/)
  })

  it("handleRemovePlan pede confirmação (window.confirm) antes de desativar o planejamento", () => {
    const start = source.indexOf("const handleRemovePlan = async () => {")
    assert.notEqual(start, -1, "handleRemovePlan deve existir")
    const end = source.indexOf("\n  const handleStartStudy", start)
    const body = source.slice(start, end === -1 ? source.length : end)
    assert.ok(
      body.includes("window.confirm("),
      "handleRemovePlan deve pedir confirmação antes de desativar o planejamento (ação destrutiva)",
    )
    assert.ok(
      body.includes("if (isRemovingPlan) return"),
      "handleRemovePlan deve ignorar chamadas reentrantes enquanto já está removendo",
    )
    assert.ok(
      body.includes("setIsRemovingPlan(true)") && body.includes("setIsRemovingPlan(false)"),
      "handleRemovePlan deve marcar isRemovingPlan como true durante a chamada e false ao final (finally)",
    )
  })

  it("o botão 'Remover' fica desabilitado (disabled={isRemovingPlan}) durante a remoção", () => {
    const buttonStart = source.indexOf('onClick={handleRemovePlan}')
    assert.notEqual(buttonStart, -1, "botão que chama handleRemovePlan deve existir")
    const nearby = source.slice(buttonStart, buttonStart + 200)
    assert.ok(
      nearby.includes("disabled={isRemovingPlan}"),
      "o botão Remover deve ficar desabilitado enquanto isRemovingPlan for true, evitando duplo clique/duplo envio",
    )
  })
})
