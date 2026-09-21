// ─────────────────────────────────────────────────────────────────────────────
// BUG CRÍTICO — botão "Continuar ciclo" (widget "Foco de hoje" do Dashboard)
// navegava para /ciclos em vez de retomar o estudo.
//
// Repro original: quando o ciclo já tinha progresso na etapa atual
// (currentItem.studiedMinutesInRound > 0) e não havia sessão ativa no
// momento, ou quando a sessão do ciclo já estava ativa (isCurrentStudying),
// o `buttonAction` do widget caía nos casos que usavam `handleNavigate`
// (router.push("/ciclos")) — o clique só trocava de página, sem dar play no
// cronômetro.
//
// Causa raiz: em intelligent-cycle-widget.tsx, o valor padrão de
// `buttonAction` (linha antes de qualquer `if`) era `handleNavigate`, e o
// ramo `else if (isCurrentStudying)` também usava `handleNavigate` — só o
// ramo "Iniciar ciclo" (progresso zerado) usava `handleStartStudy`.
//
// Comportamento pedido (e confirmado pelo usuário): "Continuar ciclo" deve
// SÓ dar play no cronômetro — não deve abrir a Central Inteligente de
// Estudos automaticamente (isso ficou explícito depois da primeira versão
// da correção, que abria a Central; o usuário pediu para tirar essa parte).
//
// Este arquivo trava, lendo o código-fonte real (mesmo padrão dos demais
// *.wiring.test.ts deste projeto — sem infraestrutura de renderização de
// React nos testes), que:
//   1) o estado padrão do botão ("Continuar ciclo") e o estado "sessão do
//      ciclo já ativa" usam `handleContinueCycle`, nunca `handleNavigate`;
//   2) `handleContinueCycle` reutiliza o MESMO `startSession` de sempre
//      (via handleStartStudy — mesmo source=CYCLE/cycleId/cycleItemId/
//      disciplineId, sem lógica paralela nova) — nunca chama
//      `router.push("/ciclos")`;
//   3) `handleContinueCycle` NÃO dispara nenhum evento de abrir a Central
//      (não deve abrir o modal — só o cronômetro);
//   4) quando já existe uma sessão ativa para ESTE ciclo, `handleContinueCycle`
//      nunca inicia uma segunda sessão — no máximo dá resume() se estiver
//      pausada;
//   5) "Iniciar ciclo" (progresso zerado) continua chamando `handleStartStudy`
//      exatamente como antes (comportamento validado, intocado);
//   6) o engine de ciclos (study-cycle) não foi tocado por esta correção.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8")
}

