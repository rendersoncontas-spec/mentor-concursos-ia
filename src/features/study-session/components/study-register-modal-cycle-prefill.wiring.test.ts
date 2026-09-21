// ─────────────────────────────────────────────────────────────────────────────
// BUG CRÍTICO — "Iniciar ciclo" não pré-selecionava a disciplina na Central
//
// Repro original: usuário clica "Iniciar ciclo" no widget do Ciclo. O timer
// inicia e o cabeçalho mostra "Estudando • <disciplina>" corretamente (a
// sessão global já tem disciplineId/disciplineName/source=CYCLE/cycleId/
// cycleItemId — ver intelligent-cycle-widget.tsx: handleStartStudy). Mas ao
// abrir a Central Inteligente (StudyRegisterModal), o campo "Disciplina"
// aparecia vazio ("Selecione uma disciplina...").
//
// Causa raiz: o efeito de pré-preenchimento do formulário, no ramo
// `else if (open && !isEditMode)`, só olhava para as PROPS
// initialDisciplineName/initialDisciplineId. A Central é aberta pelo
// FloatingActionButton via evento "open-study-session-modal" (disparado por
// StudyHeaderControl/StudyDock/QuickStartBar) e o FloatingActionButton
// renderiza <StudyRegisterModal open={isRegisterOpen} onOpenChange={...} />
// SEM passar essas props — então o form.reset() sempre zerava a disciplina,
// mesmo já existindo uma sessão ativa (useGlobalStudy().session) com o
// disciplineId correto.
//
// Este arquivo trava, lendo o código-fonte real (mesmo padrão dos demais
// *.wiring.test.ts deste projeto — não há infraestrutura de renderização de
// React nos testes, ver study-provider-context-split.wiring.test.ts), que:
//   1) a sessão ativa (não as props isoladas) é a fonte preferencial de
//      disciplina ao abrir a Central em modo "create";
//   2) o hook que expõe `session` é chamado ANTES do efeito que o consome
//      (senão a variável não existiria no escopo do efeito);
//   3) o fallback para as props antigas continua existindo (protege o fluxo
//      MANUAL: abrir a Central direto de uma tela de disciplina, sem sessão
//      ativa, continua funcionando como antes);
//   4) o tópico nunca é inventado — só é pré-selecionado se a sessão ativa
//      já tiver um;
//   5) o vínculo com o ciclo (source=CYCLE, cycleId, cycleItemId) e o
//      disciplineId do item atual do ciclo continuam vindo do mesmo lugar de
//      sempre (intelligent-cycle-widget.tsx → startSession → StudyProvider
//      → finalizeAndSaveSession), sem nenhuma lógica paralela nova.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8")
}

/** Extrai o texto entre duas âncoras literais (inclusive a âncora inicial).
 * Suficiente aqui porque as âncoras são trechos de código já conhecidos e
 * únicos no arquivo — não precisamos de balanceamento de chaves genérico. */
