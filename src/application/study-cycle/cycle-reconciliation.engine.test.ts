import assert from "node:assert/strict"
import test from "node:test"

import { reconcileCycleFromStudies } from "./cycle-reconciliation.engine"

const items = [
  { id: "a", disciplineId: "discipline-a", disciplineName: "A", targetSeconds: 3600 },
  { id: "b", disciplineId: "discipline-b", disciplineName: "B", targetSeconds: 3600 },
]

test("cycle reconciliation counts every eligible source identically", () => {
  const result = reconcileCycleFromStudies(items, [
    { id: "free", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1800 },
    { id: "imported", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
    { id: "cycle", cycleItemId: "a", disciplineId: "discipline-a", seconds: 600 },
  ])

  assert.equal(result.state.currentItemIndex, 1)
  assert.equal(result.sessions.reduce((sum, session) => sum + session.seconds_contributed, 0), 3600)
})

test("cycle reconciliation is idempotent and preserves imported seconds", () => {
  const studies = [{ id: "imported", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3425 }]
  const once = reconcileCycleFromStudies(items, studies)
  const again = reconcileCycleFromStudies(items, studies)

  assert.deepEqual(again, once)
  assert.equal(once.sessions[0]?.seconds_contributed, 3425)
  assert.equal(once.state.currentItemProgressSeconds, 3425)
})

test("future completion does not move the cursor past the first incomplete item", () => {
  const result = reconcileCycleFromStudies(items, [
    { id: "future", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
  ])

  assert.equal(result.state.currentItemIndex, 0)
})

test("a completed round starts cleanly and never reuses old history", () => {
  const result = reconcileCycleFromStudies(items, [
    { id: "a-1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
    { id: "b-1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
    { id: "a-2", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
  ])

  assert.equal(result.state.totalRoundsDone, 1)
  assert.equal(result.state.currentRound, 2)
  assert.equal(result.state.currentItemIndex, 0)
  assert.equal(result.state.currentItemProgressSeconds, 1200)
  assert.equal(result.sessions[2]?.round_number, 2)
})

test("extra never becomes progress for the next round", () => {
  const result = reconcileCycleFromStudies(items, [
    { id: "a", cycleItemId: "a", disciplineId: "discipline-a", seconds: 5000 },
  ])

  assert.equal(result.sessions[0]?.seconds_contributed, 3600)
  assert.equal(result.sessions[0]?.extra_seconds, 1400)
  assert.equal(result.state.currentItemIndex, 1)
  assert.equal(result.state.currentItemProgressSeconds, 0)
  assert.equal(result.state.currentRound, 1)
})

test("a skipped item stops blocking the cursor without being marked 100%", () => {
  const result = reconcileCycleFromStudies(
    items,
    [{ id: "a-1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 }],
    [{ cycleItemId: "a", roundNumber: 1 }],
  )

  // Cursor moved past the skipped item even though it only has 1200/3600s of real progress.
  assert.equal(result.state.currentItemIndex, 1)
  // The skip never fabricates progress: the real studied seconds are unchanged.
  assert.equal(result.sessions[0]?.seconds_contributed, 1200)
  assert.equal(result.sessions[0]?.extra_seconds, 0)
})

test("skipping every item completes the round even with zero studies", () => {
  const result = reconcileCycleFromStudies(items, [], [
    { cycleItemId: "a", roundNumber: 1 },
    { cycleItemId: "b", roundNumber: 1 },
  ])

  assert.equal(result.state.totalRoundsDone, 1)
  assert.equal(result.state.currentRound, 2)
  assert.equal(result.state.currentItemIndex, 0)
})

test("a skip only applies to the round it was recorded for", () => {
  const result = reconcileCycleFromStudies(
    items,
    [
      { id: "b-1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
      // Completes round 1 (a skipped, b fully studied) and starts round 2.
    ],
    [{ cycleItemId: "a", roundNumber: 1 }],
  )

  assert.equal(result.state.currentRound, 2)
  // In round 2 there is no skip recorded for "a", so it blocks the cursor again.
  assert.equal(result.state.currentItemIndex, 0)
})

test("reconciliation with skips stays idempotent", () => {
  const studies = [{ id: "a-1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 }]
  const skips = [{ cycleItemId: "a", roundNumber: 1 }]
  const once = reconcileCycleFromStudies(items, studies, skips)
  const again = reconcileCycleFromStudies(items, studies, skips)
  assert.deepEqual(again, once)
})

// ─────────────────────────────────────────────────────────────────────────────
// BUG CRÍTICO + AUTOMAÇÃO DEFINITIVA DO CICLO — cenários da Parte 15.
//
// O motor é puro e stateless: ele nunca sabe "o que mudou" entre uma chamada e
// outra, apenas recebe a lista atual de estudos e recalcula tudo do zero. Por
// isso, simular um DELETE/UPDATE/mudança de disciplina é simplesmente chamar
// reconcileCycleFromStudies de novo com a lista já refletindo a mutação — que é
// exatamente o que rebuildForUser faz contra o study_history real. Nenhum teste
// abaixo faz soma/subtração incremental: cada "depois" é um recálculo completo.
// ─────────────────────────────────────────────────────────────────────────────

test("DELETE: remover um estudo reduz o progresso do item e some da lista de sessões", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
    { id: "s2", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
  ])
  assert.equal(before.state.currentItemProgressSeconds, 2400)
  assert.equal(before.sessions.length, 2)

  // "s2" foi excluído do Histórico — a nova lista simplesmente não o contém mais.
  const after = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
  ])
  assert.equal(after.state.currentItemProgressSeconds, 1200)
  assert.equal(after.sessions.length, 1)
  assert.equal(after.sessions.some((s) => s.study_history_id === "s2"), false)
})

test("DELETE: excluir o único estudo que completou um item torna-o incompleto de novo (cursor volta)", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
  ])
  // "a" está satisfeito (100%), cursor já avançou para "b".
  assert.equal(before.state.currentItemIndex, 1)

  const after = reconcileCycleFromStudies(items, [])
  // Sem "a1", "a" nunca foi estudado: o cursor deve voltar para ele, nunca
  // preservar o 100% antigo.
  assert.equal(after.state.currentItemIndex, 0)
  assert.equal(after.state.currentItemProgressSeconds, 0)
})

test("DELETE: excluir um estudo que só gerava 'extra' reduz o extra sem desfazer a conclusão real", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
    { id: "a2", cycleItemId: "a", disciplineId: "discipline-a", seconds: 600 }, // puro extra
  ])
  const extraBefore = before.sessions.reduce((sum, s) => sum + s.extra_seconds, 0)
  assert.equal(extraBefore, 600)
  assert.equal(before.state.currentItemIndex, 1) // "a" completo, cursor em "b"

  const after = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
  ])
  const extraAfter = after.sessions.reduce((sum, s) => sum + s.extra_seconds, 0)
  assert.equal(extraAfter, 0)
  // A conclusão real de "a" não foi destruída por excluir só o estudo extra.
  assert.equal(after.state.currentItemIndex, 1)
  assert.equal(after.sessions.length, 1)
})

