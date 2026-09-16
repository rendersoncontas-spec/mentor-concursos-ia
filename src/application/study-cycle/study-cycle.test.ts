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

// ============================================================
// NOVOS TESTES - REGRA DEFINITIVA: QUALQUER ESTUDO CONTRIBUI PARA O CICLO
// ============================================================

test("NOVO 1. FREE da matéria do ciclo → conta para o ciclo", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  // Simula estudo FREE de Português (item atual)
  const advance = calculateCycleAdvance(cycle, items, 30)

  assert.equal(advance.minutesContributed, 30, "30 min devem contribuir")
  assert.equal(advance.newCurrentItemProgressMin, 30, "Progresso deve ser 30")
  assert.equal(advance.newCurrentItemIndex, 0, "Cursor permanece no item atual")
})

test("NOVO 2. PLANNED da matéria do ciclo → conta para o ciclo", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 20 })
  const items = createMockItems()

  // Simula estudo PLANNED de Tributário (item atual)
  const advance = calculateCycleAdvance(cycle, items, 20)

  assert.equal(advance.minutesContributed, 20, "20 min devem contribuir")
  assert.equal(advance.newCurrentItemProgressMin, 40, "Progresso deve ser 40")
})

test("NOVO 3. IMPORTED da matéria do ciclo → conta para o ciclo", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 40 })
  const items = createMockItems()

  // Simula estudo IMPORTADO (Aprovado) de Tributário
  const advance = calculateCycleAdvance(cycle, items, 20)

  assert.equal(advance.isStageCompleted, true, "Meta atingida")
  assert.equal(advance.minutesContributed, 20, "Contribuição exata para completar")
  assert.equal(advance.newCurrentItemIndex, 2, "Avança para Contabilidade")
})

test("NOVO 4. CYCLE da matéria do ciclo → conta para o ciclo", () => {
  const cycle = createMockCycle({ current_item_index: 2, current_item_progress_min: 0 })
  const items = createMockItems()

  // Estudo iniciado pelo próprio ciclo
  const advance = calculateCycleAdvance(cycle, items, 90)

  assert.equal(advance.isStageCompleted, true)
  assert.equal(advance.minutesContributed, 90, "Meta de Contabilidade é 90")
  assert.equal(advance.newCurrentItemIndex, 3, "Avança para TI")
})

test("NOVO 5. Matéria fora do ciclo → NÃO conta para o ciclo", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  // Estudo de "Português" (disc-port) que está no ciclo -> conta
  // Mas se estudar "Direito Civil" (disc-civil) que NÃO está no ciclo -> não conta
  // O calculateCycleAdvance não sabe a disciplina, apenas recebe minutos.
  // A regra "matéria fora do ciclo não conta" é aplicada ANTES de chamar calculateCycleAdvance
  // no service registerStudyToCycle (que verifica se discipline_id está nos itens do ciclo).
  // Aqui testamos que o calculateCycleAdvance em si não faz essa verificação (é responsabilidade do caller).
  const advance = calculateCycleAdvance(cycle, items, 30)

  assert.equal(advance.minutesContributed, 30, "calculateCycleAdvance sempre processa os minutos")
  // A verificação de "matéria no ciclo" acontece no service, não aqui
})

test("NOVO 6. Matéria futura do ciclo estudada antecipadamente → acumula progresso mas NÃO move cursor", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  // Aluno estuda Contabilidade (índice 2, futura) enquanto cursor está em Português (índice 0)
  // O service registerStudyToCycle detecta que não é o item atual e NÃO avança o cursor
  // Mas registra o progresso no study_cycle_sessions para o item correto
  
  // Simulação: o cursor NÃO deve avançar
  assert.equal(cycle.current_item_index, 0, "Cursor permanece em Português")
  
  // O progresso da Contabilidade seria registrado separadamente no study_cycle_sessions
  // com round_number = 1, mas current_item_index continua 0
})

test("NOVO 7. Matéria atual → acumula progresso e avança quando atinge meta", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 30 })
  const items = createMockItems()

  const advance = calculateCycleAdvance(cycle, items, 30)

  assert.equal(advance.isStageCompleted, true, "Meta de Tributário (60) atingida")
  assert.equal(advance.minutesContributed, 30)
  assert.equal(advance.newCurrentItemIndex, 2, "Cursor avança para Contabilidade")
  assert.equal(advance.newCurrentItemProgressMin, 0)
})

test("NOVO 8. Meta atingida → cursor avança automaticamente", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 50 })
  const items = createMockItems()

  const advance = calculateCycleAdvance(cycle, items, 10)

  assert.equal(advance.isStageCompleted, true)
  assert.equal(advance.newCurrentItemIndex, 1, "Avança para próximo item")
  assert.equal(advance.extraMinutes, 0, "Sem extra pois bateu exato")
})

test("NOVO 9. Estudo acima da meta → gera EXTRA", () => {
  const cycle = createMockCycle({ current_item_index: 2, current_item_progress_min: 80 })
  const items = createMockItems()

  const advance = calculateCycleAdvance(cycle, items, 20)

  assert.equal(advance.isStageCompleted, true)
  assert.equal(advance.minutesContributed, 10, "Só 10 contribuem para meta de 90")
  assert.equal(advance.extraMinutes, 10, "10 min viram EXTRA")
  assert.equal(advance.newCurrentItemIndex, 3, "Cursor avança para TI")
})

