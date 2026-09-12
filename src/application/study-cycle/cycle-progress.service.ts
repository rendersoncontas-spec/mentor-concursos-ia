import {
  mapDifficultyToPriority,
  normalizeDifficulty,
  type CycleItemProgress,
  type CycleItemProgressStatus,
  type CycleOverview,
  type StudyCycle,
  type StudyCycleItemWithDetails,
  type StudyCycleSession,
} from "@/domain/study-cycle/study-cycle.types"

export interface CycleAdvanceCalculationResult {
  minutesContributed: number
  extraMinutes: number
  newCurrentItemIndex: number
  newCurrentRound: number
  newTotalRoundsDone: number
  newCurrentItemProgressMin: number
  isStageCompleted: boolean
  isRoundCompleted: boolean
}

export interface CycleSkipCalculationResult {
  skippedItemId: string
  partialMinutesPreserved: number
  newCurrentItemIndex: number
  newCurrentRound: number
  newTotalRoundsDone: number
  newCurrentItemProgressMin: number
  isRoundCompleted: boolean
}

/**
 * Calcula a visão detalhada e o progresso em tempo real do ciclo rotativo.
 * Regras estritas:
 * - O percentual da volta nunca ultrapassa 100%.
 * - Tempo extra é contabilizado separadamente e NÃO infla o percentual de conclusão.
 * - Etapas puladas mantêm o tempo estudado, são marcadas como 'PULADO' e NÃO como 100%.
 */
