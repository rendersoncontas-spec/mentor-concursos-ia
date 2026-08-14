// ============================================================================
// MOTOR DE REPLANEJAMENTO ADAPTATIVO — NOMEIA
// ----------------------------------------------------------------------------
// Motor puro (zero I/O). Compara o que foi PLANEJADO (blocos datados) com o que
// foi REALIZADO (sessões do histórico), calcula pendências por bloco/disciplina,
// classifica dias, define prioridades e redistribui as pendências pelos dias
// futuros respeitando capacidade diária e limite máximo.
//
// Regras de ouro:
//   - pendência = max(planejado - realizado - tolerância, 0)  (nunca negativa)
//   - nunca modificar o passado; somente os próximos blocos ainda não iniciados
//   - não criar bola de neve: distribuir, nunca empilhar tudo em 1 dia
//   - não duplicar: reutilizar o ID estável do bloco (sourceBlockId)
//   - tolerância de segundos: 59m58s vs 60min não é atraso
// ============================================================================

export type PlanType = "CICLO_ROTATIVO" | "CRONOGRAMA_SEMANAL"
export type ReplanTrigger = "AUTO" | "MANUAL" | "DAY_CLOSE"

export const DEFAULT_TOLERANCE_MINUTES = 1
export const FUTURE_HORIZON_DAYS = 7
export const CRITICAL_MISSED_DAYS = 3
export const MAX_DAILY_MINUTES_CAP = 240

export type ReplanBlockOrigin = "BASE" | "REAJUSTE" | "CRITICO"
export type ReplanBlockStatus = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO" | "CONCLUIDO_MANUAL"

export interface ReplanBlock {
  blockId: string
  itemId: string | null
  disciplineId: string
  disciplineName: string
  scheduledDate: string // YYYY-MM-DD
  durationMinutes: number
  executionOrder: number
  origin: ReplanBlockOrigin
  status: ReplanBlockStatus
  /** Bloco encerrado voluntariamente pelo aluno ("Marcar como concluído hoje").
   *  Sua pendência restante é perdoada e nunca é reprogramada para o futuro. */
  manuallyClosed?: boolean
}

export interface ReplanSession {
  id: string
  startedAt: string // ISO
  disciplineId: string
  studyPlanItemId: string | null
  durationMinutes: number
}

export interface ReplanPending {
  blockId: string
  itemId: string | null
  disciplineId: string
  disciplineName: string
  scheduledDate: string
  plannedMinutes: number
  realizedMinutes: number
  pendingMinutes: number
}

export type DayClassification = "CONCLUIDO" | "PARCIAL" | "NAO_REALIZADO"

export interface ReplanDayStatus {
  date: string
  plannedMinutes: number
  realizedMinutes: number
  classification: DayClassification
  pendingMinutes: number
}

export interface ReplanDisciplineContext {
  weightNorm: number // 0..1 (peso/prioridade normalizado)
  accuracy: number | null // 0..1 (desempenho recente)
  overdueReviews: number
}

export interface ReplanContext {
  todayStr: string
  disciplineContexts: Map<string, ReplanDisciplineContext>
  examDaysLeft: number | null
  planType: PlanType
  weights?: {
    weight?: number
    delay?: number
    performance?: number
    exam?: number
    reviews?: number
  }
}

export interface ReplanDisciplinePendency extends ReplanDisciplineContext {
  disciplineId: string
  disciplineName: string
  pendingMinutes: number
  maxPendingDate: string
  delayDays: number
  priorityScore: number
}

export interface ReplanCapacityDay {
  date: string
  baseLoadMinutes: number
  maxDailyMinutes: number
}

export interface ReplanAssignment {
  pendingBlockId: string
  itemId: string | null
  disciplineId: string
  disciplineName: string
  minutes: number
}

export interface ReplanAdjustedDay {
  date: string
  baseBlocks: ReplanBlock[]
  assignments: ReplanAssignment[]
  totalLoadMinutes: number
}