test("UPDATE (duração menor, ex.: 60min -> 30min): reduz a contribuição do item, sem duplicar", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
  ])
  assert.equal(before.state.currentItemIndex, 1) // completo com 60min

  // Mesma linha (mesmo id), duração editada para 30min — não é uma nova linha.
  const after = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1800 },
  ])
  assert.equal(after.state.currentItemIndex, 0) // volta a ser incompleto
  assert.equal(after.state.currentItemProgressSeconds, 1800)
  assert.equal(after.sessions.length, 1)
  assert.equal(after.sessions[0]?.study_history_id, "s1")
})

test("UPDATE (duração maior, ex.: 30min -> 60min): aumenta a contribuição do item, sem duplicar", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1800 },
  ])
  assert.equal(before.state.currentItemIndex, 0)

  const after = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
  ])
  assert.equal(after.state.currentItemIndex, 1)
  assert.equal(after.sessions.length, 1)
})

test("UPDATE (troca de disciplina): tempo migra de um item para outro sem duplicar nem sobrar", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
  ])
  const sumFor = (result: ReturnType<typeof reconcileCycleFromStudies>, itemId: string) =>
    result.sessions
      .filter((s) => s.cycle_item_id === itemId)
      .reduce((sum, s) => sum + s.seconds_contributed, 0)

  assert.equal(sumFor(before, "a"), 1200)
  assert.equal(sumFor(before, "b"), 0)

  // O mesmo estudo (s1) foi editado para apontar para a disciplina/item "b".
  const after = reconcileCycleFromStudies(items, [
    { id: "s1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 1200 },
  ])
  assert.equal(sumFor(after, "a"), 0)
  assert.equal(sumFor(after, "b"), 1200)
  assert.equal(after.sessions.length, 1) // continua sendo uma única linha, não duas
})