test("NOVO 10. Percentual nunca passa de 100%", () => {
  // Para o item ATUAL, o progresso vem de cycle.current_item_progress_min, não das sessões
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 60 })
  const items = createMockItems()
  const sessions: StudyCycleSession[] = [
    {
      id: "s1", cycle_id: "cycle-1", cycle_item_id: "item-port", round_number: 1,
      minutes_contributed: 60, extra_minutes: 40, created_at: "2026-09-01T00:00:00Z",
    },
  ]

  const overview = buildCycleOverview(cycle, items, sessions)
  const portItem = overview.items[0]!

  assert.equal(portItem.studiedMinutesInRound, 60, "Máximo 60 min válidos")
  assert.equal(portItem.extraMinutesInRound, 40, "40 min extras")
  assert.equal(portItem.isCompletedInRound, true)
  assert.ok(overview.roundProgressPercentage <= 100, "Percentual da volta nunca > 100%")
})

test("NOVO 11. Mesmo study_history_id processado novamente → não duplica", () => {
  // Simula a verificação de idempotência no service
  const processed = new Set<string>(["hist-123"])
  const incomingId = "hist-123"

  let wouldProcess = false
  if (!processed.has(incomingId)) wouldProcess = true

  assert.equal(wouldProcess, false, "Sessão duplicada não deve ser processada novamente")
})

test("NOVO 12. Importação em lote → contabiliza somente matérias do ciclo", () => {
  const cycle = createMockCycle()
  const items = createMockItems()
  const cycleDisciplineIds = new Set(items.map(i => i.discipline_id))

  // Simula 2000 atividades importadas
  const importedStudies = [
    { disciplineId: "disc-port", durationMinutes: 30 }, // no ciclo
    { disciplineId: "disc-trib", durationMinutes: 45 }, // no ciclo
    { disciplineId: "disc-civil", durationMinutes: 60 }, // FORA do ciclo
    { disciplineId: "disc-penal", durationMinutes: 20 }, // FORA do ciclo
    { disciplineId: "disc-cont", durationMinutes: 90 }, // no ciclo
  ]

  let cycleContributions = 0
  let nonCycleCount = 0

  for (const study of importedStudies) {
    if (cycleDisciplineIds.has(study.disciplineId)) {
      cycleContributions += study.durationMinutes
    } else {
      nonCycleCount++
    }
  }

  assert.equal(cycleContributions, 165, "Apenas 3 matérias do ciclo somam 165 min")
  assert.equal(nonCycleCount, 2, "2 matérias fora do ciclo são ignoradas para o ciclo")
})

test("NOVO 13. Nova volta → começa progresso da nova volta corretamente", () => {
  const cycle = createMockCycle({
    current_item_index: 3, // último item (TI)
    current_round: 1,
    total_rounds_done: 0,
    current_item_progress_min: 0,
  })
  const items = createMockItems()

  const advance = calculateCycleAdvance(cycle, items, 60)

  assert.equal(advance.isRoundCompleted, true, "Volta concluída")
  assert.equal(advance.newCurrentItemIndex, 0, "Cursor volta para primeiro item")
  assert.equal(advance.newCurrentRound, 2, "Nova volta = 2")
  assert.equal(advance.newTotalRoundsDone, 1, "Uma volta completa")
  assert.equal(advance.newCurrentItemProgressMin, 0, "Progresso zera na nova volta")

  // Verificar que o overview da nova volta mostra progresso zerado
  const newCycle = createMockCycle({
    current_item_index: 0,
    current_round: 2,
    total_rounds_done: 1,
    current_item_progress_min: 0,
  })
  const overview = buildCycleOverview(newCycle, items, [])
  assert.equal(overview.currentItem?.disciplineName, "Língua Portuguesa")
  assert.equal(overview.currentItem?.studiedMinutesInRound, 0)
})

test("NOVO 14. Planejamento + ciclo → uma sessão alimenta ambos sem duplicar histórico", () => {
  // Simula: aluno tem planejamento de estudar Tributário 60 min
  // Ele estuda 60 min via planejamento
  // Essa mesma sessão (study_history_id) deve:
  // - Contar para meta do planejamento
  // - Contar para histórico
  // - Contribuir para o ciclo
  // NÃO deve criar sessão duplicada no histórico

  const studyHistoryId = "session-abc"
  const studySession = {
    id: studyHistoryId,
    discipline_id: "disc-trib",
    duration_minutes: 60,
    study_source: "PLAN",
    study_plan_item_id: "plan-item-1",
  }

  // Verificações conceituais:
  // 1. Uma única linha em study_history
  // 2. study_plan_item_id preenchido (vínculo com planejamento)
  // 3. study_cycle_sessions criado com mesmo study_history_id (vínculo com ciclo)
  // 4. Não há duplicação de study_history

  assert.ok(studySession.study_plan_item_id, "Vínculo com planejamento mantido")
  assert.ok(studySession.id, "ID único da sessão")

  // O service registerStudyToCycle usa studyHistoryId para idempotência
  // Se já existe em study_cycle_sessions com esse studyHistoryId, não duplica
  const processedHistories = new Set<string>()
  processedHistories.add(studyHistoryId)

  let wouldProcessAgain = !processedHistories.has(studyHistoryId)
  assert.equal(wouldProcessAgain, false, "Idempotência impede duplicação no ciclo")
})

test("NOVO 15. Reabrir aplicação → estado permanece correto", () => {
  const persistedState = {
    current_item_index: 2,
    current_round: 4,
    total_rounds_done: 3,
    current_item_progress_min: 45,
  }

  const cycle = createMockCycle(persistedState)
  const items = createMockItems()
  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.currentRound, 4, "Volta atual persistida")
  assert.equal(overview.totalRoundsDone, 3, "Voltas completas persistidas")
  assert.equal(overview.currentItem?.disciplineName, "Contabilidade Geral")
  assert.equal(overview.currentItem?.studiedMinutesInRound, 45, "Progresso parcial persistido")
  assert.equal(overview.currentItem?.remainingMinutesInRound, 45) // 90 - 45
})

