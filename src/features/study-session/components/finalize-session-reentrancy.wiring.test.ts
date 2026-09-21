import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Teste de "wiring" (verificacao estatica do codigo-fonte) para a trava de
 * reentrancia de finalizeAndSaveSession, adicionada no QA funcional de
 * 2026-09.
 *
 * Contexto do bug potencial: finalizeAndSaveSession so limpa a sessao
 * (setSession(null)) DEPOIS que saveStudySessionAction resolve com sucesso.
 * Ate esse ponto, `session` continua nao-nulo. A unica protecao contra
 * chamar a funcao duas vezes (duplo clique, duas abas, handlers duplicados)
 * vivia inteiramente na tela consumidora (o `disabled={isSubmitting}` do
 * botao em study-register-modal.tsx) - a fonte da verdade da sessao
 * (StudyProvider) nao se protegia sozinha. Este teste trava o contrato:
 * StudyProvider precisa ter sua propria guarda de reentrancia, nao pode
 * depender so da tela para nao criar dois registros de historico para a
 * mesma sessao.
 *
 * Por que teste estatico e nao renderizado: mesmo motivo documentado em
 * study-provider-context-split.wiring.test.ts (projeto nao tem
 * infraestrutura de renderizacao de React nos testes).
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

const PROVIDER_PATH = "src/features/study-session/components/study-provider.tsx"

describe("finalizeAndSaveSession: trava de reentrancia (evita registro duplicado)", () => {
  it("declara uma ref de reentrancia dedicada", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(
      /const isFinalizingRef = useRef/.test(source),
      "deve existir uma ref (ex.: isFinalizingRef) dedicada a travar chamadas concorrentes",
    )
  })

  it("recusa uma segunda chamada enquanto a primeira ainda esta em andamento", () => {
    const source = readSource(PROVIDER_PATH)
    const fnStart = source.indexOf("const finalizeAndSaveSession = useCallback")
    assert.ok(fnStart !== -1, "finalizeAndSaveSession deve existir")
    const fnBody = source.slice(fnStart, fnStart + 800)
    assert.ok(
      /if\s*\(isFinalizingRef\.current\)/.test(fnBody),
      "o inicio da funcao deve checar a ref antes de prosseguir",
    )
  })

  it("sempre libera a trava ao final (sucesso, erro ou excecao), via try/finally", () => {
    const source = readSource(PROVIDER_PATH)
    const fnStart = source.indexOf("const finalizeAndSaveSession = useCallback")
    const fnEnd = source.indexOf("const toggleFloatingTimer", fnStart)
    assert.ok(fnStart !== -1 && fnEnd !== -1 && fnEnd > fnStart)
    const fnBody = source.slice(fnStart, fnEnd)
    assert.ok(fnBody.includes("try {"), "deve envolver o corpo em try")
    assert.ok(
      /finally\s*\{\s*isFinalizingRef\.current = false/.test(fnBody),
      "deve resetar isFinalizingRef.current = false dentro de um finally",
    )
  })
})