export interface ReplanInput {
  pastBlocks: ReplanBlock[] // datas anteriores a hoje (imutáveis — só leitura)
  sessions: ReplanSession[]
  futureDays: ReplanCapacityDay[] // dias futuros (hoje+1 .. hoje+horizonte) com capacidade
  futureBlocksByDate: Map<string, ReplanBlock[]> // blocos BASE futuros por data
  alreadyDistributedBlockIds: Set<string> // pendências já reintroduzidas (anti-duplicação)
  context: ReplanContext
  toleranceMinutes?: number
  maxDailyMinutesCap?: number
}

export interface ReplanResult {
  ran: boolean
  reason: string
  pendingBlocks: ReplanPending[]
  dayStatuses: ReplanDayStatus[]
  disciplinePendencies: ReplanDisciplinePendency[]
  totalPendingMinutes: number
  unscheduledMinutes: number
  assignmentsByDate: Record<string, ReplanAssignment[]>
  adjustedDays: ReplanAdjustedDay[]
  critical: boolean
  horizonDays: number
}

export function dateKeyFromIso(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return m ? (m[1] ?? null) : null
}

export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetweenKeys(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime()
  const db = new Date(`${b}T00:00:00Z`).getTime()
  return Math.round((db - da) / 86_400_000)
}

/** pendência = max(planejado - realizado - tolerância, 0) */
export function pendingOf(
  planned: number,
  realized: number,
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES,
): number {
  return Math.max(0, planned - Math.max(0, realized) - toleranceMinutes)
}

export function classifyDay(
  planned: number,
  realized: number,
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES,
): DayClassification {
  if (planned <= 0) return "CONCLUIDO"
  if (realized + toleranceMinutes >= planned) return "CONCLUIDO"
  if (realized > 0) return "PARCIAL"
  return "NAO_REALIZADO"
}

// ----------------------------------------------------------------------------
// 1. PENDÊNCIA POR BLOCO
// ----------------------------------------------------------------------------
// Vínculo planejado ↔ realizado:
//   a) sessão com study_plan_item_id === itemId do bloco (cronômetro do cronograma);
//   b) sessão manual da mesma disciplina na mesma data (sem vínculo direto).
// Para não contabilizar duas vezes, o total consumido por vínculo direto (a) é
// descontado antes de usar o restante da disciplina (b) — em duas passagens.
export function realizedMinutesMap(
  blocks: ReplanBlock[],
  sessions: ReplanSession[],
): Map<string, number> {
  const realized = new Map<string, number>()

  // Passo 1: vínculo direto (study_plan_item_id)
  for (const b of blocks) {
    const direct = sessions
      .filter((s) => s.studyPlanItemId !== null && s.studyPlanItemId === b.itemId)
      .reduce((acc, s) => acc + Math.max(0, s.durationMinutes), 0)
    realized.set(b.blockId, direct)
  }

  // Passo 2: sessões manuais (sem vínculo) da disciplina na data, distribuídas
  // aos blocos na ordem de execução, só até o teto de cada bloco.
  const groupBy = new Map<string, ReplanBlock[]>()
  for (const b of blocks) {
    const key = `${b.disciplineId}::${b.scheduledDate}`
    const list = groupBy.get(key) ?? []
    list.push(b)
    groupBy.set(key, list)
  }

  for (const [key, group] of groupBy) {
    const [disciplineId, date] = key.split("::")
    const disciplineDayTotal = sessions
      .filter((s) => s.disciplineId === disciplineId && dateKeyFromIso(s.startedAt) === date)
      .reduce((acc, s) => acc + Math.max(0, s.durationMinutes), 0)
    const consumed = group.reduce((acc, b) => acc + (realized.get(b.blockId) ?? 0), 0)
    let manualLeft = Math.max(0, disciplineDayTotal - consumed)

    const ordered = [...group].sort((a, b) => a.executionOrder - b.executionOrder)
    for (const b of ordered) {
      const current = realized.get(b.blockId) ?? 0
      const room = Math.max(0, b.durationMinutes - current)
      const share = Math.min(manualLeft, room)
      realized.set(b.blockId, current + share)
      manualLeft -= share
    }
  }

  return realized
}