test("INSERT: um novo estudo aumenta o progresso do ciclo", () => {
  const before = reconcileCycleFromStudies(items, [])
  assert.equal(before.state.currentItemProgressSeconds, 0)

  const after = reconcileCycleFromStudies(items, [
    { id: "n1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 900 },
  ])
  assert.equal(after.state.currentItemProgressSeconds, 900)
})

test("Rebuilds repetidos após um DELETE continuam idempotentes", () => {
  const studiesAfterDelete = [{ id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 }]
  const once = reconcileCycleFromStudies(items, studiesAfterDelete)
  const again = reconcileCycleFromStudies(items, studiesAfterDelete)
  assert.deepEqual(again, once)
})

test("Um simples refresh (recalcular com a mesma lista) nunca muda o resultado", () => {
  const studies = [
    { id: "s1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1800 },
    { id: "s2", cycleItemId: "b", disciplineId: "discipline-b", seconds: 900 },
  ]
  const first = reconcileCycleFromStudies(items, studies)
  const secondCallSameData = reconcileCycleFromStudies(items, studies)
  assert.deepEqual(first, secondCallSameData)
})

test("Múltiplas mutações sequenciais (insert, edit, delete) produzem um estado final determinístico", () => {
  // O estado final depende só do conteúdo atual de study_history, nunca da
  // sequência de mutações que levou até ele — por isso simular o "caminho"
  // (inserir b1, editar a1, excluir b1) e simplesmente construir o resultado
  // final direto devem bater exatamente.
  const finalStudies = [{ id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1800 }]

  const viaSimulatedPath = (() => {
    let list: { id: string; cycleItemId: string; disciplineId: string; seconds: number }[] = [
      { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
    ]
    list = [...list, { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 600 }] // insert
    list = list.map((s) => (s.id === "a1" ? { ...s, seconds: 1800 } : s)) // edit
    list = list.filter((s) => s.id !== "b1") // delete
    return list
  })()

  assert.deepEqual(viaSimulatedPath, finalStudies)
  assert.deepEqual(
    reconcileCycleFromStudies(items, viaSimulatedPath),
    reconcileCycleFromStudies(items, finalStudies),
  )
})

test("DELETE de estudo de uma rodada anterior já concluída pode desfazer a conclusão daquela rodada", () => {
  // Rodada 1 é concluída por a1 (completa "a") + b1 (completa "b"); depois
  // disso, a2 já é progresso da rodada 2.
  const before = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
    { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
    { id: "a2", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
  ])
  assert.equal(before.state.totalRoundsDone, 1)
  assert.equal(before.state.currentRound, 2)
  assert.equal(before.state.currentItemProgressSeconds, 1200)

  // Exclui a1 (o estudo que efetivamente fechou "a" na rodada 1).
  const after = reconcileCycleFromStudies(items, [
    { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
    { id: "a2", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1200 },
  ])
  // A rodada 1 nunca foi realmente concluída sem a1 — o rebuild não pode
  // fingir que ela foi. total_rounds_done e current_round recuam, e a2
  // (que antes "pertencia" à rodada 2) passa a contar como progresso real da
  // rodada 1, porque tudo é recontado do zero, cronologicamente.
  assert.equal(after.state.totalRoundsDone, 0)
  assert.equal(after.state.currentRound, 1)
  assert.equal(after.state.currentItemProgressSeconds, 1200)
  assert.equal(after.sessions.some((s) => s.study_history_id === "a1"), false)
  assert.equal(after.sessions.length, 2)
})

test("DELETE de um contribuinte redundante (extra) de rodada anterior NÃO desfaz a conclusão da rodada", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
    { id: "a1b", cycleItemId: "a", disciplineId: "discipline-a", seconds: 600 }, // extra dentro da rodada 1
    { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
  ])
  assert.equal(before.state.totalRoundsDone, 1)
  assert.equal(before.state.currentRound, 2)

  // Exclui só o estudo "extra" (a1b) — "a" continua legitimamente completo
  // por a1 sozinho, então a rodada 1 continua concluída.
  const after = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600 },
    { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 },
  ])
  assert.equal(after.state.totalRoundsDone, 1)
  assert.equal(after.state.currentRound, 2)
  const extraAfter = after.sessions.reduce((sum, s) => sum + s.extra_seconds, 0)
  assert.equal(extraAfter, 0)
})