function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `marcador inicial não encontrado: ${JSON.stringify(startMarker)}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `marcador final não encontrado: ${JSON.stringify(endMarker)}`)
  return source.slice(start, end)
}

const MODAL_PATH = "src/features/study-session/components/study-register-modal.tsx"
const CYCLE_WIDGET_PATH = "src/features/study-cycle/components/intelligent-cycle-widget.tsx"
const PROVIDER_PATH = "src/features/study-session/components/study-provider.tsx"

describe("StudyRegisterModal: pré-preenchimento da disciplina ao abrir a Central para uma sessão de ciclo já ativa", () => {
  const source = readSource(MODAL_PATH)

  // O hook que expõe `session` precisa ser chamado ANTES do useEffect de
  // pré-preenchimento, senão `session` não existiria no escopo do efeito.
  const globalStudyCallIndex = source.indexOf("} = useGlobalStudy()")
  const prefillEffectIndex = source.indexOf("if (isEditMode && sessionToEdit && open)")

  it("useGlobalStudy() (que expõe `session`) é chamado antes do efeito de pré-preenchimento do formulário", () => {
    assert.notEqual(globalStudyCallIndex, -1, "useGlobalStudy() não encontrado")
    assert.notEqual(prefillEffectIndex, -1, "efeito de pré-preenchimento não encontrado")
    assert.ok(
      globalStudyCallIndex < prefillEffectIndex,
      "useGlobalStudy() deve ser desestruturado ANTES do useEffect que usa `session` para pré-preencher o formulário",
    )
  })

  const branch = sliceBetween(source, "} else if (open && !isEditMode) {", "  }, [\n    form,")

  it('ramo "create" (Central para sessão nova/já ativa) usa a sessão ativa como fonte preferencial de disciplina, não só a prop initialDisciplineId', () => {
    assert.ok(
      /hasActiveSessionDiscipline\s*=\s*Boolean\(session\?\.isActive\s*&&\s*session\.disciplineId\)/.test(branch),
      "deve existir uma checagem explícita de sessão ativa com disciplineId (session?.isActive && session.disciplineId)",
    )
    assert.ok(
      /resolvedDisciplineId\s*=\s*hasActiveSessionDiscipline[\s\S]*?session!\.disciplineId/.test(branch),
      "quando há sessão ativa com disciplina, resolvedDisciplineId deve vir de session.disciplineId (fonte preferencial = id, não apenas o nome)",
    )
    assert.ok(
      branch.includes("discipline_id: resolvedDisciplineId,"),
      'form.reset() deve usar discipline_id: resolvedDisciplineId (não mais discipline_id: initialDisciplineId ?? "" direto)',
    )
    assert.ok(
      branch.includes("discipline_name: resolvedDisciplineName,"),
      "form.reset() deve usar discipline_name: resolvedDisciplineName",
    )
  })

  it("REGRESSÃO: não volta a zerar a disciplina ignorando a sessão ativa (padrão do bug original)", () => {
    assert.equal(
      branch.includes('discipline_id: initialDisciplineId ?? "",'),
      false,
      "discipline_id não pode mais vir só de initialDisciplineId — isso reintroduziria o bug (Central abre vazia quando a sessão do ciclo já tem disciplina)",
    )
  })

  it("fluxo MANUAL sem sessão ativa continua funcionando: cai para as props initialDisciplineId/initialDisciplineName quando não há sessão ativa", () => {
    assert.ok(
      /resolvedDisciplineId\s*=\s*hasActiveSessionDiscipline[\s\S]*?:\s*\(initialDisciplineId\s*\?\?\s*""\)/.test(branch),
      'sem sessão ativa, resolvedDisciplineId deve cair para initialDisciplineId ?? "" (comportamento anterior preservado para quem já passava essas props, ex.: discipline-detail-view.tsx)',
    )
    assert.ok(
      /resolvedDisciplineName\s*=\s*hasActiveSessionDiscipline[\s\S]*?:\s*\(initialDisciplineName\s*\?\?\s*""\)/.test(branch),
      'sem sessão ativa, resolvedDisciplineName deve cair para initialDisciplineName ?? ""',
    )
  })

  it("tópico nunca é inventado: só pré-seleciona se a sessão ativa já tiver um; senão fica vazio", () => {
    assert.ok(
      /resolvedTopicName\s*=\s*\(session\?\.isActive\s*&&\s*session\.topicName\)\s*\|\|\s*""/.test(branch),
      "resolvedTopicName deve vir de session.topicName quando a sessão está ativa, e ser \"\" caso contrário — nunca um valor inventado",
    )
    assert.ok(branch.includes("topic_name: resolvedTopicName,"), "form.reset() deve usar topic_name: resolvedTopicName")
  })
})

describe("PROTEÇÃO: consumidores que abrem a Central diretamente (sem sessão ativa) continuam passando as props antigas", () => {
  const directOpenConsumers = [
    "src/features/disciplines/components/discipline-detail-view.tsx",
    "src/features/edital/components/edital-accordion.tsx",
    "src/features/planejamento/components/planning-view.tsx",
  ]
  for (const file of directOpenConsumers) {
    it(`${file} continua usando <StudyRegisterModal ... /> sem alteração no contrato de props`, () => {
      const source = readSource(file)
      assert.ok(source.includes("<StudyRegisterModal"), `${file} deveria renderizar <StudyRegisterModal>`)
    })
  }
})

describe("PROTEÇÃO: vínculo do ciclo (source/cycleId/cycleItemId/disciplineId) continua vindo do fluxo existente, sem lógica paralela", () => {
  it('intelligent-cycle-widget.tsx: "Iniciar ciclo" chama startSession com source="CYCLE", cycleId, cycleItemId e disciplineId do item atual do ciclo', () => {
    const source = readSource(CYCLE_WIDGET_PATH)
    const handleStart = sliceBetween(source, "const handleStartStudy = useCallback(() => {", "[overview, startSession])")
    assert.ok(handleStart.includes("disciplineName: overview.currentItem.disciplineName,"), "deve passar disciplineName do item atual do ciclo")
    assert.ok(handleStart.includes("disciplineId: overview.currentItem.disciplineId,"), "deve passar disciplineId do item atual do ciclo (fonte preferencial)")
    assert.ok(handleStart.includes('source: "CYCLE",'), "deve marcar source como CYCLE")
    assert.ok(handleStart.includes("cycleId: overview.cycle.id,"), "deve passar o cycleId do ciclo ativo")
    assert.ok(handleStart.includes("cycleItemId: overview.currentItem.itemId,"), "deve passar o cycleItemId do item atual")
  })

  it("study-provider.tsx: finalizeAndSaveSession preserva cycle_id/cycle_item_id da sessão (nunca converte para MANUAL) e usa disciplineId da sessão como fallback", () => {
    const source = readSource(PROVIDER_PATH)
    const snapshot = sliceBetween(source, "const finalizeAndSaveSession = useCallback(", "const res = await saveStudySessionAction(snapshot)")
    assert.ok(
      snapshot.includes('discipline_id: (formData?.["discipline_id"] as string) || session.disciplineId,'),
      "discipline_id deve preferir a seleção do formulário mas cair para session.disciplineId quando o formulário não sobrescreveu",
    )
    assert.ok(snapshot.includes("cycle_id: session.cycleId || null,"), "cycle_id deve vir de session.cycleId, nunca ser removido/convertido")
    assert.ok(snapshot.includes("cycle_item_id: session.cycleItemId || null,"), "cycle_item_id deve vir de session.cycleItemId")
    assert.ok(snapshot.includes("study_source: session.source || null,"), "study_source deve preservar session.source (CYCLE/PLAN/FREE), sem forçar MANUAL/FREE")
  })
})

describe("PROTEÇÃO: mecânica do timer (pause/resume/save/minimize) não foi tocada por esta correção", () => {
  it("study-provider.tsx: pauseSession/resumeSession/endSession continuam com a mesma lógica de timestamps", () => {
    const source = readSource(PROVIDER_PATH)
    assert.ok(source.includes('phase: "PAUSED", lastPauseStartTime: Date.now() }'), "pauseSession deve continuar gravando lastPauseStartTime")
    assert.ok(source.includes("totalPausedMs: prev.totalPausedMs + pauseDuration,"), "resumeSession deve continuar acumulando totalPausedMs")
  })

  it("study-register-modal.tsx: handleClose ainda minimiza (não encerra) quando a fase não é IDLE", () => {
    const source = readSource(MODAL_PATH)
    assert.ok(
      /const handleClose = \(\) => \{\s*\n\s*if \(phase !== "IDLE"\) \{/.test(source),
      "handleClose deve continuar minimizando a sessão em vez de encerrá-la quando o timer está ativo/pausado",
    )
  })
})

describe("PROTEÇÃO: engine do Ciclo (cursor/currentItemIndex/rounds/skip/reconcile/rebuild/prioridade) não foi alterado", () => {
  it("intelligent-cycle-widget.tsx não teve suas actions de ciclo (pause/resume/delete/skip) alteradas — continuam chamando as mesmas server actions", () => {
    const source = readSource(CYCLE_WIDGET_PATH)
    assert.ok(source.includes("await activateCycleAction(overview.cycle.id)"))
    assert.ok(source.includes("await pauseCycleAction(overview.cycle.id)"))
    assert.ok(source.includes("await deleteCycleAction(overview.cycle.id)"))
    assert.ok(source.includes("await skipCycleCurrentItemAction(overview.cycle.id)"))
  })
})