export function computePendingBlocks(
  pastBlocks: ReplanBlock[],
  sessions: ReplanSession[],
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES,
): ReplanPending[] {
  const realized = realizedMinutesMap(pastBlocks, sessions)
  const pendings: ReplanPending[] = []
  const sorted = [...pastBlocks].sort(
    (x, y) => x.scheduledDate.localeCompare(y.scheduledDate) || x.executionOrder - y.executionOrder,
  )

  for (const block of sorted) {
    // Bloco encerrado manualmente: pendência perdoada (não gera reajuste futuro).
    if (block.manuallyClosed) continue
    const realizedMinutes = realized.get(block.blockId) ?? 0
    const pending = pendingOf(block.durationMinutes, realizedMinutes, toleranceMinutes)
    if (pending > 0) {
      pendings.push({
        blockId: block.blockId,
        itemId: block.itemId,
        disciplineId: block.disciplineId,
        disciplineName: block.disciplineName,
        scheduledDate: block.scheduledDate,
        plannedMinutes: block.durationMinutes,
        realizedMinutes: Math.min(realizedMinutes, block.durationMinutes),
        pendingMinutes: pending,
      })
    }
  }
  return pendings
}

// ----------------------------------------------------------------------------
// 2. STATUS DO DIA
// ----------------------------------------------------------------------------
export function computeDayStatuses(
  pastBlocks: ReplanBlock[],
  sessions: ReplanSession[],
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES,
): ReplanDayStatus[] {
  const realized = realizedMinutesMap(pastBlocks, sessions)
  const byDate = new Map<string, ReplanBlock[]>()
  for (const b of pastBlocks) {
    const list = byDate.get(b.scheduledDate) ?? []
    list.push(b)
    byDate.set(b.scheduledDate, list)
  }

  const result: ReplanDayStatus[] = []
  for (const [date, blocks] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const planned = blocks.reduce((acc, b) => acc + b.durationMinutes, 0)
    const realizedMinutes = blocks.reduce(
      (acc, b) => acc + (b.manuallyClosed ? b.durationMinutes : (realized.get(b.blockId) ?? 0)),
      0,
    )
    result.push({
      date,
      plannedMinutes: planned,
      realizedMinutes: Math.min(realizedMinutes, planned),
      classification: classifyDay(planned, realizedMinutes, toleranceMinutes),
      pendingMinutes: pendingOf(planned, realizedMinutes, toleranceMinutes),
    })
  }
  return result
}

// ----------------------------------------------------------------------------
// 3. PENDÊNCIA POR DISCIPLINA + PRIORIDADE
// ----------------------------------------------------------------------------
export function computeDisciplinePendencies(
  pendingBlocks: ReplanPending[],
  context: ReplanContext,
): ReplanDisciplinePendency[] {
  const byDiscipline = new Map<string, ReplanPending[]>()
  for (const p of pendingBlocks) {
    const list = byDiscipline.get(p.disciplineId) ?? []
    list.push(p)
    byDiscipline.set(p.disciplineId, list)
  }

  const result: ReplanDisciplinePendency[] = []
  for (const [disciplineId, list] of byDiscipline) {
    const pendingMinutes = list.reduce((acc, p) => acc + p.pendingMinutes, 0)
    const maxDate =
      list.reduce((a, b) => (a.scheduledDate > b.scheduledDate ? a : b)).scheduledDate ??
      list[0]?.scheduledDate ??
      ""
    const delayDays = Math.max(0, daysBetweenKeys(maxDate, context.todayStr) - 1)
    const ctx = context.disciplineContexts.get(disciplineId)
    const weightNorm = ctx?.weightNorm ?? 0.5
    const accuracy = ctx?.accuracy ?? null
    const overdue = ctx?.overdueReviews ?? 0

    const priorityBase = {
      weightNorm,
      accuracy,
      overdueReviews: overdue,
      delayDays,
      examDaysLeft: context.examDaysLeft,
      planType: context.planType,
    }

    result.push({
      disciplineId,
      disciplineName: list[0]?.disciplineName ?? "Disciplina",
      pendingMinutes,
      maxPendingDate: maxDate,
      delayDays,
      weightNorm,
      accuracy,
      overdueReviews: overdue,
      priorityScore: priorityScoreOf(
        context.weights ? { ...priorityBase, weights: context.weights } : priorityBase,
      ),
    })
  }

  return result.sort((a, b) => b.priorityScore - a.priorityScore)
}

