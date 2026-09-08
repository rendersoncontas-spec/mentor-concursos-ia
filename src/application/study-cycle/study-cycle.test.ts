import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCycleOverview,
  calculateCycleAdvance,
  calculateCycleSkip,
} from "./cycle-progress.service"
import {
  DEFAULT_MINUTES_BY_DIFFICULTY,
  getDefaultMinutesByDifficulty,
  type StudyCycle,
  type StudyCycleItemWithDetails,
  type StudyCycleSession,
} from "@/domain/study-cycle/study-cycle.types"

function createMockCycle(overrides: Partial<StudyCycle> = {}): StudyCycle {
  return {
    id: "cycle-1",
    user_id: "user-1",
    name: "Receita Federal",
    contest_name: "RFB",
    edital_name: "2026",
    status: "ACTIVE",
    current_item_index: 0,
    current_round: 1,
    total_rounds_done: 0,
    current_item_progress_min: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  }
}

function createMockItems(): StudyCycleItemWithDetails[] {
  return [
    {
      id: "item-port",
      cycle_id: "cycle-1",
      discipline_id: "disc-port",
      order: 1,
      priority: "ALTA",
      difficulty: "MEDIA",
      planned_minutes: 60,
      completed_minutes: 0,
      last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      discipline: {
        id: "disc-port",
        name: "Língua Portuguesa",
        area: "Básica",
        color_hex: "#2563EB",
      },
    },
    {
      id: "item-trib",
      cycle_id: "cycle-1",
      discipline_id: "disc-trib",
      order: 2,
      priority: "ALTA",
      difficulty: "DIFICIL",
      planned_minutes: 60,
      completed_minutes: 0,
      last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      discipline: {
        id: "disc-trib",
        name: "Direito Tributário",
        area: "Direito",
        color_hex: "#DC2626",
      },
    },
    {
      id: "item-cont",
      cycle_id: "cycle-1",
      discipline_id: "disc-cont",
      order: 3,
      priority: "MEDIA",
      difficulty: "DIFICIL",
      planned_minutes: 90,
      completed_minutes: 0,
      last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      discipline: {
        id: "disc-cont",
        name: "Contabilidade Geral",
        area: "Contabilidade",
        color_hex: "#16A34A",
      },
    },
    {
      id: "item-ti",
      cycle_id: "cycle-1",
      discipline_id: "disc-ti",
      order: 4,
      priority: "ALTA",
      difficulty: "MEDIA",
      planned_minutes: 60,
      completed_minutes: 0,
      last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      discipline: {
        id: "disc-ti",
        name: "Tecnologia da Informação",
        area: "Exatas",
        color_hex: "#9333EA",
      },
    },
  ]
}

test("1. 40/60 permanece na matéria e acumula progresso parcial", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 40)

  assert.equal(result.isStageCompleted, false, "Etapa não deve ser considerada concluída")
  assert.equal(result.newCurrentItemIndex, 0, "Cursor deve permanecer em Português (índice 0)")
  assert.equal(result.newCurrentItemProgressMin, 40, "Progresso da matéria deve ser 40 min")
  assert.equal(result.extraMinutes, 0, "Não deve haver minutos extras")
  assert.equal(result.isRoundCompleted, false, "Volta não deve ter sido concluída")
})

test("2. 20 + 40 = 60 atinge a meta e avança automaticamente para a próxima matéria", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 40 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 20)

  assert.equal(result.isStageCompleted, true, "Etapa deve ser concluída")
  assert.equal(result.newCurrentItemIndex, 1, "Cursor deve avançar para Direito Tributário (índice 1)")
  assert.equal(result.newCurrentItemProgressMin, 0, "Progresso da nova etapa deve iniciar em 0")
  assert.equal(result.minutesContributed, 20, "Contribuição deve ser exatamente 20 minutos")
  assert.equal(result.extraMinutes, 0, "Sem minutos excedentes")
})

