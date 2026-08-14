import assert from "node:assert/strict"
import { test } from "node:test"

import {
  type ReplanBlock,
  type ReplanCapacityDay,
  type ReplanContext,
  type ReplanInput,
  type ReplanSession,
  buildAdjustedDay,
  classifyDay,
  computeDisciplinePendencies,
  computePendingBlocks,
  computeReplan,
  detectCriticalDelay,
  distributePendencies,
  pendingOf,
  pickRecoveryHorizon,
  priorityScoreOf,
  shouldReplan,
} from "./replan-engine.ts"

const TODAY = "2026-08-14"
const YESTERDAY = "2026-08-13"
const TOMORROW = "2026-08-15"
const DAY_AFTER = "2026-08-16"

function block(partial: Partial<ReplanBlock> & { blockId: string }): ReplanBlock {
  return {
    itemId: null,
    disciplineId: "d-1",
    disciplineName: "Direito Tributário",
    scheduledDate: YESTERDAY,
    durationMinutes: 60,
    executionOrder: 1,
    origin: "BASE",
    status: "PENDENTE",
    ...partial,
  }
}

function session(partial: Partial<ReplanSession> & { id: string }): ReplanSession {
  return {
    startedAt: `${YESTERDAY}T09:00:00-03:00`,
    disciplineId: "d-1",
    studyPlanItemId: null,
    durationMinutes: 60,
    ...partial,
  }
}

function context(partial: Partial<ReplanContext> = {}): ReplanContext {
  return {
    todayStr: TODAY,
    disciplineContexts: new Map([["d-1", { weightNorm: 0.6, accuracy: null, overdueReviews: 0 }]]),
    examDaysLeft: null,
    planType: "CICLO_ROTATIVO",
    ...partial,
  }
}

function futureDays(partial: ReplanCapacityDay[] = []): ReplanCapacityDay[] {
  const defaults: ReplanCapacityDay[] = [
    { date: TOMORROW, baseLoadMinutes: 60, maxDailyMinutes: 120 },
    { date: DAY_AFTER, baseLoadMinutes: 60, maxDailyMinutes: 120 },
  ]
  return partial.length > 0 ? partial : defaults
}

function input(partial: Partial<ReplanInput> = {}): ReplanInput {
  return {
    pastBlocks: [block({ blockId: "b-1" })],
    sessions: [],
    futureDays: futureDays(),
    futureBlocksByDate: new Map<string, ReplanBlock[]>(),
    alreadyDistributedBlockIds: new Set<string>(),
    context: context(),
    ...partial,
  }
}

// ============================================================================
// TESTE 1 — DIA 100% CONCLUÍDO → cronograma permanece
// ============================================================================
test("TESTE 1: dia 100% concluído não gera pendência nem reajuste", () => {
  const pastBlocks = [block({ blockId: "b-1", durationMinutes: 60 })]
  const sessions: ReplanSession[] = [
    session({ id: "s-1", studyPlanItemId: "item-1", durationMinutes: 60 }),
  ]
  const withItem = pastBlocks.map((b) => ({ ...b, itemId: "item-1" as string | null }))

  const result = computeReplan(input({ pastBlocks: withItem, sessions }))

  assert.equal(result.ran, false)
  assert.equal(result.reason, "no_pendency")
  assert.equal(result.pendingBlocks.length, 0)
  assert.equal(result.dayStatuses[0]?.classification, "CONCLUIDO")
})