export function priorityScoreOf(args: {
  weightNorm: number
  accuracy: number | null
  overdueReviews: number
  delayDays: number
  examDaysLeft: number | null
  planType: PlanType
  weights?: {
    weight?: number
    delay?: number
    performance?: number
    exam?: number
    reviews?: number
  }
}): number {
  const hasExam = args.examDaysLeft !== null && args.examDaysLeft !== undefined
  // Pós-edital (plano semanal + prova definida): maior peso para desempenho,
  // proximidade da prova e revisões. Pré-edital (ciclo): constância e atraso.
  const base =
    hasExam && args.planType === "CRONOGRAMA_SEMANAL"
      ? { weight: 0.3, delay: 0.15, performance: 0.2, exam: 0.2, reviews: 0.15 }
      : { weight: 0.3, delay: 0.3, performance: 0.15, exam: 0.1, reviews: 0.15 }
  const weight = args.weights?.weight ?? base.weight
  const delay = args.weights?.delay ?? base.delay
  const performance = args.weights?.performance ?? base.performance
  const exam = args.weights?.exam ?? base.exam
  const reviews = args.weights?.reviews ?? base.reviews

  const weightNorm = Math.min(1, Math.max(0, args.weightNorm))
  const delayNorm = Math.min(1, args.delayDays / 7)
  const perfPenalty = args.accuracy === null ? 0.5 : 1 - Math.min(1, Math.max(0, args.accuracy))
  const examProx = hasExam ? Math.min(1, Math.max(0, 1 - (args.examDaysLeft ?? 30) / 30)) : 0
  const overdueNorm = Math.min(1, args.overdueReviews / 10)

  return (
    weight * weightNorm +
    delay * delayNorm +
    performance * perfPenalty +
    exam * examProx +
    reviews * overdueNorm
  )
}

// ----------------------------------------------------------------------------
// 4. DETECÇÃO CRÍTICA + DECISÃO DE REAJUSTE + HORIZONTE DE RECUPERAÇÃO
// ----------------------------------------------------------------------------
export function detectCriticalDelay(
  dayStatuses: ReplanDayStatus[],
  thresholdDays = CRITICAL_MISSED_DAYS,
): boolean {
  let streak = 0
  for (const d of dayStatuses) {
    if (d.classification === "NAO_REALIZADO") {
      streak++
      if (streak >= thresholdDays) return true
    } else {
      streak = 0
    }
  }
  return false
}

export function shouldReplan(autoEnabled: boolean, trigger: ReplanTrigger): boolean {
  if (trigger === "MANUAL") return true
  return autoEnabled
}

/** Pendência é leve se ≤ 25% da carga futura disponível (recuperação 1-2 dias). */
export function isLightPendency(totalPendingMinutes: number, futureCapacitySum: number): boolean {
  if (futureCapacitySum <= 0) return totalPendingMinutes === 0
  return totalPendingMinutes <= futureCapacitySum * 0.25
}