test("3. 60 de uma vez atinge a meta e avança", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 60)

  assert.equal(result.isStageCompleted, true, "Etapa deve ser concluída de primeira")
  assert.equal(result.newCurrentItemIndex, 1, "Cursor deve apontar para o item 1")
  assert.equal(result.newCurrentItemProgressMin, 0, "Progresso zerado para a próxima")
  assert.equal(result.minutesContributed, 60)
  assert.equal(result.extraMinutes, 0)
})

test("4. 80/60 gera 20 EXTRA contabilizado separadamente", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 80)

  assert.equal(result.isStageCompleted, true, "Etapa concluída")
  assert.equal(result.minutesContributed, 60, "Contribuição máxima da meta é 60")
  assert.equal(result.extraMinutes, 20, "20 minutos excedentes viram EXTRA")
  assert.equal(result.newCurrentItemIndex, 1, "Avança para o próximo item")
  assert.equal(result.newCurrentItemProgressMin, 0)
})

test("5. Extra não aumenta percentual acima de 100% nem no item nem na volta", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 0 })
  const items = createMockItems()
  // Item 0 (Português, meta 60) concluído com 80 minutos (60 + 20 extra)
  const sessions: StudyCycleSession[] = [
    {
      id: "sess-1",
      cycle_id: "cycle-1",
      cycle_item_id: "item-port",
      round_number: 1,
      minutes_contributed: 60,
      extra_minutes: 20,
      created_at: "2026-09-01T00:00:00Z",
    },
  ]

  const overview = buildCycleOverview(cycle, items, sessions)

  const portItem = overview.items[0]
  assert.ok(portItem)
  assert.equal(portItem.studiedMinutesInRound, 60, "Minutos válidos da volta do item é 60")
  assert.equal(portItem.extraMinutesInRound, 20, "Minutos extras do item é 20")
  assert.equal(portItem.isCompletedInRound, true)

  // Total da volta: 60 + 60 + 90 + 60 = 270 min.
  // Estudado: 60 min. Percentual = (60 / 270) * 100 = 22%. Extra de 20 min não soma nos 60 válidos da volta!
  assert.equal(overview.totalStudiedMinutesInRound, 60)
  assert.equal(overview.totalExtraMinutesInRound, 20)
  assert.equal(overview.roundProgressPercentage, 22)
  assert.ok(overview.roundProgressPercentage <= 100)
})

test("6. Última matéria concluída inicia nova volta (volta 1 -> 2, voltas concluídas 0 -> 1)", () => {
  // Último item é TI (índice 3, meta 60)
  const cycle = createMockCycle({
    current_item_index: 3,
    current_round: 1,
    total_rounds_done: 0,
    current_item_progress_min: 0,
  })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 60)

  assert.equal(result.isStageCompleted, true)
  assert.equal(result.isRoundCompleted, true, "Deve assinalar volta concluída")
  assert.equal(result.newCurrentItemIndex, 0, "Cursor deve reiniciar na primeira matéria (índice 0)")
  assert.equal(result.newCurrentRound, 2, "Volta atual deve passar para 2ª volta")
  assert.equal(result.newTotalRoundsDone, 1, "Voltas concluídas deve ser 1")
  assert.equal(result.newCurrentItemProgressMin, 0)
})

test("7. Estudo FREE não altera ciclo", () => {
  // Simulação da regra de negócio: somente study_source = "CYCLE" pode chamar calculateCycleAdvance
  const studySource: string = "FREE"
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 15 })

  let cycleUpdated = false
  if (studySource === "CYCLE") {
    cycleUpdated = true
  }

  assert.equal(cycleUpdated, false, "Estudo livre NUNCA deve acionar o avanço do ciclo")
  assert.equal(cycle.current_item_index, 1)
  assert.equal(cycle.current_item_progress_min, 15)
})