test("Skips duráveis continuam válidos após um DELETE em study_history (nunca são derivados dele)", () => {
  const skips = [{ cycleItemId: "a", roundNumber: 1 }]
  const before = reconcileCycleFromStudies(
    items,
    [{ id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600 }],
    skips,
  )
  // "a" satisfeito por skip, "b" satisfeito por estudo real -> rodada 1 completa.
  assert.equal(before.state.totalRoundsDone, 1)

  // Excluindo b1 (o único estudo real), a rodada 1 deixa de estar completa —
  // mas o skip de "a" continua ali, intocado, pronto para a próxima tentativa.
  const after = reconcileCycleFromStudies(items, [], skips)
  assert.equal(after.state.totalRoundsDone, 0)
  assert.equal(after.state.currentItemIndex, 1) // "a" ainda satisfeito pelo skip; cursor vai para "b"
})

// ─────────────────────────────────────────────────────────────────────────────
// FASE CICLO — "Concluir volta" (encerrar manualmente a rodada atual).
//
// PRIMEIRA TENTATIVA (histórico, não usada mais): marcar TODAS as matérias da
// rodada atual com o marcador atemporal de skip (study_cycle_item_skips), o
// mesmo usado por "pular matéria". Os dois primeiros testes abaixo (Caso 1 e
// Caso 3), quando escritos contra essa abordagem, FALHARAM: como isSatisfied()
// não sabe QUANDO o marcador foi criado em relação ao estudo real, marcar
// todos os itens de uma vez fecha a rodada antes de processar estudo real que
// já pertencia a ela, atribuindo esse tempo à rodada seguinte por engano. Isso
// só é seguro no uso original porque lá apenas UM item é pulado por vez, com
// os demais ainda dependendo de progresso real.
//
// IMPLEMENTAÇÃO ATUAL: concludeCurrentCycleRound grava um EVENTO NO TEMPO
// (roundConclusions — ver migration 20260926_cycle_round_conclusions.sql),
// não um marcador atemporal. O motor intercala esse evento cronologicamente
// com os estudos reais (usando startedAt/occurredAt) e só o aplica quando,
// ao alcançá-lo no replay, a rodada nele registrada ainda for a rodada
// corrente — isso é o que impede um clique redundante de fechar duas rodadas
// de uma vez (Caso 3). A transição de rodada em si (advanceCompletedRounds)
// continua sendo exatamente a mesma usada pela conclusão natural — nenhuma
// lógica paralela de avanço de rodada foi criada.
// ─────────────────────────────────────────────────────────────────────────────

test("Concluir volta — Caso 1: rodada parcialmente estudada avança exatamente uma rodada, cursor no primeiro item, 0% na nova volta", () => {
  const before = reconcileCycleFromStudies(items, [
    { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 2592, startedAt: "2026-09-20T10:00:00.000Z" }, // 72% de 3600s
  ])
  assert.equal(before.state.currentRound, 1)
  assert.equal(before.state.currentItemIndex, 0)

  // "Concluir volta": o clique acontece DEPOIS do estudo real já registrado.
  const afterConclude = reconcileCycleFromStudies(
    items,
    [{ id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 2592, startedAt: "2026-09-20T10:00:00.000Z" }],
    [],
    [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }],
  )

  assert.equal(afterConclude.state.totalRoundsDone, 1)
  assert.equal(afterConclude.state.currentRound, 2)
  assert.equal(afterConclude.state.currentItemIndex, 0)
  assert.equal(afterConclude.state.currentItemProgressSeconds, 0)
  // O estudo real de 2592s em "a" continua registrado, intacto, na sessão da
  // rodada 1 — "concluir volta" nunca apaga nem altera estudo real.
  const session = afterConclude.sessions.find((s) => s.study_history_id === "a1")
  assert.equal(session?.seconds_contributed, 2592)
  assert.equal(session?.round_number, 1)
})

test("Concluir volta — Caso 2: nenhum estudo na rodada, ainda assim inicia a próxima rodada corretamente", () => {
  const result = reconcileCycleFromStudies(items, [], [], [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }])

  assert.equal(result.state.currentRound, 2)
  assert.equal(result.state.currentItemIndex, 0)
  assert.equal(result.state.currentItemProgressSeconds, 0)
  assert.equal(result.sessions.length, 0) // nenhuma sessão fabricada — zero estudo real, zero sessão
})

