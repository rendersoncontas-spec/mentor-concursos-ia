// ─────────────────────────────────────────────────────────────────────────────
// FASE CICLO — "Concluir volta" (encerrar manualmente a rodada atual e
// iniciar a próxima do zero, sem fabricar estudo).
//
// Mesmo padrão wiring dos demais *.wiring.test.ts deste projeto: sem
// infraestrutura de renderização de React/DB nos testes — o contrato é
// travado lendo o código-fonte real. O comportamento determinístico do
// motor (avanço de rodada via evento de conclusão ordenado no tempo) já é
// validado em cycle-reconciliation.engine.test.ts ("Concluir volta —
// Caso N"); este arquivo garante que a camada de Server Action/UI:
//   1) nunca aceita userId do cliente (sempre getEffectiveUserId);
//   2) confirma posse do ciclo (.eq("user_id", userId));
//   3) rejeita ciclo inexistente/de outro usuário/inativo/sem matérias;
//   4) nunca cria study_history nem toca em revisões/planejamento/metas;
//   5) reutiliza o rebuild central (rebuildActiveCycleProgress) — nenhuma
//      lógica paralela de avanço de rodada;
//   6) grava só um evento em study_cycle_round_conclusions (migration
//      20260926_cycle_round_conclusions.sql — tabela nova mínima, aditiva,
//      aprovada explicitamente pelo usuário após o gap de arquitetura ter
//      sido encontrado e relatado) — nunca reaproveita
//      study_cycle_item_skips (esse marcador é atemporal, e marcar TODOS os
//      itens de uma rodada de uma vez com ele quebra o replay — ver
//      comentário de concludeCurrentCycleRound);
//   7) a UI exige confirmação antes de executar e desabilita o botão durante
//      a chamada (evita duplo clique).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8")
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `marcador inicial não encontrado: ${JSON.stringify(startMarker)}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `marcador final não encontrado: ${JSON.stringify(endMarker)}`)
  return source.slice(start, end)
}

// concludeCurrentCycleRound é a última função exportada do arquivo (nada a
// seguir), então não há um "\nexport async function" seguinte para servir de
// marcador final — esta variante fatia até o fim do arquivo.
function sliceToEnd(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `marcador inicial não encontrado: ${JSON.stringify(startMarker)}`)
  return source.slice(start)
}

const SERVICE_PATH = "src/application/study-cycle/cycle-study-registration.service.ts"
const ACTIONS_PATH = "src/application/study-cycle/study-cycle.actions.ts"
const PANEL_PATH = "src/features/study-cycle/components/active-cycle-panel.tsx"

describe("concludeCurrentCycleRound: segurança (usuário efetivo, posse, estado do ciclo)", () => {
  const source = readSource(SERVICE_PATH)
  const fn = sliceToEnd(
    source,
    "export async function concludeCurrentCycleRound(cycleId: string): Promise<ConcludeCycleRoundResult> {",
  )

  it("resolve o usuário via getEffectiveUserId — nunca aceita userId do cliente", () => {
    assert.ok(fn.includes("getEffectiveUserId(supabase)"))
    assert.equal(/function concludeCurrentCycleRound\([^)]*userId/.test(source), false, "não deve receber userId como parâmetro")
  })

  it("confirma posse do ciclo com .eq(\"user_id\", userId) na leitura do ciclo", () => {
    const cycleLookup = sliceBetween(fn, 'from("study_cycles")', ".maybeSingle()")
    assert.ok(cycleLookup.includes('.eq("id", cycleId)'))
    assert.ok(cycleLookup.includes('.eq("user_id", userId)'))
  })

  it("rejeita quando o ciclo não existe", () => {
    assert.ok(fn.includes("if (!cycle)"))
  })

  it("rejeita quando o ciclo não está ACTIVE (pausado/concluído/arquivado)", () => {
    assert.ok(fn.includes('cycle.status !== "ACTIVE"'))
  })

  it("rejeita quando o ciclo não tem matérias", () => {
    assert.ok(fn.includes("!items || items.length === 0"))
  })
})

describe("concludeCurrentCycleRound: nunca fabrica estudo, nunca duplica lógica de avanço de rodada", () => {
  const source = readSource(SERVICE_PATH)
  const fn = sliceToEnd(
    source,
    "export async function concludeCurrentCycleRound(cycleId: string): Promise<ConcludeCycleRoundResult> {",
  )

  it("nunca escreve em study_history (não registra estudo)", () => {
    assert.equal(fn.includes("study_history"), false)
  })

  it("nunca escreve em study_cycles diretamente (current_round/current_item_index não são mutados aqui)", () => {
    assert.equal(/\.from\(\s*"study_cycles"\s*\)\s*\.update/.test(fn), false)
  })

  it("nunca escreve em study_cycle_sessions diretamente (delega ao RPC central via rebuild)", () => {
    assert.equal(/\.from\(\s*"study_cycle_sessions"\s*\)\s*\.(insert|update|delete|upsert)/.test(fn), false)
  })

  it("grava um evento durável de conclusão de rodada em study_cycle_round_conclusions (não reaproveita study_cycle_item_skips)", () => {
    assert.ok(fn.includes('.from("study_cycle_round_conclusions")'))
    assert.ok(fn.includes(".upsert("))
    assert.ok(fn.includes('onConflict: "cycle_id,round_number"'))
    assert.ok(fn.includes("ignoreDuplicates: true"))
    assert.equal(fn.includes("study_cycle_item_skips"), false, "não deve marcar itens como pulados — isso quebra o replay temporal (ver Caso 1/3)")
  })

  it("delega o avanço de rodada inteiramente ao rebuild central (mesma transição usada pela conclusão natural)", () => {
    assert.ok(fn.includes("await rebuildActiveCycleProgress()"))
  })

  it("aplica o marcador à rodada lida do servidor (cycle.current_round), nunca a uma rodada vinda do cliente", () => {
    assert.ok(fn.includes("cycle.current_round"))
  })
})

describe("Módulo inteiro: 'Concluir volta' nunca toca Revisões, Planejamento ou Metas", () => {
  it("cycle-study-registration.service.ts não referencia review_item, review_history, study_plan ou goals/metas", () => {
    const source = readSource(SERVICE_PATH)
    assert.equal(/review_item|review_history|review_queue|review_session/i.test(source), false)
    assert.equal(/study_plan_item|study_plans\b/i.test(source), false)
    assert.equal(/from\(\s*"goals"\s*\)|from\(\s*"user_targets"\s*\)/i.test(source), false)
  })
})

describe("concludeCycleRoundAction: wrapper fino, mesmo padrão de skipCycleCurrentItemAction", () => {
  const source = readSource(ACTIONS_PATH)

  it("importa concludeCurrentCycleRound do serviço central (não duplica lógica na camada de action)", () => {
    assert.ok(source.includes("concludeCurrentCycleRound"))
    assert.ok(source.includes('from "./cycle-study-registration.service"'))
  })

  it("concludeCycleRoundAction chama concludeCurrentCycleRound e revalida as mesmas rotas de sempre", () => {
    const fn = sliceBetween(
      source,
      "export async function concludeCycleRoundAction(cycleId: string) {",
      "\nexport async function",
    )
    assert.ok(fn.includes("await concludeCurrentCycleRound(cycleId)"))
    assert.ok(fn.includes('revalidatePath("/ciclos")'))
    assert.ok(fn.includes('revalidatePath("/dashboard")'))
  })
})

describe("UI (/dashboard/ciclos via ActiveCyclePanel): confirmação obrigatória e proteção contra duplo clique", () => {
  const source = readSource(PANEL_PATH)

  it("o clique no botão 'Concluir volta' abre confirmação — não executa a ação diretamente", () => {
    const buttonBlock = sliceBetween(
      source,
      "Concluir volta",
      "{onSelectAnotherCycle &&",
    )
    assert.equal(buttonBlock.includes("concludeCycleRoundAction("), false, "o botão não deve chamar a action direto, só abrir a confirmação")
    assert.ok(source.includes("onClick={() => setShowConcludeConfirm(true)}"))
  })

  it("handleConcludeRound ignora chamadas repetidas enquanto uma já está em andamento (guard de duplo clique)", () => {
    const fn = sliceBetween(
      source,
      "const handleConcludeRound = useCallback(async () => {",
      "}, [cycle.id, isConcluding, onRefresh])",
    )
    assert.ok(/if\s*\(isConcluding\)\s*return/.test(fn))
    assert.ok(fn.includes("setIsConcluding(true)"))
    assert.ok(fn.includes("await concludeCycleRoundAction(cycle.id)"))
  })

  it("o botão de confirmar fica desabilitado durante a chamada (isConcluding)", () => {
    const confirmBlock = sliceBetween(
      source,
      "DIÁLOGO DE CONFIRMAÇÃO — concluir volta manualmente",
      "</Card>\n        </div>\n      )}",
    )
    assert.ok(confirmBlock.includes("disabled={isConcluding}"))
  })

  it("feedback de sucesso é neutro ('Nova volta iniciada.'), nunca afirma que todas as matérias foram concluídas", () => {
    assert.ok(source.includes('toast.success("Nova volta iniciada.")'))
    assert.equal(source.includes("Você concluiu todas as matérias"), false)
  })

  it("o texto de confirmação deixa claro que nenhum tempo de estudo é adicionado e o histórico é preservado", () => {
    const confirmBlock = sliceBetween(
      source,
      "DIÁLOGO DE CONFIRMAÇÃO — concluir volta manualmente",
      "</Card>\n        </div>\n      )}",
    )
    assert.ok(confirmBlock.includes("serão preservados"))
    assert.ok(confirmBlock.includes("Nenhum tempo de estudo será adicionado"))
  })
})

describe("Engine de ciclos permanece a única transição de rodada (nenhuma lógica paralela)", () => {
  it("cycle-study-registration.service.ts não reimplementa advanceCompletedRounds/reconcileCycleFromStudies — só chama rebuildActiveCycleProgress", () => {
    const source = readSource(SERVICE_PATH)
    const fn = sliceToEnd(
      source,
      "export async function concludeCurrentCycleRound(cycleId: string): Promise<ConcludeCycleRoundResult> {",
    )
    assert.equal(fn.includes("current_round + 1"), false)
    assert.equal(fn.includes("currentRound + 1"), false)
    assert.equal(/current_round\s*[:=]\s*\d/.test(fn), false)
  })
})