export function buildCycleOverview(
  cycle: StudyCycle,
  items: StudyCycleItemWithDetails[],
  sessions: StudyCycleSession[] = []
): CycleOverview {
  const currentRound = Math.max(1, cycle.current_round || 1)
  const totalRoundsDone = Math.max(0, cycle.total_rounds_done || 0)
  const totalItemsCount = items.length

  // Índice atual seguro (entre 0 e items.length - 1)
  const safeCurrentIndex =
    totalItemsCount > 0 ? Math.min(Math.max(0, cycle.current_item_index || 0), totalItemsCount - 1) : 0

  const currentItemProgressMin = Math.max(0, cycle.current_item_progress_min || 0)

  // Mapear sessões históricas totais e sessões da volta atual por item
  const historicalMinutesByItem = new Map<string, { total: number; extra: number }>()
  const roundDataByItem = new Map<
    string,
    { contributed: number; extra: number; isSkip: boolean }
  >()

  for (const s of sessions) {
    // Histórico geral acumulado
    const hist = historicalMinutesByItem.get(s.cycle_item_id) || { total: 0, extra: 0 }
    hist.total += (s.minutes_contributed || 0) + (s.extra_minutes || 0)
    hist.extra += s.extra_minutes || 0
    historicalMinutesByItem.set(s.cycle_item_id, hist)

    // Dados específicos da volta atual
    if (s.round_number === currentRound) {
      const currentRoundEntry = roundDataByItem.get(s.cycle_item_id) || {
        contributed: 0,
        extra: 0,
        isSkip: false,
      }
      currentRoundEntry.contributed += s.minutes_contributed || 0
      currentRoundEntry.extra += s.extra_minutes || 0
      if (s.is_skip) {
        currentRoundEntry.isSkip = true
      }
      roundDataByItem.set(s.cycle_item_id, currentRoundEntry)
    }
  }

  let totalPlannedMinutesPerRound = 0
  let totalStudiedMinutesInRound = 0
  let totalExtraMinutesInRound = 0

  const computedItems: CycleItemProgress[] = items.map((item, index) => {
    const planned = Math.max(1, item.planned_minutes)
    totalPlannedMinutesPerRound += planned

    const isPastInRound = index < safeCurrentIndex
    const isCurrent = index === safeCurrentIndex
    const isFutureInRound = index > safeCurrentIndex

    let studiedInRound = 0
    let remainingInRound = planned
    let extraInRound = 0
    let isCompletedInRound = false
    let isSkippedInRound = false
    let status: CycleItemProgressStatus = "PENDENTE"

    const roundEntry = roundDataByItem.get(item.id)

    if (isPastInRound) {
      if (roundEntry?.isSkip) {
        // Matéria foi pulada nesta volta: mantém os minutos que foram estudados nela
        studiedInRound = Math.min(roundEntry.contributed, planned)
        extraInRound = roundEntry.extra || 0
        remainingInRound = Math.max(0, planned - studiedInRound)
        isCompletedInRound = false
        isSkippedInRound = true
        status = "PULADO"
        totalStudiedMinutesInRound += studiedInRound
      } else {
        // Matéria foi concluída normalmente na volta
        studiedInRound = planned
        extraInRound = roundEntry?.extra || 0
        remainingInRound = 0
        isCompletedInRound = true
        isSkippedInRound = false
        status = "CONCLUIDO"
        totalStudiedMinutesInRound += planned
      }
    } else if (isCurrent) {
      // Para o item atual, preferimos o progresso persistido no ciclo, mas recuperamos das sessões se for maior
      const combinedCurrent = Math.max(currentItemProgressMin, roundEntry?.contributed || 0)
      studiedInRound = Math.min(combinedCurrent, planned)
      remainingInRound = Math.max(0, planned - studiedInRound)
      extraInRound = roundEntry?.extra || 0
      isCompletedInRound = studiedInRound >= planned
      isSkippedInRound = false
      status = "ATUAL"
      totalStudiedMinutesInRound += studiedInRound
    } else if (isFutureInRound) {
      // Matéria futura estudada antecipadamente: mostra o progresso acumulado nela nesta volta
      const futureContributed = Math.min(roundEntry?.contributed || 0, planned)
      studiedInRound = futureContributed
      remainingInRound = Math.max(0, planned - futureContributed)
      extraInRound = roundEntry?.extra || 0
      isCompletedInRound = futureContributed >= planned
      isSkippedInRound = false
      status = "PENDENTE"
      totalStudiedMinutesInRound += studiedInRound
    }

    totalExtraMinutesInRound += extraInRound

    const hist = historicalMinutesByItem.get(item.id)
    const totalStudiedHistoricalMinutes = hist?.total || 0

    return {
      itemId: item.id,
      disciplineId: item.discipline_id,
      disciplineName: item.discipline?.name || "Disciplina",
      disciplineArea: item.discipline?.area || null,
      disciplineColorHex: item.discipline?.color_hex || "#2563EB",
      order: item.order || index + 1,
      priority: mapDifficultyToPriority(item.difficulty || item.priority),
      difficulty: normalizeDifficulty(item.difficulty || item.priority),
      plannedMinutes: planned,
      studiedMinutesInRound: studiedInRound,
      remainingMinutesInRound: remainingInRound,
      extraMinutesInRound: extraInRound,
      isCompletedInRound,
      isSkippedInRound,
      isCurrent,
      status,
      totalStudiedHistoricalMinutes,
    }
  })

  // Progresso da volta: soma dos minutos válidos estudados dividida pelo total planejado da volta.
  // Rigorosamente travado em 100% no máximo. Tempo extra não aumenta essa porcentagem.
  const roundProgressPercentage =
    totalPlannedMinutesPerRound > 0
      ? Math.min(100, Math.round((totalStudiedMinutesInRound / totalPlannedMinutesPerRound) * 100))
      : 0

  const totalHistoricalMinutes = Array.from(historicalMinutesByItem.values()).reduce(
    (acc, val) => acc + val.total,
    0
  )

  const currentItem = computedItems[safeCurrentIndex] || null
  const nextItem =
    totalItemsCount > 1
      ? computedItems[(safeCurrentIndex + 1) % totalItemsCount] || null
      : null

  return {
    cycle,
    items: computedItems,
    totalPlannedMinutesPerRound,
    totalStudiedMinutesInRound,
    totalExtraMinutesInRound,
    roundProgressPercentage,
    totalHistoricalMinutes,
    currentRound,
    totalRoundsDone,
    currentItem,
    nextItem,
  }
}

/**
 * Calcula o avanço do cursor do ciclo ao receber novos minutos estudados.
 * Regras:
 * - Se estudou menos do que faltava para a meta: acumula na etapa atual. Cursor NÃO avança.
 * - Se atingiu ou superou a meta: etapa é concluída, tempo restante é EXTRA isolado, cursor avança.
 * - Se atingiu a meta da última disciplina da fila: inicia uma NOVA VOLTA (current_round + 1, total_rounds_done + 1, index volta a 0).
 */
