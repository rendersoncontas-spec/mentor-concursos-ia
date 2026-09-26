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
  /**
   * ISO timestamp of when the study happened (study_history.started_at).
   * Optional for backward compatibility with callers/tests that never pass
   * round conclusions — when there are no round conclusions to interleave,
   * this field is never read and array order is used as before. It is
   * required in practice whenever `roundConclusions` is non-empty, so that
   * a conclusion can be placed correctly relative to real study time.
   */
  startedAt?: string | undefined
}

/** A durable "skip" for one cycle item in one specific round (see migration
 * 20260919_1_cycle_item_skips.sql). Skipping never fabricates progress and is
 * never derived from study_history — it only tells the reducer that this item
 * must stop blocking the cursor/round for that round, even if its real
 * studied time never reaches the target. This remains atemporal by design and
 * stays safe because normally only one item at a time is skipped, so at least
 * one other item in the round still depends on real progress. */
export type ReconciliationSkip = {
  cycleItemId: string
  roundNumber: number
}

/**
 * A durable "conclude round" event (see migration
 * 20260926_cycle_round_conclusions.sql). Used only by the administrative
 * "Concluir volta" action — never created from real study.
 */
export type ReconciliationRoundConclusion = {
  /** The round the server observed as current at the moment of the click. */
  roundNumber: number
  /** ISO timestamp of when the conclude action happened. Unlike a skip, this
   * event is time-ordered against real studies: it is only applied when the
   * reducer's replay reaches this exact point in time AND the round it names
   * is still the round currently open — never fired twice for the same
   * round, never applied "early" against studies that logically precede it. */
  occurredAt: string
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

type TimelineEntry =
  | { type: "study"; study: ReconciliationStudy }
  | { type: "conclusion"; conclusion: ReconciliationRoundConclusion }

/**
 * Interleaves round-conclusion events into the chronological study sequence.
 * `studies` is assumed pre-sorted by time by the caller (as already required
 * elsewhere in this module). A conclusion is placed immediately before the
 * first study that happened strictly after it, so it is processed after every
 * study that precedes/coincides with it and before every study that follows.
 * A study with no `startedAt` is treated as happening "now" for ordering
 * purposes, i.e. any pending conclusion is placed before it — this only
 * matters when round conclusions are actually supplied; callers that never
 * pass any (all existing callers/tests) get back exactly `studies` in order.
 */
function buildTimeline(
  studies: ReconciliationStudy[],
  roundConclusions: ReconciliationRoundConclusion[],
): TimelineEntry[] {
  if (roundConclusions.length === 0) {
    return studies.map((study) => ({ type: "study", study }) as const)
  }

  const conclusionsSorted = [...roundConclusions].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const timeline: TimelineEntry[] = []
  let ci = 0

  for (const study of studies) {
    let next = conclusionsSorted[ci]
    while (next && (!study.startedAt || next.occurredAt <= study.startedAt)) {
      timeline.push({ type: "conclusion", conclusion: next })
      ci += 1
      next = conclusionsSorted[ci]
    }
    timeline.push({ type: "study", study })
  }

  for (let i = ci; i < conclusionsSorted.length; i += 1) {
    const conclusion = conclusionsSorted[i]
    if (conclusion) timeline.push({ type: "conclusion", conclusion })
  }

  return timeline
}

/**
 * Deterministic cycle reducer. A study can fill only the current round; any
 * remainder is extra for that round and never becomes credit for a future one.
 * A skip only changes whether an item is treated as "satisfied" for cursor and
 * round-completion purposes — it never changes how contributed/extra seconds
 * are computed from real study time.
 *
 * `roundConclusions` (optional, additive) lets an administrative "Concluir
 * volta" action force-close the round that is current at a specific point in
 * time, without fabricating any progress and without disturbing rounds that
 * already closed naturally through real study. See
 * ReconciliationRoundConclusion and migration
 * 20260926_cycle_round_conclusions.sql for why this needs to be a
 * time-ordered event rather than a per-item skip.
 */
export function reconcileCycleFromStudies(
  items: ReconciliationItem[],
  studies: ReconciliationStudy[],
  skips: ReconciliationSkip[] = [],
  roundConclusions: ReconciliationRoundConclusion[] = [],
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

  const timeline = buildTimeline(studies, roundConclusions)

  for (const entry of timeline) {
    if (entry.type === "conclusion") {
      // Only fires if the round it names is still the one currently open at
      // this exact point in the replay. This is what prevents a redundant or
      // stale conclude event from ever closing two rounds at once: if the
      // round already closed naturally (real progress reached every target)
      // by the time we reach this event, it is a no-op.
      if (currentRound === entry.conclusion.roundNumber) {
        totalRoundsDone += 1
        currentRound += 1
        progress = new Map(items.map((item) => [item.id, 0]))
        advanceCompletedRounds()
      }
      continue
    }

    const study = entry.study
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