// ============================================================================
// TESTE 2 — DIA 50% CONCLUÍDO → só a pendência é redistribuída
// ============================================================================
test("TESTE 2: dia parcial — somente a matéria pendente entra na fila futura", () => {
  const pastBlocks = [
    block({
      blockId: "b-pt",
      itemId: "item-pt",
      disciplineId: "d-pt",
      disciplineName: "Português",
      executionOrder: 1,
    }),
    block({
      blockId: "b-rlm",
      itemId: "item-rlm",
      disciplineId: "d-rlm",
      disciplineName: "RLM",
      executionOrder: 2,
    }),
  ]
  const sessions: ReplanSession[] = [
    session({ id: "s-1", studyPlanItemId: "item-pt", durationMinutes: 60 }),
    session({ id: "s-2", studyPlanItemId: "item-rlm", durationMinutes: 20 }),
  ]
  const ctx = context({
    disciplineContexts: new Map([
      ["d-pt", { weightNorm: 0.8, accuracy: null, overdueReviews: 0 }],
      ["d-rlm", { weightNorm: 0.8, accuracy: null, overdueReviews: 0 }],
    ]),
  })

  const result = computeReplan(input({ pastBlocks, sessions, context: ctx }))

  assert.equal(result.ran, true)
  assert.equal(result.totalPendingMinutes, 39) // 60 - 20 - 1 de tolerância
  const pendingDisciplines = result.disciplinePendencies.map((p) => p.disciplineName)
  assert.deepEqual(pendingDisciplines, ["RLM"]) // Português NÃO entra
  const assigned = Object.values(result.assignmentsByDate).flat()
  assert.ok(assigned.every((a) => a.disciplineId === "d-rlm"))
})

// ============================================================================
// TESTE 3 — DIA 0% CONCLUÍDO → todas as atividades pendentes entram na fila
// ============================================================================
test("TESTE 3: dia não realizado — todas as atividades entram na fila futura", () => {
  const pastBlocks = [
    block({
      blockId: "b-1",
      itemId: "item-1",
      disciplineId: "d-1",
      disciplineName: "Direito Tributário",
    }),
    block({
      blockId: "b-2",
      itemId: "item-2",
      disciplineId: "d-2",
      disciplineName: "Inglês",
      executionOrder: 2,
    }),
  ]
  const ctx = context({
    disciplineContexts: new Map([
      ["d-1", { weightNorm: 0.6, accuracy: null, overdueReviews: 0 }],
      ["d-2", { weightNorm: 0.5, accuracy: null, overdueReviews: 0 }],
    ]),
  })

  const result = computeReplan(input({ pastBlocks, sessions: [], context: ctx }))

  assert.equal(result.totalPendingMinutes, 118) // 60+60 - 2 de tolerância
  assert.equal(result.disciplinePendencies.length, 2)
  const assignedDisciplines = new Set(
    Object.values(result.assignmentsByDate)
      .flat()
      .map((a) => a.disciplineId),
  )
  assert.ok(assignedDisciplines.has("d-1"))
  assert.ok(assignedDisciplines.has("d-2"))
})

// ============================================================================
// TESTE 4 — PENDÊNCIA > CAPACIDADE DE AMANHÃ → distribuição em múltiplos dias
// ============================================================================
test("TESTE 4: pendência maior que a capacidade de amanhã é distribuída em vários dias", () => {
  const pastBlocks = [
    block({ blockId: "b-1", itemId: "item-1", durationMinutes: 240 }),
    block({ blockId: "b-2", itemId: "item-2", durationMinutes: 60, executionOrder: 2 }),
  ]
  const days = [
    { date: TOMORROW, baseLoadMinutes: 60, maxDailyMinutes: 120 }, // amanhã só comporta +60
    { date: DAY_AFTER, baseLoadMinutes: 60, maxDailyMinutes: 120 },
    { date: "2026-08-17", baseLoadMinutes: 60, maxDailyMinutes: 120 },
    { date: "2026-08-18", baseLoadMinutes: 60, maxDailyMinutes: 120 },
    { date: "2026-08-19", baseLoadMinutes: 60, maxDailyMinutes: 120 },
  ]

  const result = computeReplan(
    input({
      pastBlocks,
      sessions: [],
      futureDays: days,
      futureBlocksByDate: new Map(
        days.map(
          (d) =>
            [d.date, [block({ blockId: `base-${d.date}`, scheduledDate: d.date })]] as [
              string,
              ReplanBlock[],
            ],
        ),
      ),
    }),
  )

  assert.equal(result.ran, true)
  const datesWithAssignment = Object.entries(result.assignmentsByDate)
    .filter(([, a]) => a.length > 0)
    .map(([d]) => d)
  assert.ok(datesWithAssignment.length >= 2, "pendência deve ocupar mais de um dia")
  // Nenhum dia ultrapassa o limite
  for (const [date, assignments] of Object.entries(result.assignmentsByDate)) {
    const base = days.find((d) => d.date === date)?.baseLoadMinutes ?? 0
    const max = days.find((d) => d.date === date)?.maxDailyMinutes ?? 120
    const load = base + assignments.reduce((acc, a) => acc + a.minutes, 0)
    assert.ok(load <= max, `dia ${date} não pode passar de ${max}`)
  }
  // Nenhuma pendência ficou sem lugar
  assert.equal(result.unscheduledMinutes, 0)
})