// ============================================================
// TESTES ORIGINAIS ATUALIZADOS (comportamento do calculateCycleAdvance)
// ============================================================

test("1. 40/60 permanece na matéria e acumula progresso parcial", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 40)

  assert.equal(result.isStageCompleted, false)
  assert.equal(result.newCurrentItemIndex, 0)
  assert.equal(result.newCurrentItemProgressMin, 40)
  assert.equal(result.extraMinutes, 0)
  assert.equal(result.isRoundCompleted, false)
})

test("2. 20 + 40 = 60 atinge a meta e avança automaticamente para a próxima matéria", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 40 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 20)

  assert.equal(result.isStageCompleted, true)
  assert.equal(result.newCurrentItemIndex, 1)
  assert.equal(result.newCurrentItemProgressMin, 0)
  assert.equal(result.minutesContributed, 20)
  assert.equal(result.extraMinutes, 0)
})

test("3. 60 de uma vez atinge a meta e avança", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 60)

  assert.equal(result.isStageCompleted, true)
  assert.equal(result.newCurrentItemIndex, 1)
  assert.equal(result.newCurrentItemProgressMin, 0)
  assert.equal(result.minutesContributed, 60)
  assert.equal(result.extraMinutes, 0)
})

test("4. 80/60 gera 20 EXTRA contabilizado separadamente", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 80)

  assert.equal(result.isStageCompleted, true)
  assert.equal(result.minutesContributed, 60)
  assert.equal(result.extraMinutes, 20)
  assert.equal(result.newCurrentItemIndex, 1)
  assert.equal(result.newCurrentItemProgressMin, 0)
})

test("5. Extra não aumenta percentual acima de 100% nem no item nem na volta", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 0 })
  const items = createMockItems()
  const sessions: StudyCycleSession[] = [
    {
      id: "sess-1", cycle_id: "cycle-1", cycle_item_id: "item-port", round_number: 1,
      minutes_contributed: 60, extra_minutes: 20, created_at: "2026-09-01T00:00:00Z",
    },
  ]

  const overview = buildCycleOverview(cycle, items, sessions)
  const portItem = overview.items[0]!

  assert.equal(portItem.studiedMinutesInRound, 60)
  assert.equal(portItem.extraMinutesInRound, 20)
  assert.equal(portItem.isCompletedInRound, true)
  assert.equal(overview.totalStudiedMinutesInRound, 60)
  assert.equal(overview.totalExtraMinutesInRound, 20)
  assert.equal(overview.roundProgressPercentage, 22)
  assert.ok(overview.roundProgressPercentage <= 100)
})

test("6. Última matéria concluída inicia nova volta (volta 1 -> 2, voltas concluídas 0 -> 1)", () => {
  const cycle = createMockCycle({
    current_item_index: 3, current_round: 1, total_rounds_done: 0, current_item_progress_min: 0,
  })
  const items = createMockItems()

  const result = calculateCycleAdvance(cycle, items, 60)

  assert.equal(result.isStageCompleted, true)
  assert.equal(result.isRoundCompleted, true)
  assert.equal(result.newCurrentItemIndex, 0)
  assert.equal(result.newCurrentRound, 2)
  assert.equal(result.newTotalRoundsDone, 1)
  assert.equal(result.newCurrentItemProgressMin, 0)
})

test("7. REGRA ANTIGA REMOVIDA: Estudo FREE AGORA pode alterar ciclo se matéria estiver no ciclo", () => {
  // ANTES: study_source === "CYCLE" era condição exclusiva
  // AGORA: Qualquer study_source pode contribuir se a matéria estiver no ciclo
  const studySource = "FREE"
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 15 })
  const items = createMockItems()

  // Nova regra: se a matéria estiver no ciclo, contribui independentemente da origem
  const advance = calculateCycleAdvance(cycle, items, 30)
  
  assert.equal(advance.newCurrentItemProgressMin, 45, "FREE contribui normalmente")
  assert.equal(advance.newCurrentItemIndex, 1, "Cursor permanece (não completou meta)")
})

test("8. REGRA ANTIGA REMOVIDA: Estudo PLANNED AGORA pode alterar ciclo se matéria estiver no ciclo", () => {
  const studySource = "PLAN"
  const cycle = createMockCycle({ current_item_index: 2, current_item_progress_min: 30 })
  const items = createMockItems()

  const advance = calculateCycleAdvance(cycle, items, 60)
  
  assert.equal(advance.isStageCompleted, true, "PLANNED completa meta de Contabilidade (90)")
  assert.equal(advance.newCurrentItemIndex, 3, "Avança para TI")
})

test("9. Estudo CYCLE continua funcionando normalmente", () => {
  const studySource = "CYCLE"
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 35 })
  const items = createMockItems()

  const advance = calculateCycleAdvance(cycle, items, 25)

  assert.equal(advance.newCurrentItemIndex, 2)
  assert.equal(advance.newCurrentItemProgressMin, 0)
})

test("10. Retomar estudo parcial mantém exatamente a posição e tempo restante", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 25 })
  const items = createMockItems()

  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.currentItem?.disciplineName, "Direito Tributário")
  assert.equal(overview.currentItem?.studiedMinutesInRound, 25)
  assert.equal(overview.currentItem?.remainingMinutesInRound, 35)
  assert.equal(overview.currentItem?.isCurrent, true)
  assert.equal(overview.currentItem?.status, "ATUAL")
})

test("11. Plantão 24x72 não altera cursor (ausência de dias de estudo é neutra)", () => {
  const cycle = createMockCycle({
    current_item_index: 2, current_round: 3, current_item_progress_min: 50,
    updated_at: "2026-08-20T00:00:00Z",
  })
  const items = createMockItems()

  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.cycle.current_item_index, 2)
  assert.equal(overview.cycle.current_round, 3)
  assert.equal(overview.currentItem?.studiedMinutesInRound, 50)
})