/** Extrai o texto entre duas âncoras literais (inclusive a âncora inicial). */
function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `marcador inicial não encontrado: ${JSON.stringify(startMarker)}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `marcador final não encontrado: ${JSON.stringify(endMarker)}`)
  return source.slice(start, end)
}

const WIDGET_PATH = "src/features/study-cycle/components/intelligent-cycle-widget.tsx"

describe("IntelligentCycleWidget: handleContinueCycle existe, só dá play no cronômetro e reutiliza handleStartStudy/resumeSession", () => {
  const source = readSource(WIDGET_PATH)
  const fn = sliceBetween(
    source,
    "const handleContinueCycle = useCallback(() => {",
    "}, [overview, sessionSummary, handleStartStudy, resumeSession])",
  )

  it("handleContinueCycle nunca chama router.push (não deve navegar para /ciclos)", () => {
    assert.equal(fn.includes("router.push"), false, "handleContinueCycle não deve navegar — deve só dar play no cronômetro")
  })

  it("handleContinueCycle NÃO abre a Central de Estudos (nenhum dispatchEvent de abrir modal)", () => {
    assert.equal(
      fn.includes("open-study-session-modal"),
      false,
      "não deve disparar o evento de abrir a Central — o pedido é só iniciar o cronômetro",
    )
    assert.equal(fn.includes("dispatchEvent"), false, "handleContinueCycle não deve disparar nenhum evento global")
  })

  it("handleContinueCycle não inicia uma segunda sessão quando o ciclo atual já está ativo — no máximo retoma (resumeSession) se estiver pausada", () => {
    assert.ok(
      /isThisCycleActive\s*=\s*Boolean\(sessionSummary\?\.isActive\)\s*&&\s*sessionSummary\?\.cycleId\s*===\s*overview\.cycle\.id/.test(fn),
      "deve checar explicitamente se a sessão ativa já corresponde a este ciclo (sessionSummary.cycleId === overview.cycle.id)",
    )
    assert.ok(
      /if\s*\(isThisCycleActive\)\s*\{/.test(fn),
      "quando a sessão já é deste ciclo, deve entrar num ramo que NÃO chama handleStartStudy de novo",
    )
    assert.ok(fn.includes("resumeSession()"), "deve poder retomar (play) uma sessão pausada deste ciclo via resumeSession()")
  })

  it("handleContinueCycle reutiliza handleStartStudy (mesmo startSession de sempre) — não duplica a chamada a startSession", () => {
    assert.ok(fn.includes("handleStartStudy()"), "deve chamar handleStartStudy() em vez de duplicar a lógica de startSession")
    assert.equal(fn.includes("startSession("), false, "não deve chamar startSession diretamente — só via handleStartStudy (nenhuma lógica paralela)")
  })
})

describe("IntelligentCycleWidget: resumeSession vem do mesmo useStudyActions() já usado no widget", () => {
  it("useStudyActions() desestrutura resumeSession junto de startSession/sessionSummary (não importa um hook novo)", () => {
    const source = readSource(WIDGET_PATH)
    assert.ok(
      source.includes("const { startSession, resumeSession, sessionSummary } = useStudyActions()"),
      "resumeSession deve vir do mesmo useStudyActions() já usado pelo widget",
    )
  })
})

describe("IntelligentCycleWidget: handleStartStudy continua com o mesmo startSession de sempre (comportamento de \"Iniciar ciclo\" intocado)", () => {
  it("source=CYCLE/cycleId/cycleItemId/disciplineId continuam sendo passados", () => {
    const source = readSource(WIDGET_PATH)
    const fn = sliceBetween(source, "const handleStartStudy = useCallback(() => {", "}, [overview, startSession])")
    assert.ok(fn.includes('source: "CYCLE",'))
    assert.ok(fn.includes("cycleId: overview.cycle.id,"))
    assert.ok(fn.includes("cycleItemId: overview.currentItem.itemId,"))
    assert.ok(fn.includes("disciplineId: overview.currentItem.disciplineId,"), "disciplineId deve continuar sendo passado (fonte preferencial de disciplina)")
  })
})

describe("IntelligentCycleWidget: estados do botão usam handleContinueCycle, nunca handleNavigate, fora do estado \"Ver ciclo\"/\"Retomar ciclo\"", () => {
  const source = readSource(WIDGET_PATH)

  const defaultState = sliceBetween(
    source,
    'let buttonLabel = "Continuar ciclo"',
    "if (isPaused) {",
  )

  it('estado padrão ("Continuar ciclo") usa handleContinueCycle como buttonAction', () => {
    assert.ok(defaultState.includes("let buttonAction = handleContinueCycle"))
    assert.equal(defaultState.includes("let buttonAction = handleNavigate"), false)
  })

  const studyingBranch = sliceBetween(source, "} else if (isCurrentStudying) {", "  }\n\n  const content")

  it('estado "sessão do ciclo já em andamento" (isCurrentStudying) usa handleContinueCycle, não handleNavigate', () => {
    assert.ok(studyingBranch.includes("buttonAction = handleContinueCycle"))
    assert.equal(studyingBranch.includes("buttonAction = handleNavigate"), false)
  })

  const freshStartBranch = sliceBetween(
    source,
    "} else if (currentItem.studiedMinutesInRound === 0 && !isCurrentStudying) {",
    "} else if (isCurrentStudying) {",
  )

  it('estado "Iniciar ciclo" (progresso zerado) continua usando handleStartStudy — comportamento já validado, intocado', () => {
    assert.ok(freshStartBranch.includes('buttonLabel = "Iniciar ciclo"'))
    assert.ok(freshStartBranch.includes("buttonAction = handleStartStudy"))
  })

  it('estado "Ver ciclo" (sem currentItem) continua navegando para /ciclos — não há o que estudar', () => {
    const noCurrentItemBranch = sliceBetween(source, "} else if (!currentItem) {", "} else if (currentItem.studiedMinutesInRound === 0")
    assert.ok(noCurrentItemBranch.includes('buttonLabel = "Ver ciclo"'))
    assert.ok(noCurrentItemBranch.includes("buttonAction = handleNavigate"))
  })

  it('estado "Retomar ciclo" (pausado) continua chamando handleResumeCycle — não é sobre sessão de estudo, é sobre o status do ciclo no banco', () => {
    const pausedBranch = sliceBetween(source, "if (isPaused) {", "} else if (!currentItem) {")
    assert.ok(pausedBranch.includes('buttonLabel = "Retomar ciclo"'))
    assert.ok(pausedBranch.includes("buttonAction = handleResumeCycle"))
  })
})

describe("O engine de ciclos permanece intocado por esta correção (regra de congelamento)", () => {
  it("intelligent-cycle-widget.tsx não importa nada de src/application|domain|features/study-cycle/** além das actions e tipos já usados antes", () => {
    const source = readSource(WIDGET_PATH)
    // As únicas dependências do módulo de ciclos que este widget já usava
    // antes da correção continuam sendo as mesmas — nenhuma nova importação
    // de engine (reconciliation, migration, rebuild, cursor) foi adicionada.
    assert.equal(/cycle-reconciliation|migration|rebuild|cursor/i.test(source), false)
  })
})