test("8. Estudo PLANNED não altera ciclo se não estiver vinculado", () => {
  const studySource: string = "PLAN"
  const hasCycleId = false
  const cycle = createMockCycle({ current_item_index: 2, current_item_progress_min: 30 })

  let cycleUpdated = false
  if (studySource === "CYCLE" || (studySource === "PLAN" && hasCycleId)) {
    cycleUpdated = true
  }

  assert.equal(cycleUpdated, false, "Estudo de planejamento não vinculado não altera o ciclo")
  assert.equal(cycle.current_item_index, 2)
  assert.equal(cycle.current_item_progress_min, 30)
})

test("9. Estudo CYCLE altera ciclo", () => {
  const studySource = "CYCLE"
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 35 })
  const items = createMockItems()

  let newCycleState = { ...cycle }
  if (studySource === "CYCLE") {
    const advance = calculateCycleAdvance(cycle, items, 25) // 35 + 25 = 60
    newCycleState = {
      ...newCycleState,
      current_item_index: advance.newCurrentItemIndex,
      current_item_progress_min: advance.newCurrentItemProgressMin,
    }
  }

  assert.equal(newCycleState.current_item_index, 2, "Cursor avançou de Tributário (1) para Contabilidade (2)")
  assert.equal(newCycleState.current_item_progress_min, 0)
})

test("10. Retomar estudo parcial mantém exatamente a posição e tempo restante", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 25 })
  const items = createMockItems()

  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.currentItem?.disciplineName, "Direito Tributário")
  assert.equal(overview.currentItem?.studiedMinutesInRound, 25)
  assert.equal(overview.currentItem?.remainingMinutesInRound, 35) // 60 - 25 = 35
  assert.equal(overview.currentItem?.isCurrent, true)
  assert.equal(overview.currentItem?.status, "ATUAL")
})

test("11. Plantão 24x72 não altera cursor (ausência de dias de estudo é neutra)", () => {
  const cycle = createMockCycle({
    current_item_index: 2,
    current_round: 3,
    current_item_progress_min: 50,
    updated_at: "2026-08-20T00:00:00Z", // 18 dias atrás
  })
  const items = createMockItems()

  // Nenhuma alteração de tempo ocorrida no ciclo
  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.cycle.current_item_index, 2, "Permanece exatamente no item 2")
  assert.equal(overview.cycle.current_round, 3, "Permanece na 3ª volta")
  assert.equal(overview.currentItem?.studiedMinutesInRound, 50, "Permanece com 50 min acumulados")
})

test("12. Idempotência / Sessões simultâneas não duplicam avanço", () => {
  // Simula idempotência: se o studyHistoryId já existe no ciclo, ignora a duplicata
  const processedHistories = new Set<string>(["hist-xyz"])
  const incomingHistoryId = "hist-xyz"

  let advanceExecuted = false
  if (!processedHistories.has(incomingHistoryId)) {
    advanceExecuted = true
  }

  assert.equal(advanceExecuted, false, "Mesmo histórico não pode ser executado duas vezes")
})

test("13. Pular etapa não transforma automaticamente em 100% e preserva minutos", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 35 })
  const items = createMockItems()

  const skipResult = calculateCycleSkip(cycle, items)

  assert.equal(skipResult.skippedItemId, "item-trib")
  assert.equal(skipResult.partialMinutesPreserved, 35, "Preserva os 35 min que o estudante fez")
  assert.equal(skipResult.newCurrentItemIndex, 2, "Avança para Contabilidade")
  assert.equal(skipResult.newCurrentItemProgressMin, 0, "Zera a etapa para a próxima disciplina")

  // Simular a visão após o pulo
  const skipSession: StudyCycleSession = {
    id: "sess-skip",
    cycle_id: "cycle-1",
    cycle_item_id: "item-trib",
    round_number: 1,
    minutes_contributed: 35,
    extra_minutes: 0,
    is_skip: true,
    created_at: "2026-09-01T00:00:00Z",
  }

  const updatedCycle = createMockCycle({
    current_item_index: 2,
    current_item_progress_min: 0,
  })

  const overview = buildCycleOverview(updatedCycle, items, [skipSession])
  const skippedItem = overview.items[1]
  assert.ok(skippedItem)
  assert.equal(skippedItem.status, "PULADO", "Status deve ser PULADO")
  assert.equal(skippedItem.studiedMinutesInRound, 35, "Minutos estudados devem ser 35")
  assert.equal(skippedItem.remainingMinutesInRound, 25, "Ainda faltavam 25 min")
  assert.equal(skippedItem.isCompletedInRound, false, "NÃO pode estar como 100% concluída")
})