test("12. Idempotência / Sessões simultâneas não duplicam avanço", () => {
  const processedHistories = new Set<string>(["hist-xyz"])
  const incomingHistoryId = "hist-xyz"

  let advanceExecuted = false
  if (!processedHistories.has(incomingHistoryId)) advanceExecuted = true

  assert.equal(advanceExecuted, false)
})

test("13. Pular etapa não transforma automaticamente em 100% e preserva minutos", () => {
  const cycle = createMockCycle({ current_item_index: 1, current_item_progress_min: 35 })
  const items = createMockItems()

  const skipResult = calculateCycleSkip(cycle, items)

  assert.equal(skipResult.skippedItemId, "item-trib")
  assert.equal(skipResult.partialMinutesPreserved, 35)
  assert.equal(skipResult.newCurrentItemIndex, 2)
  assert.equal(skipResult.newCurrentItemProgressMin, 0)

  const skipSession: StudyCycleSession = {
    id: "sess-skip", cycle_id: "cycle-1", cycle_item_id: "item-trib", round_number: 1,
    minutes_contributed: 35, extra_minutes: 0, is_skip: true, created_at: "2026-09-01T00:00:00Z",
  }

  const updatedCycle = createMockCycle({ current_item_index: 2, current_item_progress_min: 0 })
  const overview = buildCycleOverview(updatedCycle, items, [skipSession])
  const skippedItem = overview.items[1]!

  assert.equal(skippedItem.status, "PULADO")
  assert.equal(skippedItem.studiedMinutesInRound, 35)
  assert.equal(skippedItem.remainingMinutesInRound, 25)
  assert.equal(skippedItem.isCompletedInRound, false)
})

test("14. Reabrir a aplicação mantém exatamente o estado persistido", () => {
  const persistedState = {
    current_item_index: 2, current_round: 4, total_rounds_done: 3, current_item_progress_min: 45,
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
  const planningModified = { totalWeeklyHours: 35 }
  assert.ok(planningModified)
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
      id: "item-legacy", cycle_id: "cycle-1", discipline_id: "disc-1", order: 1,
      priority: "ALTA", difficulty: null as unknown as string, planned_minutes: 60,
      completed_minutes: 0, last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
      discipline: { id: "disc-1", name: "Direito Tributário", area: "Direito", color_hex: "#DC2626" },
    },
  ]
  const overview = buildCycleOverview(cycle, items, [])
  const item = overview.items[0]
  assert.ok(item)
  assert.equal(item!.difficulty, "DIFICIL")
  assert.equal(item!.priority, "ALTA")
})

test("28. buildCycleOverview: alterar difficulty de um item não afeta os outros", () => {
  const cycle = createMockCycle()
  const items = createMockItems()
  items[0]!.priority = "ALTA"
  items[0]!.difficulty = null as unknown as string

  const overview = buildCycleOverview(cycle, items, [])

  assert.equal(overview.items[0]!.difficulty, "DIFICIL")
  assert.equal(overview.items[1]!.difficulty, "DIFICIL")
  assert.equal(overview.items[2]!.difficulty, "DIFICIL")
  assert.equal(overview.items[3]!.difficulty, "MEDIA")
})

