import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" (verificação estática do código-fonte) para a divisão
 * do StudyContext em StudyLiveContext (cronômetro ao vivo) e
 * StudyActionsContext (ações/flags estáveis) — Fase 2 de otimização.
 *
 * Por que testes estáticos em vez de renderizar o componente: este projeto
 * não tem nenhuma infraestrutura de renderização de React nos testes (sem
 * react-test-renderer/@testing-library/react/jsdom em nenhum dos 500+ testes
 * existentes, todos node:test puro). StudyProvider usa window/document/
 * localStorage diretamente em vários efeitos, então "montá-lo" de verdade
 * exigiria adicionar jsdom + um renderer só para esta métrica — uma peça de
 * infraestrutura nova e maior que o risco que este teste específico precisa
 * cobrir. Em vez disso, este arquivo trava exatamente o contrato que faz a
 * otimização funcionar: se alguém no futuro reintroduzir `session` (o
 * objeto que muda a cada segundo) como dependência do useMemo de ações, ou
 * remover o useCallback de formatTime, o teste falha imediatamente — o
 * mesmo tipo de proteção que os demais *.wiring.test.ts deste projeto já
 * usam (ex.: study-history.cycle-sync.wiring.test.ts).
 *
 * Medição empírica real (contagem de renders num navegador de verdade) fica
 * documentada como pendência manual no docs/overnight-stability-report.md:
 * exige um servidor `next dev` persistente, que as ferramentas de automação
 * usadas nesta sessão não conseguem manter vivo entre chamadas.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

const PROVIDER_PATH = "src/features/study-session/components/study-provider.tsx"

describe("StudyContext dividido em StudyLiveContext + StudyActionsContext", () => {
  it("existem dois contextos separados (live vs. actions), não um único StudyContext", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(source.includes("const StudyLiveContext = createContext"), "StudyLiveContext deve existir")
    assert.ok(source.includes("const StudyActionsContext = createContext"), "StudyActionsContext deve existir")
  })

  it("useGlobalStudy() continua existindo com a mesma API pública (compatibilidade)", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(source.includes("export function useGlobalStudy(): StudyContextType"), "useGlobalStudy deve continuar exportado e devolver StudyContextType")
  })

  it("useStudyActions() existe para consumidores que não precisam do cronômetro ao vivo", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(source.includes("export function useStudyActions(): StudyActionsContextType"), "useStudyActions deve estar exportado")
  })

  it("formatTime é estável (useCallback), não uma função recriada a cada render", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(
      /const formatTime = useCallback\(/.test(source),
      "formatTime precisa ser useCallback para que StudyLiveContext só mude quando `session` de fato mudar",
    )
  })

  it("sessionSummary (useMemo) depende apenas de campos estáveis de session, nunca do objeto session inteiro", () => {
    const source = readSource(PROVIDER_PATH)
    const start = source.indexOf("const sessionSummary = useMemo")
    assert.notEqual(start, -1, "sessionSummary deve ser calculado via useMemo")
    const depsStart = source.indexOf("}, [", start)
    const depsEnd = source.indexOf("])", depsStart)
    const depsArray = source.slice(depsStart, depsEnd)
    // Cada dependência deve ser um campo específico (session?.algumCampo),
    // nunca a variável `session` sozinha (o que forçaria recálculo a cada
    // tick do cronômetro, já que `session` é um objeto novo a cada segundo).
    assert.ok(!/\[\s*session\s*,/.test(depsArray) && !/,\s*session\s*,/.test(depsArray) && !/,\s*session\s*\]/.test(depsArray),
      "sessionSummary não deve depender do objeto `session` inteiro, apenas de campos individuais (session?.xxx)")
    assert.ok(depsArray.includes("session?.isActive"), "sessionSummary deve depender de session?.isActive")
  })

  it("actionsValue (useMemo) não depende do objeto session inteiro nem de formatTime (isso pertence ao StudyLiveContext)", () => {
    const source = readSource(PROVIDER_PATH)
    const start = source.indexOf("const actionsValue = useMemo")
    assert.notEqual(start, -1, "actionsValue deve ser calculado via useMemo")
    const end = source.indexOf("const liveValue = useMemo", start)
    const block = source.slice(start, end === -1 ? source.length : end)
    assert.ok(!/\[\s*session\s*[,\]]/.test(block) && !/,\s*session\s*[,\]]/.test(block),
      "actionsValue não deve depender do objeto `session` (ele tickaria a cada segundo, anulando a otimização)")
    assert.equal(block.includes("formatTime"), false, "actionsValue não deve incluir formatTime (isso é do StudyLiveContext)")
    assert.ok(block.includes("sessionSummary"), "actionsValue deve expor sessionSummary")
  })

  it("liveValue (useMemo) expõe exatamente { session, formatTime }", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(
      /const liveValue = useMemo<StudyLiveContextType>\(\s*\n\s*\(\) => \(\{ session, formatTime \}\)/.test(source),
      "liveValue deve ser { session, formatTime }, memoizado",
    )
  })
})

describe("Consumidores que só precisam de ações/flags migraram para useStudyActions()", () => {
  const consumersThatShouldNotNeedLiveTimer = [
    "src/components/layout/floating-action-button.tsx",
    "src/features/study-cycle/components/active-cycle-panel.tsx",
    "src/features/study-cycle/components/intelligent-cycle-widget.tsx",
  ]

  for (const file of consumersThatShouldNotNeedLiveTimer) {
    it(`${file} usa useStudyActions() (não useGlobalStudy()) e não lê o objeto \`session\` ao vivo`, () => {
      const source = readSource(file)
      assert.ok(source.includes("useStudyActions"), `${file} deveria importar/usar useStudyActions`)
      assert.equal(source.includes("useGlobalStudy"), false, `${file} não deveria mais usar useGlobalStudy (re-renderiza a cada segundo)`)
      assert.equal(/\bsession\?\./.test(source), false, `${file} não deveria ler session?.xxx diretamente — use sessionSummary?.xxx`)
    })
  }

  const consumersThatNeedLiveTimer = [
    "src/features/study-session/components/active-session-runner.tsx",
    "src/features/study-session/components/study-register-modal.tsx",
    "src/components/study/study-header-control.tsx",
    // Fase G: study-dock.tsx e quick-start-bar.tsx (e study-quick-access.tsx,
    // na lista acima) eram componentes sem nenhum import no app e foram
    // removidos — os consumidores reais continuam verificados aqui.
  ]

  for (const file of consumersThatNeedLiveTimer) {
    it(`${file} continua usando useGlobalStudy() (precisa do cronômetro ao vivo, isso é esperado)`, () => {
      const source = readSource(file)
      assert.ok(source.includes("useGlobalStudy"), `${file} deveria continuar usando useGlobalStudy (exibe o tempo decorrido)`)
    })
  }
})