test("Concluir volta — Caso 3: clique redundante (rodada já fechou sozinha por estudo real) não avança duas rodadas", () => {
  // As duas matérias completam a rodada 1 sozinhas, por estudo real, ANTES do
  // clique chegar ao servidor. O servidor lê current_round fresco no momento
  // do clique, então o evento gravado já aponta para a rodada 2 (a que
  // realmente está aberta nesse instante) — não para a 1.
  const result = reconcileCycleFromStudies(
    items,
    [
      { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600, startedAt: "2026-09-20T10:00:00.000Z" },
      { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600, startedAt: "2026-09-20T10:05:00.000Z" },
    ],
    [],
    [{ roundNumber: 2, occurredAt: "2026-09-20T11:00:00.000Z" }],
  )

  // Rodada 1 fechou naturalmente (ambas 100%); o clique força o fechamento da
  // rodada 2 (vazia) em seguida — duas transições no total, mas nenhuma delas
  // duplicada pelo próprio clique.
  assert.equal(result.state.totalRoundsDone, 2)
  assert.equal(result.state.currentRound, 3)
  assert.equal(result.sessions.length, 2) // as duas sessões reais, nada fabricado
})

test("Concluir volta — Caso 3b: evento referenciando uma rodada já superada (stale) é um no-op, nunca fecha duas rodadas", () => {
  // Mesmo cenário do Caso 3, mas simulando um evento "atrasado"/inconsistente
  // que ainda aponta para a rodada 1 mesmo depois dela já ter fechado
  // naturalmente por estudo real antes do evento ser alcançado no replay.
  // O guard `currentRound === roundNumber` deve tratar isso como um no-op.
  const result = reconcileCycleFromStudies(
    items,
    [
      { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 3600, startedAt: "2026-09-20T10:00:00.000Z" },
      { id: "b1", cycleItemId: "b", disciplineId: "discipline-b", seconds: 3600, startedAt: "2026-09-20T10:05:00.000Z" },
    ],
    [],
    [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }],
  )

  assert.equal(result.state.totalRoundsDone, 1) // só o avanço natural, o evento stale não conta
  assert.equal(result.state.currentRound, 2)
  assert.equal(result.sessions.length, 2)
})

test("Concluir volta — Caso 4: ciclo com uma única disciplina avança exatamente uma rodada", () => {
  const oneItem = [{ id: "solo", disciplineId: "discipline-solo", disciplineName: "Solo", targetSeconds: 1800 }]

  const result = reconcileCycleFromStudies(oneItem, [], [], [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }])

  assert.equal(result.state.totalRoundsDone, 1)
  assert.equal(result.state.currentRound, 2)
  assert.equal(result.state.currentItemIndex, 0)
})

test("Concluir volta — Caso 12: o primeiro item da nova volta é exatamente o primeiro item da sequência original (nunca reordena)", () => {
  const result = reconcileCycleFromStudies(items, [], [], [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }])

  // items[0] é "a" — o índice do cursor na nova volta deve apontar para ele.
  assert.equal(result.state.currentItemIndex, 0)
  assert.equal(items[result.state.currentItemIndex]?.id, "a")
})

test("Concluir volta — idempotência: reaplicar o mesmo evento (ex.: rebuild repetido) não avança a rodada de novo", () => {
  const conclusions = [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }]
  const once = reconcileCycleFromStudies(items, [], [], conclusions)
  const again = reconcileCycleFromStudies(items, [], [], conclusions)

  assert.deepEqual(once.state, again.state)
  assert.equal(again.state.currentRound, 2)
})

test("Concluir volta — estudo real registrado DEPOIS do clique é atribuído à rodada nova, nunca à concluída", () => {
  // Este é o teste que prova a correção do bug original: um "concluir volta"
  // seguido de estudo real genuíno não pode "roubar" esse estudo de volta
  // para a rodada que acabou de ser fechada administrativamente.
  const result = reconcileCycleFromStudies(
    items,
    [
      { id: "a1", cycleItemId: "a", disciplineId: "discipline-a", seconds: 1000, startedAt: "2026-09-20T10:00:00.000Z" }, // antes do clique
      { id: "a2", cycleItemId: "a", disciplineId: "discipline-a", seconds: 500, startedAt: "2026-09-20T12:00:00.000Z" }, // depois do clique
    ],
    [],
    [{ roundNumber: 1, occurredAt: "2026-09-20T11:00:00.000Z" }],
  )

  const before = result.sessions.find((s) => s.study_history_id === "a1")
  const after = result.sessions.find((s) => s.study_history_id === "a2")
  assert.equal(before?.round_number, 1)
  assert.equal(after?.round_number, 2)
  assert.equal(result.state.currentRound, 2)
  assert.equal(result.state.currentItemProgressSeconds, 500) // só o estudo pós-conclusão conta na rodada nova
})