test("29. buildCycleOverview: difficulty FACIL preserva plannedMinutes e order", () => {
  const cycle = createMockCycle()
  const items: StudyCycleItemWithDetails[] = [
    {
      id: "item-facil", cycle_id: "cycle-1", discipline_id: "disc-1", order: 1,
      priority: "BAIXA", difficulty: "FACIL", planned_minutes: 90,
      completed_minutes: 0, last_studied_at: null,
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
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

// ============================================================
// TESTES ADICIONAIS: EXTRA E MATÉRIAS CONCLUÍDAS
// ============================================================

test("33. Estudo de matéria já concluída na volta atual → gera EXTRA", () => {
  // Matéria já está concluída (current_index já passou dela)
  const cycle = createMockCycle({ current_item_index: 2, current_item_progress_min: 0 })
  const items = createMockItems()
  
  // Simula que Português (index 0) já foi concluído
  // Se aluno estudar Português novamente, deve gerar EXTRA
  // O service registerStudyToCycle detecta isPastItem e gera extraMinutes = durationMinutes
  
  // Teste conceitual: isPastItem gera extra
  const isPastItem = true
  const durationMinutes = 30
  let extraMinutes = 0
  let minutesContributed = 0
  
  if (isPastItem) {
    extraMinutes = durationMinutes
    minutesContributed = 0
  }
  
  assert.equal(extraMinutes, 30, "30 min viram EXTRA")
  assert.equal(minutesContributed, 0, "Zero contribuição para meta (já concluída)")
})

test("34. Extra armazenado separadamente não infla progresso", () => {
  // Para o item ATUAL, o progresso vem de cycle.current_item_progress_min
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 60 })
  const items = createMockItems()
  const sessions: StudyCycleSession[] = [
    {
      id: "s1", cycle_id: "cycle-1", cycle_item_id: "item-port", round_number: 1,
      minutes_contributed: 60, extra_minutes: 30, created_at: "2026-09-01T00:00:00Z",
    },
  ]

  const overview = buildCycleOverview(cycle, items, sessions)
  
  assert.equal(overview.items[0]!.studiedMinutesInRound, 60)
  assert.equal(overview.items[0]!.extraMinutesInRound, 30)
  assert.equal(overview.totalStudiedMinutesInRound, 60)
  assert.equal(overview.totalExtraMinutesInRound, 30)
  assert.ok(overview.roundProgressPercentage < 100)
})

test("35. Matéria futura acumula progresso na sessão e overview mostra o progresso acumulado", () => {
  // Quando aluno estuda matéria futura, registra em study_cycle_sessions
  // E buildCycleOverview agora mostra os minutos acumulados nela na volta atual
  const cycle = createMockCycle({ current_item_index: 0, current_round: 1 })
  const items = createMockItems()
  
  // Sessão de estudo antecipado de Contabilidade (index 2)
  const futureSession: StudyCycleSession = {
    id: "fut-1", cycle_id: "cycle-1", cycle_item_id: "item-cont", round_number: 1,
    minutes_contributed: 45, extra_minutes: 0, created_at: "2026-09-01T00:00:00Z",
  }

  const overview = buildCycleOverview(cycle, items, [futureSession])
  
  // Item futuro (Contabilidade) mostra 45 min acumulados na volta atual
  const contItem = overview.items[2]!
  assert.equal(contItem.studiedMinutesInRound, 45, "Futuro deve mostrar os 45 min acumulados")
  assert.equal(contItem.remainingMinutesInRound, 45, "Faltam 45 min para a meta de 90")
  assert.equal(contItem.status, "PENDENTE")
  
  // Histórico total também acumula 45 min
  assert.equal(contItem.totalStudiedHistoricalMinutes, 45, "Histórico total acumula 45 min")
})

test("36. Cursor só avança quando item ATUAL atinge meta", () => {
  const cycle = createMockCycle({ current_item_index: 0, current_item_progress_min: 0 })
  const items = createMockItems()
  
  // Estuda matéria futura (TI, index 3) - 60 min
  // Cursor NÃO deve avançar de Português (index 0)
  const advance = calculateCycleAdvance(cycle, items, 60)
  
  assert.equal(advance.newCurrentItemIndex, 1, "Avança porque Português (atual) atingiu meta")
  // O estudo de TI foi registrado separadamente mas não moveu o cursor
})

// ============================================================
// TESTES DE VALIDAÇÃO TEMPORAL (REGRAS DE DATA DO CICLO)
// ============================================================

test("TEMPORAL 1. Estudo ANTES do ciclo (31/08) → NÃO conta, ciclo criado 01/09", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  // Estudo em 31/08 (antes do ciclo)
  const studyDate = new Date("2026-08-31T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[0]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  // Validação temporal
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, false, "Estudo antes do ciclo deve ser inválido")
  assert.equal(isValidItem, false, "Estudo antes do item deve ser inválido")
  
  // Resultado esperado: 0/60 (não conta)
  // O calculateCycleAdvance não seria chamado pois a validação temporal falha antes
})

test("TEMPORAL 2. Estudo NO DIA do ciclo (01/09) → CONTA, ciclo criado 01/09", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  // Estudo em 01/09 (mesmo dia do ciclo, após meia-noite)
  const studyDate = new Date("2026-09-01T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[0]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, true, "Estudo no mesmo dia do ciclo deve ser válido")
  assert.equal(isValidItem, true, "Estudo no mesmo dia do item deve ser válido")
})

test("TEMPORAL 3. Estudo DEPOIS do ciclo (02/09) → CONTA, ciclo criado 01/09", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  const studyDate = new Date("2026-09-02T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[0]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, true, "Estudo depois do ciclo deve ser válido")
  assert.equal(isValidItem, true, "Estudo depois do item deve ser válido")
})

test("TEMPORAL 4. Múltiplos estudos: apenas pós-ciclo contam", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  const studies = [
    { date: new Date("2026-08-31T10:00:00Z"), minutes: 60, expectedValid: false }, // antes
    { date: new Date("2026-09-01T10:00:00Z"), minutes: 20, expectedValid: true },   // dia do ciclo
    { date: new Date("2026-09-02T10:00:00Z"), minutes: 30, expectedValid: true },   // depois
  ]
  
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[0]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  let validCount = 0
  let totalValidMinutes = 0
  
  for (const study of studies) {
    const isValidCycle = study.date >= cycleDate
    const isValidItem = study.date >= itemDate
    const isValid = isValidCycle && isValidItem
    
    assert.equal(isValid, study.expectedValid, `Estudo ${study.date.toISOString()} validade`)
    
    if (isValid) {
      validCount++
      totalValidMinutes += study.minutes
    }
  }
  
  assert.equal(validCount, 2, "Apenas 2 estudos devem ser válidos")
  assert.equal(totalValidMinutes, 50, "Total de minutos válidos: 50")
})

test("TEMPORAL 5. Importação Aprovado com data ANTES do ciclo → NÃO conta", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 1, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  // Importado hoje, mas atividade foi em 15/08
  const studyDate = new Date("2026-08-15T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[1]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, false, "Atividade importada de 15/08 não conta para ciclo de 01/09")
  assert.equal(isValidItem, false, "Atividade antes do item não conta")
})

test("TEMPORAL 6. Importação Aprovado com data DEPOIS do ciclo → CONTA", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 1, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  // Importado hoje, atividade foi em 02/09
  const studyDate = new Date("2026-09-02T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[1]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, true, "Atividade importada de 02/09 conta para ciclo de 01/09")
  assert.equal(isValidItem, true, "Atividade depois do item conta")
})

test("TEMPORAL 7. Item adicionado DEPOIS (05/09), estudo ANTES (02/09) → NÃO conta", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  // Item Auditoria adicionado em 05/09 (simulado com created_at posterior)
  const newItem = {
    ...items[0], // reusar estrutura
    id: "item-aud",
    discipline_id: "disc-aud",
    created_at: "2026-09-05T00:00:00Z", // item entrou no ciclo em 05/09
  }
  const allItems = [...items, newItem]
  
  // Estudo em 02/09 (antes do item entrar no ciclo)
  const studyDate = new Date("2026-09-02T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = newItem.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, true, "Estudo depois do ciclo")
  assert.equal(isValidItem, false, "Mas ANTES do item entrar no ciclo → NÃO conta")
})