// ============================================================================
// TESTE 5 — SESSÃO MANUAL EQUIVALENTE → não duplicar pendência
// ============================================================================
test("TESTE 5: sessão manual cobre o bloco planejado sem duplicar pendência", () => {
  const pastBlocks = [block({ blockId: "b-1", itemId: "item-1", durationMinutes: 60 })]
  const sessions: ReplanSession[] = [
    session({ id: "s-1", studyPlanItemId: null, durationMinutes: 60 }),
  ]

  const pendings = computePendingBlocks(pastBlocks, sessions)
  assert.equal(pendings.length, 0, "sessão manual não pode gerar pendência")

  const result = computeReplan(input({ pastBlocks, sessions }))
  assert.equal(result.ran, false)
})

// ============================================================================
// TESTE 6 — SESSÃO INICIADA PELO CRONOGRAMA → vínculo direto ao bloco
// ============================================================================
test("TESTE 6: sessão do cronômetro vincula direto ao bloco (estudado 47min → pendente 13min)", () => {
  const pastBlocks = [block({ blockId: "b-1", itemId: "item-1", durationMinutes: 60 })]
  const sessions: ReplanSession[] = [
    session({ id: "s-1", studyPlanItemId: "item-1", durationMinutes: 47 }),
  ]

  const pendings = computePendingBlocks(pastBlocks, sessions)
  assert.equal(pendings.length, 1)
  assert.equal(pendings[0]?.realizedMinutes, 47)
  assert.equal(pendings[0]?.pendingMinutes, 12) // 60 - 47 - 1 tolerância

  const result = computeReplan(input({ pastBlocks, sessions }))
  assert.equal(result.totalPendingMinutes, 12)
})

// ============================================================================
// TESTE 7 — REPLANEJAR DUAS VEZES → não duplicar atividades
// ============================================================================
test("TESTE 7: replanejar duas vezes não duplica atividades", () => {
  const pastBlocks = [block({ blockId: "b-1", itemId: "item-1", durationMinutes: 60 })]
  const baseInput = input({ pastBlocks, sessions: [], futureDays: futureDays() })

  // 1ª execução: pendência vai para a fila
  const first = computeReplan(baseInput)
  assert.equal(first.ran, true)
  const assignedIds = Object.values(first.assignmentsByDate)
    .flat()
    .map((a) => a.pendingBlockId)

  // 2ª execução: a mesma pendência JÁ foi distribuída → não pode ser agendada de novo
  const second = computeReplan(
    input({
      pastBlocks,
      sessions: [],
      alreadyDistributedBlockIds: new Set(assignedIds),
    }),
  )
  assert.equal(second.ran, true, "pendência ainda existe, mas não pode ser duplicada")
  const secondAssigned = Object.values(second.assignmentsByDate).flat()
  assert.equal(secondAssigned.length, 0, "pendência já distribuída não pode ser agendada novamente")
})

