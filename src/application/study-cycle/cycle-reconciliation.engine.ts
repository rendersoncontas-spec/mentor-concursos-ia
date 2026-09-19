export type ReconciliationItem = {
  id: string
  disciplineId: string
  disciplineName: string
  targetSeconds: number
}

export type ReconciliationStudy = {
  id: string
  cycleItemId: string
  disciplineId: string | null
  seconds: number
}

/** A durable "skip" for one cycle item in one specific round (see migration
 * 20260919_1_cycle_item_skips.sql). Skipping never fabricates progress and is
 * never derived from study_history — it only tells the reducer that this item
 * must stop blocking the cursor/round for that round, even if its real
 * studied time never reaches the target. */
export type ReconciliationSkip = {
  cycleItemId: string
  roundNumber: number
}

export type ReconciledSession = {
  cycle_item_id: string
  study_history_id: string
  discipline_id: string | null
  round_number: number
  seconds_contributed: number
  extra_seconds: number
  minutes_contributed: number
  extra_minutes: number
}

export type ReconciledCycleState = {
  currentItemIndex: number
  currentRound: number
  totalRoundsDone: number
  currentItemProgressSeconds: number
  currentItemProgressMinutes: number
}

export type ReconciliationResult = {
  sessions: ReconciledSession[]
  state: ReconciledCycleState
}

/**
 * Deterministic cycle reducer. A study can fill only the current round; any
 * remainder is extra for that round and never becomes credit for a future one.
 * A skip only changes whether an item is treated as "satisfied" for cursor and
 * round-completion purposes — it never changes how contributed/extra seconds
 * are computed from real study time.
 */
export function reconcileCycleFromStudies(
  items: ReconciliationItem[],
  studies: ReconciliationStudy[],
  skips: ReconciliationSkip[] = [],
): ReconciliationResult {
  if (items.length === 0) {
    return {
      sessions: [],
      state: {
        currentItemIndex: 0,
        currentRound: 1,
        totalRoundsDone: 0,
        currentItemProgressSeconds: 0,
        currentItemProgressMinutes: 0,
      },
    }
  }

  const targets = new Map(items.map((item) => [item.id, Math.max(1, item.targetSeconds)]))
  const skipSet = new Set(skips.map((skip) => `${skip.cycleItemId}:${skip.roundNumber}`))
  let currentRound = 1
  let totalRoundsDone = 0
  let progress = new Map(items.map((item) => [item.id, 0]))
  const sessions: ReconciledSession[] = []

  const isSatisfied = (itemId: string, round: number) => {
    const target = targets.get(itemId)
    if (target === undefined) return false
    return (progress.get(itemId) || 0) >= target || skipSet.has(`${itemId}:${round}`)
  }

  // Safety cap: a round can only complete without a new study when every item
  // in it is already skipped. Guards against pathological/duplicated skip
  // data ever looping forever instead of just stopping at a stable state.
  const advanceCompletedRounds = () => {
    let guard = 0
    while (items.every((item) => isSatisfied(item.id, currentRound)) && guard < 10000) {
      totalRoundsDone += 1
      currentRound += 1
      progress = new Map(items.map((item) => [item.id, 0]))
      guard += 1
    }
  }

  // Handles a round that is already fully skipped before any study is processed.
  advanceCompletedRounds()

  for (const study of studies) {
    const target = targets.get(study.cycleItemId)
    const seconds = Math.max(0, Math.round(study.seconds))
    if (!target || seconds === 0) continue

    const prior = progress.get(study.cycleItemId) || 0
    const contributed = Math.min(seconds, Math.max(0, target - prior))
    const extra = Math.max(0, seconds - contributed)

    sessions.push({
      cycle_item_id: study.cycleItemId,
      study_history_id: study.id,
      discipline_id: study.disciplineId,
      round_number: currentRound,
      seconds_contributed: contributed,
      extra_seconds: extra,
      minutes_contributed: contributed / 60,
      extra_minutes: extra / 60,
    })
    progress.set(study.cycleItemId, prior + contributed)

    advanceCompletedRounds()
  }

  const currentItemIndex = Math.max(0, items.findIndex((item) => !isSatisfied(item.id, currentRound)))
  const currentItem = items[currentItemIndex] ?? items[0]
  const currentItemProgressSeconds = currentItem ? progress.get(currentItem.id) || 0 : 0

  return {
    sessions,
    state: {
      currentItemIndex,
      currentRound,
      totalRoundsDone,
      currentItemProgressSeconds,
      currentItemProgressMinutes: currentItemProgressSeconds / 60,
    },
  }
}