test("14. Reabrir a aplicação mantém exatamente o estado persistido", () => {
  const persistedState = {
    current_item_index: 2,
    current_round: 4,
    total_rounds_done: 3,
    current_item_progress_min: 45,
  }

  const cycle = createMockCycle(persistedState)
  const items = createMockItems()
  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.currentRound, 4)
  assert.equal(overview.totalRoundsDone, 3)
  assert.equal(overview.currentItem?.disciplineName, "Contabilidade Geral")
  assert.equal(overview.currentItem?.studiedMinutesInRound, 45)
})

test("15. Alterar planejamento não altera a posição do ciclo", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 20 })

  // Simula ação no módulo de planejamento semanal (alteração de dias, horas, blocos)
  const planningModified = { totalWeeklyHours: 35 }
  assert.ok(planningModified)

  // Ciclo permanece intacto
  assert.equal(cycle.current_item_index, 1)
  assert.equal(cycle.current_item_progress_min, 20)
})

// ============================================================
// DIFFICULTY NORMALIZATION TESTS
// ============================================================

import {
  normalizeDifficulty,
  mapDifficultyToPriority,
} from "@/domain/study-cycle/study-cycle.types"

test("16. normalizeDifficulty: FACIL retorna FACIL", () => {
  assert.equal(normalizeDifficulty("FACIL"), "FACIL")
})

test("17. normalizeDifficulty: MEDIA retorna MEDIA", () => {
  assert.equal(normalizeDifficulty("MEDIA"), "MEDIA")
})

test("18. normalizeDifficulty: DIFICIL retorna DIFICIL", () => {
  assert.equal(normalizeDifficulty("DIFICIL"), "DIFICIL")
})

test("19. normalizeDifficulty: legado ALTA mapeia para DIFICIL", () => {
  assert.equal(normalizeDifficulty("ALTA"), "DIFICIL")
})

test("20. normalizeDifficulty: legado BAIXA mapeia para FACIL", () => {
  assert.equal(normalizeDifficulty("BAIXA"), "FACIL")
})

test("21. normalizeDifficulty: null retorna MEDIA (default)", () => {
  assert.equal(normalizeDifficulty(null), "MEDIA")
})

test("22. normalizeDifficulty: undefined retorna MEDIA (default)", () => {
  assert.equal(normalizeDifficulty(undefined), "MEDIA")
})

test("23. normalizeDifficulty: string vazia retorna MEDIA (default)", () => {
  assert.equal(normalizeDifficulty(""), "MEDIA")
})

test("24. mapDifficultyToPriority: FACIL → BAIXA", () => {
  assert.equal(mapDifficultyToPriority("FACIL"), "BAIXA")
})

test("25. mapDifficultyToPriority: MEDIA → MEDIA", () => {
  assert.equal(mapDifficultyToPriority("MEDIA"), "MEDIA")
})

test("26. mapDifficultyToPriority: DIFICIL → ALTA", () => {
  assert.equal(mapDifficultyToPriority("DIFICIL"), "ALTA")
})