export function pickRecoveryHorizon(args: {
  totalPendingMinutes: number
  futureCapacitySum: number
  critical: boolean
  examDaysLeft: number | null
}): number {
  if (args.examDaysLeft !== null && args.examDaysLeft < 14) return 2
  if (args.critical) return 5
  if (isLightPendency(args.totalPendingMinutes, args.futureCapacitySum)) return 2
  return 5
}

// ----------------------------------------------------------------------------
// 5. DISTRIBUIÇÃO (NÃO CRIAR BOLA DE NEVE)
// ----------------------------------------------------------------------------
export function distributePendencies(args: {
  pendingBlocks: ReplanPending[] // parcelas: um bloco pendente do passado
  futureDays: ReplanCapacityDay[]
  futureBlocksByDate: Map<string, ReplanBlock[]>
  alreadyDistributedBlockIds: Set<string>
  horizonDays: number
  maxDailyMinutesCap?: number
}): { assignmentsByDate: Record<string, ReplanAssignment[]>; unscheduledMinutes: number } {
  const assignmentsByDate: Record<string, ReplanAssignment[]> = {}
  const loadByDate = new Map<string, number>()
  for (const day of args.futureDays) {
    const base = (args.futureBlocksByDate.get(day.date) ?? []).reduce(
      (acc, b) => acc + b.durationMinutes,
      0,
    )
    loadByDate.set(day.date, base)
    assignmentsByDate[day.date] = []
  }

  const days = args.futureDays.slice(0, args.horizonDays)
  let unscheduled = 0

  for (const parcel of args.pendingBlocks) {
    if (args.alreadyDistributedBlockIds.has(parcel.blockId)) continue
    let remaining = parcel.pendingMinutes

    for (const day of days) {
      if (remaining <= 0) break
      const maxDaily = Math.min(
        args.maxDailyMinutesCap ?? MAX_DAILY_MINUTES_CAP,
        day.maxDailyMinutes,
      )
      const current = loadByDate.get(day.date) ?? 0
      const available = Math.max(0, maxDaily - current)
      if (available <= 0) continue
      const take = Math.min(remaining, available)
      const list = assignmentsByDate[day.date] ?? []
      list.push({
        pendingBlockId: parcel.blockId,
        itemId: parcel.itemId,
        disciplineId: parcel.disciplineId,
        disciplineName: parcel.disciplineName,
        minutes: take,
      })
      assignmentsByDate[day.date] = list
      loadByDate.set(day.date, current + take)
      remaining -= take
    }

    unscheduled += Math.max(0, remaining)
  }

  return { assignmentsByDate, unscheduledMinutes: unscheduled }
}

// ----------------------------------------------------------------------------
// 6. MONTAGEM DO DIA AJUSTADO (reordenação + variedade + anti-duplicação)
// ----------------------------------------------------------------------------
export function buildAdjustedDay(args: {
  date: string
  baseBlocks: ReplanBlock[]
  assignments: ReplanAssignment[]
}): ReplanAdjustedDay {
  type Slot =
    { kind: "base"; block: ReplanBlock } | { kind: "assignment"; assignment: ReplanAssignment }
  const list: Slot[] = args.baseBlocks.map((b) => ({ kind: "base", block: b }))

  for (const assignment of args.assignments) {
    const disciplineId = assignment.disciplineId
    let insertIndex = -1
    for (let i = 0; i <= list.length; i++) {
      const prev = i > 0 ? list[i - 1] : null
      const next = i < list.length ? list[i] : null
      let prevDisc: string | null = null
      let nextDisc: string | null = null
      if (prev)
        prevDisc = prev.kind === "base" ? prev.block.disciplineId : prev.assignment.disciplineId
      if (next)
        nextDisc = next.kind === "base" ? next.block.disciplineId : next.assignment.disciplineId
      if (prevDisc !== disciplineId && nextDisc !== disciplineId) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === -1) insertIndex = list.length
    list.splice(insertIndex, 0, { kind: "assignment", assignment })
  }

  const baseBlocks: ReplanBlock[] = []
  const assignments: ReplanAssignment[] = []
  for (const item of list) {
    if (item.kind === "assignment") assignments.push(item.assignment)
    else baseBlocks.push(item.block)
  }

  const totalLoadMinutes =
    args.baseBlocks.reduce((acc, b) => acc + b.durationMinutes, 0) +
    args.assignments.reduce((acc, a) => acc + a.minutes, 0)

  return { date: args.date, baseBlocks, assignments, totalLoadMinutes }
}