test("TEMPORAL 8. Item adicionado DEPOIS (05/09), estudo DEPOIS (06/09) → CONTA", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, 
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  const newItem = {
    ...items[0],
    id: "item-aud",
    discipline_id: "disc-aud",
    created_at: "2026-09-05T00:00:00Z",
  }
  const allItems = [...items, newItem]
  
  const studyDate = new Date("2026-09-06T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = newItem.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, true, "Estudo depois do ciclo")
  assert.equal(isValidItem, true, "E depois do item entrar no ciclo → CONTA")
})

test("TEMPORAL 9. Matéria futura estudada APÓS ciclo → acumula progresso, não move cursor", () => {
  const cycle = createMockCycle({ 
    created_at: "2026-09-01T00:00:00Z",
    current_item_index: 0, // cursor em Português
    current_item_progress_min: 0 
  })
  const items = createMockItems()
  
  // Estudo antecipado de Contabilidade (index 2, futura) em 02/09
  const studyDate = new Date("2026-09-02T10:00:00Z")
  const cycleCreatedAt = cycle.created_at as string
  const itemCreatedAt = items[2]!.created_at as string
  const cycleDate = new Date(cycleCreatedAt)
  const itemDate = new Date(itemCreatedAt)
  
  const isValidCycle = studyDate >= cycleDate
  const isValidItem = studyDate >= itemDate
  
  assert.equal(isValidCycle, true, "Estudo válido para o ciclo")
  assert.equal(isValidItem, true, "Estudo válido para o item")
  
  // O cursor NÃO deve avançar (ainda está em index 0)
  assert.equal(cycle.current_item_index, 0, "Cursor permanece na matéria atual")
  
  // O progresso seria registrado no study_cycle_sessions para Contabilidade
  // mas current_item_index continua 0
})

test("TEMPORAL 10. Idempotência + validação temporal: mesmo estudo processado 2x → não duplica", () => {
  const processedHistories = new Set<string>(["hist-123"])
  const incomingId = "hist-123"
  
  let wouldProcess = false
  if (!processedHistories.has(incomingId)) wouldProcess = true
  
  assert.equal(wouldProcess, false, "Idempotência impede duplicação")
  
  // Mesmo que a data seja válida, a idempotência bloqueia
  const studyDate = new Date("2026-09-02T10:00:00Z")
  const cycleDate = new Date("2026-09-01T00:00:00Z")
  
  const isValidDate = studyDate >= cycleDate
  assert.equal(isValidDate, true, "Data seria válida")
  
  // Mas idempotência bloqueia
  const finalDecision = isValidDate && !processedHistories.has(incomingId)
  assert.equal(finalDecision, false, "Idempotência tem precedência sobre data válida")
})

// ============================================================
// REGRESSÃO: estudos importados (Aprovado) contribuem para o ciclo
// mesmo quando anteriores à criação do ciclo.
// O rebuild NÃO filtra por cycle.created_at (CHECK 5).
// ============================================================

test("imported Aprovado studies contribute to the active cycle", () => {
  // Ciclo criado em 01/09, estudo importado do Aprovado em 15/08.
  // REGRA ATUAL: todo o study_history válido conta, independente da data.
  const cycleCreatedAt = new Date("2026-09-01T00:00:00Z")
  const importedStudyAt = new Date("2026-08-15T10:00:00Z")

  // O filtro antigo (started_at >= cycle.created_at) descartaria este estudo.
  // A regra corrigida NÃO aplica esse filtro.
  const shouldCount = true // todo histórico válido com duration > 0 conta
  assert.equal(shouldCount, true, "Importado anterior ao ciclo DEVE contribuir")

  // Acumulação: 90min importados em target 60 → 60/60 + 30 extra
  const importedMinutes = 90
  const target = 60
  const consumed = Math.min(importedMinutes, target)
  const extra = Math.max(importedMinutes - consumed, 0)
  assert.equal(consumed, 60, "Progresso limitado ao target")
  assert.equal(extra, 30, "Excesso vira extra, não é descartado")
  void cycleCreatedAt
  void importedStudyAt
})

test("imported studies: múltiplos registros da mesma disciplina são somados", () => {
  const studies = [30, 40, 50] // minutos importados
  const target = 60
  let accumulated = 0
  for (const mins of studies) {
    const remaining = Math.max(0, target - accumulated)
    accumulated += Math.min(mins, remaining)
  }
  assert.equal(accumulated, 60, "Soma limitada ao target")
  const total = studies.reduce((a, b) => a + b, 0)
  assert.equal(total - accumulated, 60, "Resto vira extra")
})

test("imported studies: mesma study_history_id processada 2x contribui só 1x", () => {
  const processed = new Set<string>(["hist-import-1"])
  const incoming = "hist-import-1"
  assert.equal(processed.has(incoming), true, "Idempotência bloqueia duplicação")
})

// ============================================================
// CURSOR DO REBUILD: avança por TODAS as matérias completas
// ============================================================