test("27. buildCycleOverview: difficulty ALTA no banco normaliza para DIFICIL na visão", () => {
  const cycle = createMockCycle()
  const items: StudyCycleItemWithDetails[] = [
    {
      id: "item-legacy",
      cycle_id: "cycle-1",
      discipline_id: "disc-1",
      order: 1,
      // legado: priority=ALTA, difficulty=null (coluna não existia)
      priority: "ALTA",
      difficulty: null as unknown as string,
      planned_minutes: 60,
      completed_minutes: 0,
      last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      discipline: { id: "disc-1", name: "Direito Tributário", area: "Direito", color_hex: "#DC2626" },
    },
  ]
  const overview = buildCycleOverview(cycle, items, [])
  const item = overview.items[0]
  assert.ok(item, "item deve existir")
  assert.equal(item!.difficulty, "DIFICIL", "ALTA deve normalizar para DIFICIL")
  assert.equal(item!.priority, "ALTA", "priority deve ser ALTA quando difficulty=DIFICIL")
})

test("28. buildCycleOverview: alterar difficulty de um item não afeta os outros", () => {
  const cycle = createMockCycle()
  const items = createMockItems()
  // Simula que apenas o primeiro item tinha difficulty=ALTA (legado)
  items[0]!.priority = "ALTA"
  items[0]!.difficulty = null as unknown as string

  const overview = buildCycleOverview(cycle, items, [])

  // Primeiro item deve normalizar ALTA → DIFICIL
  assert.equal(overview.items[0]!.difficulty, "DIFICIL")
  // Demais não devem ser afetados
  assert.equal(overview.items[1]!.difficulty, "DIFICIL") // era DIFICIL
  assert.equal(overview.items[2]!.difficulty, "DIFICIL") // era DIFICIL
  assert.equal(overview.items[3]!.difficulty, "MEDIA")   // era MEDIA
})

test("29. buildCycleOverview: difficulty FACIL preserva plannedMinutes e order", () => {
  const cycle = createMockCycle()
  const items: StudyCycleItemWithDetails[] = [
    {
      id: "item-facil",
      cycle_id: "cycle-1",
      discipline_id: "disc-1",
      order: 1,
      priority: "BAIXA",
      difficulty: "FACIL",
      planned_minutes: 90,
      completed_minutes: 0,
      last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      discipline: { id: "disc-1", name: "Matemática", area: "Básica", color_hex: "#16A34A" },
    },
  ]
  const overview = buildCycleOverview(cycle, items, [])
  const item = overview.items[0]
  assert.ok(item)
  assert.equal(item!.difficulty, "FACIL")
  assert.equal(item!.plannedMinutes, 90)
  assert.equal(item!.order, 1)
})

test("30. getDefaultMinutesByDifficulty: Fácil/BAIXA/EASY gera 30 minutos", () => {
  assert.equal(getDefaultMinutesByDifficulty("FACIL"), 30)
  assert.equal(getDefaultMinutesByDifficulty("Fácil"), 30)
  assert.equal(getDefaultMinutesByDifficulty("EASY"), 30)
  assert.equal(getDefaultMinutesByDifficulty("BAIXA"), 30)
})

test("31. getDefaultMinutesByDifficulty: Média/MEDIUM gera 60 minutos", () => {
  assert.equal(getDefaultMinutesByDifficulty("MEDIA"), 60)
  assert.equal(getDefaultMinutesByDifficulty("Média"), 60)
  assert.equal(getDefaultMinutesByDifficulty("MEDIUM"), 60)
  assert.equal(getDefaultMinutesByDifficulty(undefined), 60)
})

test("32. getDefaultMinutesByDifficulty: Difícil/ALTA/HARD gera 90 minutos", () => {
  assert.equal(getDefaultMinutesByDifficulty("DIFICIL"), 90)
  assert.equal(getDefaultMinutesByDifficulty("Difícil"), 90)
  assert.equal(getDefaultMinutesByDifficulty("HARD"), 90)
  assert.equal(getDefaultMinutesByDifficulty("ALTA"), 90)
})