// ----------------------------------------------------------------------------
// 7. ORQUESTRAÇÃO PURA
// ----------------------------------------------------------------------------
// Passos: pendências por bloco → status dos dias → pendências por disciplina
// (priorizadas) → detecção crítica → horizonte de recuperação → distribuição →
// dias ajustados. Não faz I/O: o chamador persiste o resultado.
export function computeReplan(input: ReplanInput): ReplanResult {
  const tolerance = input.toleranceMinutes ?? DEFAULT_TOLERANCE_MINUTES

  const pendingBlocks = computePendingBlocks(input.pastBlocks, input.sessions, tolerance)
  const dayStatuses = computeDayStatuses(input.pastBlocks, input.sessions, tolerance)

  if (pendingBlocks.length === 0) {
    return {
      ran: false,
      reason: "no_pendency",
      pendingBlocks: [],
      dayStatuses,
      disciplinePendencies: [],
      totalPendingMinutes: 0,
      unscheduledMinutes: 0,
      assignmentsByDate: {},
      adjustedDays: [],
      critical: false,
      horizonDays: 0,
    }
  }

  const disciplinePendencies = computeDisciplinePendencies(pendingBlocks, input.context)
  const totalPendingMinutes = pendingBlocks.reduce((acc, p) => acc + p.pendingMinutes, 0)
  const critical = detectCriticalDelay(dayStatuses)

  const futureCapacitySum = input.futureDays.reduce((acc, d) => acc + d.baseLoadMinutes, 0)
  const horizonDays = pickRecoveryHorizon({
    totalPendingMinutes,
    futureCapacitySum,
    critical,
    examDaysLeft: input.context.examDaysLeft,
  })

  // Parcelas ordenadas pela prioridade da disciplina (prioridade desc)
  const priorityByDiscipline = new Map(
    disciplinePendencies.map((d) => [d.disciplineId, d.priorityScore]),
  )
  const orderedParcels = [...pendingBlocks].sort((a, b) => {
    const pa = priorityByDiscipline.get(a.disciplineId) ?? 0
    const pb = priorityByDiscipline.get(b.disciplineId) ?? 0
    if (pa !== pb) return pb - pa
    return a.scheduledDate.localeCompare(b.scheduledDate)
  })

  const { assignmentsByDate, unscheduledMinutes } = distributePendencies({
    pendingBlocks: orderedParcels,
    futureDays: input.futureDays,
    futureBlocksByDate: input.futureBlocksByDate,
    alreadyDistributedBlockIds: input.alreadyDistributedBlockIds,
    horizonDays,
    ...(input.maxDailyMinutesCap !== undefined
      ? { maxDailyMinutesCap: input.maxDailyMinutesCap }
      : {}),
  })

  const adjustedDays: ReplanAdjustedDay[] = input.futureDays.slice(0, horizonDays).map((day) => {
    const base = input.futureBlocksByDate.get(day.date) ?? []
    const assignments = assignmentsByDate[day.date] ?? []
    return buildAdjustedDay({ date: day.date, baseBlocks: base, assignments })
  })

  return {
    ran: true,
    reason: critical ? "critical_rebuild" : "normal_redistribution",
    pendingBlocks,
    dayStatuses,
    disciplinePendencies,
    totalPendingMinutes,
    unscheduledMinutes,
    assignmentsByDate,
    adjustedDays,
    critical,
    horizonDays,
  }
}