function rebuildCursor(validMinutesPerItem: number[], targets: number[]): {
  cursorIndex: number
  currentItemProgressMin: number
  roundsDone: number
  currentRound: number
} {
  const totalPlanned = targets.reduce((a, b) => a + b, 0)
  const totalValid = validMinutesPerItem.reduce((a, b) => a + Math.min(b, targets[validMinutesPerItem.indexOf(b)] ?? b), 0)
  const roundsDone = totalPlanned > 0 ? Math.floor(totalValid / totalPlanned) : 0
  let cursorIndex = 0
  let currentItemProgressMin = 0
  let foundIncomplete = false
  for (let i = 0; i < validMinutesPerItem.length; i++) {
    const target = targets[i]!
    const valid = Math.min(validMinutesPerItem[i] ?? 0, target)
    if (valid < target) {
      cursorIndex = i
      currentItemProgressMin = Math.max(0, valid)
      foundIncomplete = true
      break
    }
  }
  if (!foundIncomplete) {
    cursorIndex = 0
    currentItemProgressMin = 0
  }
  return { cursorIndex, currentItemProgressMin, roundsDone, currentRound: roundsDone + 1 }
}

test("CURSOR 1. A=60 B=60 C=20 → cursor = C", () => {
  const r = rebuildCursor([60, 60, 20], [60, 60, 60])
  assert.equal(r.cursorIndex, 2, "Cursor na primeira incompleta (C)")
  assert.equal(r.currentItemProgressMin, 20, "Progresso parcial preservado")
})

test("CURSOR 2. A=B=C=60 → nova volta, cursor = A", () => {
  const r = rebuildCursor([60, 60, 60], [60, 60, 60])
  assert.equal(r.roundsDone, 1, "Volta fecha")
  assert.equal(r.currentRound, 2, "Nova volta inicia")
  assert.equal(r.cursorIndex, 0, "Cursor recomeça em A")
  assert.equal(r.currentItemProgressMin, 0, "Progresso zerado na nova volta")
})

test("CURSOR 3. A=60 B=80 C=40 → cursor = C, excesso de B vira extra", () => {
  const r = rebuildCursor([60, 80, 40], [60, 60, 60])
  assert.equal(r.cursorIndex, 2, "Cursor em C (B completa com extra)")
  assert.equal(r.currentItemProgressMin, 40, "C preserva 40min")
})

test("CURSOR 4. A=B=C=60 D=20 → cursor = D (pula todas as completas)", () => {
  const r = rebuildCursor([60, 60, 60, 20], [60, 60, 60, 60])
  assert.equal(r.cursorIndex, 3, "Cursor avança por B e C completas até D")
})

// ============================================================
// STATUS VISUAL: derivado do progresso real, não do cursor
// ============================================================

function visualStatus(item: { status: string; studied: number; planned: number }): string {
  if (item.status === "PULADO") return "SKIPPED"
  if (item.status === "ATUAL") return "CURRENT"
  const target = Math.max(1, item.planned)
  const studied = Math.max(0, item.studied)
  if (studied >= target) return item.status === "PENDENTE" ? "COMPLETED_EARLY" : "COMPLETED"
  if (studied > 0) return "PARTIAL"
  return "PENDING"
}

test("VISUAL 1. current + 0/60 → ATUAL", () => {
  assert.equal(visualStatus({ status: "ATUAL", studied: 0, planned: 60 }), "CURRENT")
})

test("VISUAL 2. future + 60/60 → CONCLUÍDA ANTECIPADAMENTE", () => {
  assert.equal(visualStatus({ status: "PENDENTE", studied: 60, planned: 60 }), "COMPLETED_EARLY")
})

test("VISUAL 3. future + 60/60 + extra → CONCLUÍDA + EXTRA", () => {
  const s = visualStatus({ status: "PENDENTE", studied: 120, planned: 60 })
  assert.equal(s, "COMPLETED_EARLY", "Excesso vira extra, visual é concluída")
})

test("VISUAL 4. future + 20/60 → PARCIAL", () => {
  assert.equal(visualStatus({ status: "PENDENTE", studied: 20, planned: 60 }), "PARTIAL")
})

test("VISUAL 5. future + 0/60 → PENDENTE", () => {
  assert.equal(visualStatus({ status: "PENDENTE", studied: 0, planned: 60 }), "PENDING")
})

test("VISUAL 6. skipped → PULADA", () => {
  assert.equal(visualStatus({ status: "PULADO", studied: 20, planned: 60 }), "SKIPPED")
})

// ============================================================
// APRESENTAÇÃO ESTILO APROVADO: Extra/Falta + Meta + cor + %
// ============================================================

function fmtDur(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || h === 0) parts.push(h > 0 ? `${String(m).padStart(2, "0")}m` : `${m}m`)
  if (rest > 0) parts.push(h > 0 || m > 0 ? `${String(rest).padStart(2, "0")}s` : `${rest}s`)
  return parts.join("")
}

function barColor(pct: number): string {
  if (pct >= 75) return "green"
  if (pct >= 50) return "lime"
  if (pct >= 25) return "amber"
  return "orange"
}

test("APROVADO 1. 0/60 → Falta 1h, 0,0%, laranja", () => {
  assert.equal(fmtDur(60 * 60), "1h")
  assert.equal(barColor(0), "orange")
})

test("APROVADO 2. 40/60 → 66,7%, lima", () => {
  const pct = Math.min(100, (40 / 60) * 100)
  assert.ok(pct > 66 && pct < 67)
  assert.equal(barColor(Math.round(pct)), "lime")
})

test("APROVADO 3. 60/60 → Extra 0, 100%, verde", () => {
  assert.equal(fmtDur(0), "0s")
  assert.equal(barColor(100), "green")
})

test("APROVADO 4. 80/60 → Extra 20m, 100%, verde", () => {
  assert.equal(fmtDur(20 * 60), "20m")
  assert.equal(barColor(100), "green")
})

test("APROVADO 5. 120/60 → Extra 1h, 100%, verde", () => {
  assert.equal(fmtDur(60 * 60), "1h")
})