// ============================================================================
// TESTE 8 — PROVA PRÓXIMA → respeita limite temporal (horizonte agressivo)
// ============================================================================
test("TESTE 8: prova próxima reduz o horizonte de recuperação", () => {
  const near = pickRecoveryHorizon({
    totalPendingMinutes: 300,
    futureCapacitySum: 300,
    critical: false,
    examDaysLeft: 5,
  })
  assert.equal(near, 2)
  const far = pickRecoveryHorizon({
    totalPendingMinutes: 300,
    futureCapacitySum: 300,
    critical: false,
    examDaysLeft: 60,
  })
  assert.equal(far, 5)
})

// ============================================================================
// TESTE 9 — REVISÃO ATRASADA → prioridade especial
// ============================================================================
test("TESTE 9: disciplina com revisão atrasada tem prioridade maior", () => {
  const a = priorityScoreOf({
    weightNorm: 0.6,
    accuracy: null,
    overdueReviews: 8,
    delayDays: 1,
    examDaysLeft: null,
    planType: "CICLO_ROTATIVO",
  })
  const b = priorityScoreOf({
    weightNorm: 0.6,
    accuracy: null,
    overdueReviews: 0,
    delayDays: 1,
    examDaysLeft: null,
    planType: "CICLO_ROTATIVO",
  })
  assert.ok(a > b, "revisão atrasada deve elevar a prioridade")

  const pendencies = computeDisciplinePendencies(
    [
      {
        blockId: "b-1",
        itemId: null,
        disciplineId: "d-1",
        disciplineName: "Sem Revisão",
        scheduledDate: YESTERDAY,
        plannedMinutes: 60,
        realizedMinutes: 0,
        pendingMinutes: 59,
      },
      {
        blockId: "b-2",
        itemId: null,
        disciplineId: "d-2",
        disciplineName: "Com Revisão",
        scheduledDate: YESTERDAY,
        plannedMinutes: 60,
        realizedMinutes: 0,
        pendingMinutes: 59,
      },
    ],
    context({
      disciplineContexts: new Map([
        ["d-1", { weightNorm: 0.6, accuracy: null, overdueReviews: 0 }],
        ["d-2", { weightNorm: 0.6, accuracy: null, overdueReviews: 8 }],
      ]),
    }),
  )
  assert.equal(pendencies[0]?.disciplineName, "Com Revisão")
})

// ============================================================================
// TESTE 10 — AUTOMAÇÃO DESATIVADA → sistema apenas informa pendências
// ============================================================================
test("TESTE 10: automação OFF só roda com disparo manual", () => {
  assert.equal(shouldReplan(false, "AUTO"), false)
  assert.equal(shouldReplan(false, "DAY_CLOSE"), false)
  assert.equal(shouldReplan(false, "MANUAL"), true)
  assert.equal(shouldReplan(true, "AUTO"), true)
})

// ============================================================================
// TESTES COMPLEMENTARES
// ============================================================================

test("tolerância: 59m58s vs 60min não é atraso", () => {
  const pastBlocks = [block({ blockId: "b-1", itemId: "item-1", durationMinutes: 60 })]
  const sessions: ReplanSession[] = [
    session({ id: "s-1", studyPlanItemId: "item-1", durationMinutes: 60 }),
  ]
  const pendings = computePendingBlocks(pastBlocks, sessions, 1)
  assert.equal(pendings.length, 0)
})

test("pendência nunca é negativa", () => {
  assert.equal(pendingOf(60, 120), 0)
  assert.equal(pendingOf(60, 0), 59)
  assert.equal(pendingOf(0, 0), 0)
})

test("classificação de dias: CONCLUIDO / PARCIAL / NÃO REALIZADO", () => {
  assert.equal(classifyDay(180, 180), "CONCLUIDO")
  assert.equal(classifyDay(180, 100), "PARCIAL")
  assert.equal(classifyDay(180, 0), "NAO_REALIZADO")
})