export function calculateCycleAdvance(
  cycle: StudyCycle,
  items: StudyCycleItemWithDetails[],
  studiedMinutes: number
): CycleAdvanceCalculationResult {
  const totalItems = items.length
  if (totalItems === 0 || studiedMinutes <= 0) {
    return {
      minutesContributed: 0,
      extraMinutes: 0,
      newCurrentItemIndex: cycle.current_item_index || 0,
      newCurrentRound: cycle.current_round || 1,
      newTotalRoundsDone: cycle.total_rounds_done || 0,
      newCurrentItemProgressMin: cycle.current_item_progress_min || 0,
      isStageCompleted: false,
      isRoundCompleted: false,
    }
  }

  const currentIndex = Math.min(Math.max(0, cycle.current_item_index || 0), totalItems - 1)
  const currentItem = items[currentIndex]
  const planned = currentItem ? Math.max(1, currentItem.planned_minutes) : 60
  const currentProgress = Math.max(0, cycle.current_item_progress_min || 0)

  const remainingForStage = Math.max(0, planned - currentProgress)

  let minutesContributed = 0
  let extraMinutes = 0
  let isStageCompleted = false
  let isRoundCompleted = false

  let newCurrentItemIndex = currentIndex
  let newCurrentRound = cycle.current_round || 1
  let newTotalRoundsDone = cycle.total_rounds_done || 0
  let newCurrentItemProgressMin = currentProgress

  if (studiedMinutes >= remainingForStage) {
    // Concluiu a meta da etapa atual!
    minutesContributed = remainingForStage
    extraMinutes = studiedMinutes - remainingForStage
    isStageCompleted = true

    const nextIndex = currentIndex + 1

    if (nextIndex >= totalItems) {
      // Concluiu a última matéria da fila!
      // Inicia automaticamente uma nova volta do ciclo rotativo
      isRoundCompleted = true
      newCurrentItemIndex = 0
      newCurrentRound = newCurrentRound + 1
      newTotalRoundsDone = newTotalRoundsDone + 1
      newCurrentItemProgressMin = 0
    } else {
      // Avança para a próxima matéria da mesma volta
      newCurrentItemIndex = nextIndex
      newCurrentItemProgressMin = 0
    }
  } else {
    // Ainda não bateu a meta: acumula o tempo e permanece na mesma matéria
    minutesContributed = studiedMinutes
    extraMinutes = 0
    isStageCompleted = false
    newCurrentItemProgressMin = currentProgress + studiedMinutes
  }

  return {
    minutesContributed,
    extraMinutes,
    newCurrentItemIndex,
    newCurrentRound,
    newTotalRoundsDone,
    newCurrentItemProgressMin,
    isStageCompleted,
    isRoundCompleted,
  }
}

/**
 * Calcula o pulo manual de etapa do ciclo.
 * Regras:
 * - Preserva os minutos parciais que o aluno já tinha estudado na etapa.
 * - NÃO transforma a etapa em 100% concluída.
 * - Avança o cursor para a próxima disciplina (ou faz o looping de volta se era a última).
 */
export function calculateCycleSkip(
  cycle: StudyCycle,
  items: StudyCycleItemWithDetails[]
): CycleSkipCalculationResult {
  const totalItems = items.length
  const currentIndex = totalItems > 0 ? Math.min(Math.max(0, cycle.current_item_index || 0), totalItems - 1) : 0
  const currentItem = items[currentIndex]
  const partialMinutesPreserved = Math.max(0, cycle.current_item_progress_min || 0)

  let newCurrentItemIndex = currentIndex + 1
  let newCurrentRound = cycle.current_round || 1
  let newTotalRoundsDone = cycle.total_rounds_done || 0
  let isRoundCompleted = false

  if (newCurrentItemIndex >= totalItems) {
    newCurrentItemIndex = 0
    newCurrentRound += 1
    newTotalRoundsDone += 1
    isRoundCompleted = true
  }

  return {
    skippedItemId: currentItem ? currentItem.id : "",
    partialMinutesPreserved,
    newCurrentItemIndex,
    newCurrentRound,
    newTotalRoundsDone,
    newCurrentItemProgressMin: 0,
    isRoundCompleted,
  }
}