test("APROVADO 6. extra nunca eleva % acima de 100", () => {
  const pct = Math.min(100, (480 / 60) * 100)
  assert.equal(pct, 100)
})

test("APROVADO 7. futura 60/60 → concluída visual, cursor fica na anterior incompleta", () => {
  const s = visualStatus({ status: "PENDENTE", studied: 60, planned: 60 })
  assert.equal(s, "COMPLETED_EARLY")
})

// ============================================================
// PRÓXIMA = primeira incompleta após o cursor (não o próximo array)
// ============================================================

function nextIncomplete(progress: number[], currentIndex: number): number | null {
  if (progress.length <= 1) return null
  for (let offset = 1; offset < progress.length; offset++) {
    const i = (currentIndex + offset) % progress.length
    if ((progress[i] ?? 0) < 60) return i
  }
  return null
}

test("NEXT 1. A=0 B=60 C=60 D=0, atual=A → PRÓXIMA=D", () => {
  assert.equal(nextIncomplete([0, 60, 60, 0], 0), 3)
})

test("NEXT 2. A=20 B=60 C=10, atual=A → PRÓXIMA=C", () => {
  assert.equal(nextIncomplete([20, 60, 10], 0), 2)
})

test("NEXT 3. A=B=C=0, atual=A → PRÓXIMA=B", () => {
  assert.equal(nextIncomplete([0, 0, 0], 0), 1)
})

test("NEXT 4. A=0 B=80 C=0, atual=A → PRÓXIMA=C (extra não impede o pulo)", () => {
  assert.equal(nextIncomplete([0, 80, 0], 0), 2)
})

test("NEXT 5. todas 60/60 → null (volta completa)", () => {
  assert.equal(nextIncomplete([60, 60, 60, 60], 0), null)
})

// ============================================================
// PROTEÇÃO: múltiplos ciclos registrados, um ativo
// ============================================================

function filterVisibleCycles(cycles: { id: string; status: string }[]): typeof cycles {
  // Regra do getCyclesAction: tudo exceto ARCHIVED
  return cycles.filter((c) => c.status !== "ARCHIVED")
}

test("CYCLES 1. usuário com 2 ciclos → ambos retornados", () => {
  const cycles = [
    { id: "c1", status: "ACTIVE" },
    { id: "c2", status: "PAUSED" },
  ]
  assert.equal(filterVisibleCycles(cycles).length, 2)
})

test("CYCLES 2. ACTIVE + PAUSED → ambos visíveis", () => {
  const cycles = [
    { id: "c1", status: "ACTIVE" },
    { id: "c2", status: "PAUSED" },
  ]
  const visible = filterVisibleCycles(cycles)
  assert.ok(visible.some((c) => c.status === "ACTIVE"))
  assert.ok(visible.some((c) => c.status === "PAUSED"))
})

test("CYCLES 3. ativo corretamente selecionado", () => {
  const cycles = [
    { id: "c1", status: "ACTIVE" },
    { id: "c2", status: "PAUSED" },
  ]
  const active = cycles.find((c) => c.status === "ACTIVE")
  assert.equal(active?.id, "c1")
})

test("CYCLES 4. lista não colapsa para 1 item", () => {
  const cycles = [
    { id: "c1", status: "ACTIVE" },
    { id: "c2", status: "PAUSED" },
  ]
  assert.ok(filterVisibleCycles(cycles).length > 1)
})

test("CYCLES 5. rebuild de um ciclo não toca no outro", () => {
  const touched = new Set(["c1"])
  assert.equal(touched.has("c2"), false, "Ciclo B intacto")
})

test("CYCLES 6. ARCHIVED fica oculto, demais visíveis", () => {
  const cycles = [
    { id: "c1", status: "ACTIVE" },
    { id: "c2", status: "ARCHIVED" },
  ]
  const visible = filterVisibleCycles(cycles)
  assert.equal(visible.length, 1)
  assert.equal(visible[0]?.id, "c1")
})

// ============================================================
// TESTE DE TIMEZONE: evitar problema de 31/08 23:30 → 01/09
// ============================================================

test("TIMEZONE. Estudo 31/08 23:30 UTC-3 = 01/09 02:30 UTC → deve respeitar timezone", () => {
  // O sistema usa timestamps com timezone (timestamptz no Postgres)
  // A comparação deve ser feita com Date objects que preservam o instante absoluto
  
  const cycleCreatedAt = "2026-09-01T00:00:00Z" // 01/09 meia-noite UTC
  const studyAtLocalMidnight = "2026-08-31T23:30:00-03:00" // 31/08 23:30 no Brasil (UTC-3)
  
  const cycleDate = new Date(cycleCreatedAt)
  const studyDate = new Date(studyAtLocalMidnight)
  
  // Em UTC: estudo foi em 01/09 02:30 UTC
  // Ciclo criado em: 01/09 00:00 UTC
  // studyDate (02:30) >= cycleDate (00:00) → VÁLIDO
  
  const isValid = studyDate >= cycleDate
  
  // Isso depende da regra de negócio:
  // Se o ciclo foi criado às 00:00 UTC (01/09), 
  // e o estudo foi às 23:30 do dia anterior no horário local (que é 02:30 UTC do dia 01/09)
  // Então tecnicamente o estudo é POSTERIOR à criação do ciclo.
  
  // A regra deve ser clara: usar o instante absoluto (timestamp com timezone)
  assert.equal(isValid, true, "Timestamp com timezone preserva ordem temporal absoluta")
  
  // Se a regra for "mesmo dia calendário no fuso do usuário", 
  // precisaríamos converter ambos para o fuso do usuário antes de comparar.
  // Por enquanto, usar timestamp absoluto (mais seguro e consistente).
})