test("reordenar dia mantém variedade (sem disciplina repetida consecutiva)", () => {
  const base = [
    block({
      blockId: "x1",
      disciplineId: "d-pt",
      disciplineName: "Português",
      scheduledDate: TOMORROW,
      executionOrder: 1,
    }),
    block({
      blockId: "x2",
      disciplineId: "d-rlm",
      disciplineName: "RLM",
      scheduledDate: TOMORROW,
      executionOrder: 2,
    }),
  ]
  const adjusted = buildAdjustedDay({
    date: TOMORROW,
    baseBlocks: base,
    assignments: [
      {
        pendingBlockId: "b-1",
        itemId: null,
        disciplineId: "d-pt",
        disciplineName: "Português",
        minutes: 30,
      },
    ],
  })
  const sequence = [...adjusted.baseBlocks, ...adjusted.assignments].map((x) => x.disciplineId)
  for (let i = 1; i < sequence.length; i++) {
    assert.notEqual(sequence[i], sequence[i - 1], "não pode ter disciplina repetida consecutiva")
  }
})

test("dia 100% não entra no replanejamento (sem blocos passados → ran=false)", () => {
  const result = computeReplan(input({ pastBlocks: [] }))
  assert.equal(result.ran, false)
})

test("dias parciais consecutivos suficientes disparam recuperação crítica", () => {
  const statuses = [
    {
      date: "2026-08-10",
      plannedMinutes: 60,
      realizedMinutes: 0,
      classification: "NAO_REALIZADO" as const,
      pendingMinutes: 60,
    },
    {
      date: "2026-08-11",
      plannedMinutes: 60,
      realizedMinutes: 0,
      classification: "NAO_REALIZADO" as const,
      pendingMinutes: 60,
    },
    {
      date: "2026-08-12",
      plannedMinutes: 60,
      realizedMinutes: 0,
      classification: "NAO_REALIZADO" as const,
      pendingMinutes: 60,
    },
  ]
  assert.equal(detectCriticalDelay(statuses), true)
  const light = statuses.map((s) => ({ ...s, classification: "PARCIAL" as const }))
  assert.equal(detectCriticalDelay(light), false)
})

test("distribuição respeita limite diário mesmo com pendência enorme", () => {
  const pendings = [
    {
      blockId: "b-1",
      itemId: null,
      disciplineId: "d-1",
      disciplineName: "Matéria",
      scheduledDate: YESTERDAY,
      plannedMinutes: 600,
      realizedMinutes: 0,
      pendingMinutes: 599,
    },
  ]
  const days = futureDays()
  const { assignmentsByDate, unscheduledMinutes } = distributePendencies({
    pendingBlocks: pendings,
    futureDays: days,
    futureBlocksByDate: new Map(days.map((d) => [d.date, []])),
    alreadyDistributedBlockIds: new Set(),
    horizonDays: 2,
  })
  const totalAssigned = Object.values(assignmentsByDate)
    .flat()
    .reduce((acc, a) => acc + a.minutes, 0)
  assert.ok(totalAssigned + unscheduledMinutes === 599, "tudo deve ser contabilizado")
  for (const [date, assignments] of Object.entries(assignmentsByDate)) {
    const max = days.find((d) => d.date === date)?.maxDailyMinutes ?? 120
    const load = assignments.reduce((acc, a) => acc + a.minutes, 0)
    assert.ok(load <= max)
  }
})

test("horizonte leve: pendência ≤ 25% da carga futura → 1-2 dias", () => {
  assert.equal(
    pickRecoveryHorizon({
      totalPendingMinutes: 60,
      futureCapacitySum: 300,
      critical: false,
      examDaysLeft: null,
    }),
    2,
  )
  assert.equal(
    pickRecoveryHorizon({
      totalPendingMinutes: 200,
      futureCapacitySum: 300,
      critical: false,
      examDaysLeft: null,
    }),
    5,
  )
})

test("prova próxima aumenta agressividade (horizonte curto) — sem criar bola de neve", () => {
  const result = computeReplan(
    input({
      pastBlocks: [block({ blockId: "b-1", itemId: "item-1", durationMinutes: 180 })],
      sessions: [],
      context: context({ examDaysLeft: 7, planType: "CRONOGRAMA_SEMANAL" }),
    }),
  )
  assert.equal(result.horizonDays, 2)
  assert.ok(result.ran)
})
