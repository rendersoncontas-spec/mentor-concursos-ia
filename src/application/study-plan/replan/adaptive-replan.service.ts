// ============================================================================
// SERVIÇO DE REPLANEJAMENTO ADAPTATIVO — ORQUESTRAÇÃO (I/O)
// ----------------------------------------------------------------------------
// Camada com acesso ao banco que usa o motor puro (replan-engine.ts):
//   1. garante a janela de blocos datados (BASE) para passado e futuro;
//   2. calcula pendências planejado × realizado a partir do histórico;
//   3. distribui pelos próximos dias respeitando capacidade diária;
//   4. persiste blocos REAJUSTE/CRITICO + evento de reajuste (transparência);
//   5. permite desfazer (somente reajustes não-críticos).
//
// Regras: nunca modificar o passado; somente o futuro é reescrito.
// ============================================================================
import * as Sentry from "@sentry/nextjs"
import type { SupabaseClient } from "@supabase/supabase-js"

import { isShiftDayForScale } from "@/features/planejamento/lib/planning-form"
import { todayKeyInSaoPaulo } from "@/lib/sao-paulo"

import {
  MAX_DAILY_MINUTES_CAP,
  type ReplanBlock,
  type ReplanBlockStatus,
  type ReplanCapacityDay,
  type ReplanContext,
  type ReplanSession,
  type ReplanTrigger,
  addDaysToKey,
  computePendingBlocks,
  computeReplan,
} from "./replan-engine"

export const REPLAN_LOOKBACK_DAYS = 7
export const REPLAN_FORWARD_DAYS = 7
export const FEATURE = "adaptive-planning"

// ---------------------------------------------------------------------------
// Tipos de apoio
// ---------------------------------------------------------------------------

export interface ReplanAvailability {
  studyDays: string[] // ["seg","ter",...]
  scheduleMode: string // "normal" | "12x36" | ...
  firstShiftDay: number // 0-6 (0=dom)
}

export const DEFAULT_AVAILABILITY: ReplanAvailability = {
  studyDays: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
  scheduleMode: "normal",
  firstShiftDay: 2,
}

interface PlanRow {
  id: string
  plan_type: "CICLO_ROTATIVO" | "CRONOGRAMA_SEMANAL"
  generated_at: string
  created_at: string
}

interface PlanItemRow {
  id: string
  discipline_id: string
  day_of_week: number
  duration_minutes: number
  priority_score: number
  discipline_name: string
}

interface DailyBlockRow {
  id: string
  item_id: string | null
  discipline_id: string
  scheduled_date: string
  duration_minutes: number
  execution_order: number
  status: string
  origin: string
  source_block_id: string | null
}

interface SessionRow {
  id: string
  started_at: string
  discipline_id: string
  study_plan_item_id: string | null
  duration_minutes: number
  metadata: Record<string, unknown> | null
}

export interface ReplanSummary {
  ran: boolean
  reason: string
  eventId: string | null
  pendingMinutes: number
  pendingBlocks: number
  distributedDays: number
  unscheduledMinutes: number
  critical: boolean
  message: string
}

// ---------------------------------------------------------------------------
// Disponibilidade (espelha a lógica do cliente em daily-planning-view)
// ---------------------------------------------------------------------------

const DAY_LABEL_BY_WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]

export function isShiftDay(dateKey: string, firstShiftDay: number, scheduleMode: string): boolean {
  if (scheduleMode === "normal") return false
  const dayNum = Number(dateKey.slice(8, 10))
  if (Number.isNaN(dayNum)) return false
  return isShiftDayForScale(dayNum, firstShiftDay, scheduleMode)
}

export function isStudyDate(dateKey: string, availability: ReplanAvailability): boolean {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay()
  const label = DAY_LABEL_BY_WEEKDAY[weekday] ?? "dom"
  if (!availability.studyDays.includes(label)) return false
  if (
    availability.scheduleMode !== "normal" &&
    isShiftDay(dateKey, availability.firstShiftDay, availability.scheduleMode)
  ) {
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Leitura de dados
// ---------------------------------------------------------------------------

async function loadActivePlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ plan: PlanRow; items: PlanItemRow[] } | null> {
  const { data: plan } = await supabase
    .from("study_plans")
    .select("id, plan_type, generated_at, created_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return null

  const { data: rawItems } = await supabase
    .from("study_plan_items")
    .select(
      `
      id, discipline_id, day_of_week, duration_minutes, priority_score,
      disciplines ( name )
    `,
    )
    .eq("study_plan_id", plan.id)
    .order("priority", { ascending: true })

  const items: PlanItemRow[] = (
    (rawItems ?? []) as unknown as Array<{
      id: string
      discipline_id: string
      day_of_week: number
      duration_minutes: number
      priority_score: number
      disciplines: { name: string } | { name: string }[]
    }>
  ).map((r) => {
    const disc = Array.isArray(r.disciplines) ? r.disciplines[0] : r.disciplines
    return {
      id: r.id,
      discipline_id: r.discipline_id,
      day_of_week: r.day_of_week,
      duration_minutes: r.duration_minutes,
      priority_score: r.priority_score,
      discipline_name: disc?.name ?? "Disciplina",
    }
  })

  return { plan, items }
}

async function loadWindowBlocks(
  supabase: SupabaseClient,
  planId: string,
  fromKey: string,
  toKey: string,
): Promise<DailyBlockRow[]> {
  const { data } = await supabase
    .from("study_plan_daily_blocks")
    .select(
      "id, item_id, discipline_id, scheduled_date, duration_minutes, execution_order, status, origin, source_block_id",
    )
    .eq("study_plan_id", planId)
    .gte("scheduled_date", fromKey)
    .lte("scheduled_date", toKey)
  return (data ?? []) as DailyBlockRow[]
}

async function loadSessions(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<ReplanSession[]> {
  const { data } = await supabase
    .from("study_history")
    .select("id, started_at, discipline_id, study_plan_item_id, duration_minutes, metadata")
    .eq("user_id", userId)
    .gte("started_at", sinceIso)

  return ((data ?? []) as unknown as SessionRow[]).map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    disciplineId: r.discipline_id,
    studyPlanItemId: r.study_plan_item_id,
    durationMinutes: r.duration_minutes || 0,
    metadata: r.metadata,
  }))
}

async function loadOverdueReviewsByDiscipline(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const { data } = await supabase
    .from("review_items")
    .select("discipline_id, next_review_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("is_suspended", false)

  const now = Date.now()
  for (const r of (data ?? []) as Array<{ discipline_id: string; next_review_at: string | null }>) {
    if (!r.next_review_at) continue
    if (new Date(r.next_review_at).getTime() < now) {
      map.set(r.discipline_id, (map.get(r.discipline_id) ?? 0) + 1)
    }
  }
  return map
}

async function loadExamDaysLeft(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data } = await supabase
    .from("user_targets")
    .select("exam_date")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const examDate = (data as { exam_date?: string | null } | null)?.exam_date
  if (!examDate) return null
  const today = new Date(`${todayKeyInSaoPaulo()}T00:00:00Z`)
  const exam = new Date(`${examDate}T00:00:00Z`)
  const diff = Math.round((exam.getTime() - today.getTime()) / 86_400_000)
  return diff >= 0 ? diff : null
}

// ---------------------------------------------------------------------------
// Geração da janela BASE (datas passadas + futuras) — idempotente
// ---------------------------------------------------------------------------

/**
 * Seleção determinística dos blocos de uma data, espelhando a lógica atual do
 * cliente (daily-planning-view). Plano semanal: itens por dia da semana.
 * Ciclo rotativo: rotação por dia do ano.
 */
export function selectBlocksForDate(
  dateKey: string,
  planType: string,
  items: PlanItemRow[],
): { item: PlanItemRow; executionOrder: number }[] {
  if (items.length === 0) return []

  if (planType === "CRONOGRAMA_SEMANAL") {
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay()
    return items
      .filter((i) => i.day_of_week === weekday)
      .sort((a, b) => a.day_of_week - b.day_of_week || a.priority_score - b.priority_score)
      .map((item, idx) => ({ item, executionOrder: idx + 1 }))
  }

  // CICLO_ROTATIVO — espelha o cliente (todos os dias como dias de estudo)
  const activeDaysCount = 7
  const totalMinutes = items.reduce((acc, i) => acc + i.duration_minutes, 0)
  const targetDailyMinutes =
    totalMinutes > 0 ? Math.max(30, Math.round(totalMinutes / activeDaysCount)) : 180
  const blocksPerDay = Math.max(1, Math.round(items.length / activeDaysCount))
  const year = Number(dateKey.slice(0, 4))
  const dayOfYear = Math.floor(
    (new Date(`${dateKey}T00:00:00Z`).getTime() - new Date(`${year}-01-01T00:00:00Z`).getTime()) /
      86_400_000,
  )
  const startIndex = (dayOfYear * blocksPerDay) % items.length

  const selected: { item: PlanItemRow; executionOrder: number }[] = []
  let accumulated = 0
  let idx = 0
  while (accumulated < targetDailyMinutes && idx < items.length) {
    const item = items[(startIndex + idx) % items.length]
    if (item) {
      selected.push({ item, executionOrder: idx + 1 })
      accumulated += item.duration_minutes
    }
    idx++
  }
  return selected
}

export async function ensureDailyWindow(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanRow,
  items: PlanItemRow[],
  todayKey: string,
  availability: ReplanAvailability,
  lookbackDays = REPLAN_LOOKBACK_DAYS,
  forwardDays = REPLAN_FORWARD_DAYS,
): Promise<void> {
  const fromKey = addDaysToKey(todayKey, -lookbackDays)
  const toKey = addDaysToKey(todayKey, forwardDays)

  const existing = await loadWindowBlocks(supabase, plan.id, fromKey, toKey)
  const existingDates = new Set(existing.map((b) => b.scheduled_date))

  const toInsert: Record<string, unknown>[] = []
  for (let d = -lookbackDays; d <= forwardDays; d++) {
    const dateKey = addDaysToKey(todayKey, d)
    if (existingDates.has(dateKey)) continue
    if (!isStudyDate(dateKey, availability)) continue

    const selected = selectBlocksForDate(dateKey, plan.plan_type, items)
    for (const { item, executionOrder } of selected) {
      toInsert.push({
        user_id: userId,
        study_plan_id: plan.id,
        item_id: item.id,
        discipline_id: item.discipline_id,
        scheduled_date: dateKey,
        duration_minutes: item.duration_minutes,
        execution_order: executionOrder,
        status: "PENDENTE",
        origin: "BASE",
      })
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("study_plan_daily_blocks").insert(toInsert)
    if (error) {
      Sentry.captureException(error, { extra: { feature: FEATURE, step: "ensure_daily_window" } })
    }
  }
}

// ---------------------------------------------------------------------------
// Replanejamento adaptativo
// ---------------------------------------------------------------------------

export interface RunReplanArgs {
  trigger: ReplanTrigger
  autoEnabled: boolean
  availability?: ReplanAvailability
}

export async function runAdaptiveReplanning(
  supabase: SupabaseClient,
  userId: string,
  args: RunReplanArgs,
): Promise<ReplanSummary> {
  const todayKey = todayKeyInSaoPaulo()
  const availability = args.availability ?? DEFAULT_AVAILABILITY

  try {
    const loaded = await loadActivePlan(supabase, userId)
    if (!loaded) {
      return {
        ran: false,
        reason: "no_plan",
        eventId: null,
        pendingMinutes: 0,
        pendingBlocks: 0,
        distributedDays: 0,
        unscheduledMinutes: 0,
        critical: false,
        message: "Nenhum plano ativo.",
      }
    }
    const { plan, items } = loaded

    await ensureDailyWindow(supabase, userId, plan, items, todayKey, availability)

    const windowBlocks = await loadWindowBlocks(
      supabase,
      plan.id,
      addDaysToKey(todayKey, -REPLAN_LOOKBACK_DAYS),
      addDaysToKey(todayKey, REPLAN_FORWARD_DAYS),
    )

    const pastBlocks: ReplanBlock[] = []
    const futureBaseBlocks = new Map<string, ReplanBlock[]>()
    const futureDays: ReplanCapacityDay[] = []
    const alreadyDistributedBlockIds = new Set<string>()

    for (const row of windowBlocks) {
      const block: ReplanBlock = {
        blockId: row.id,
        itemId: row.item_id,
        disciplineId: row.discipline_id,
        disciplineName: items.find((i) => i.id === row.item_id)?.discipline_name ?? "Disciplina",
        scheduledDate: row.scheduled_date,
        durationMinutes: row.duration_minutes,
        executionOrder: row.execution_order,
        origin: row.origin as ReplanBlock["origin"],
        status: row.status as ReplanBlockStatus,
      }
      if (row.scheduled_date < todayKey) {
        pastBlocks.push(block)
      } else if (row.scheduled_date > todayKey) {
        if (row.origin === "BASE") {
          const list = futureBaseBlocks.get(row.scheduled_date) ?? []
          list.push(block)
          futureBaseBlocks.set(row.scheduled_date, list)
        } else if (row.source_block_id) {
          alreadyDistributedBlockIds.add(row.source_block_id)
        }
      }
    }

    for (let d = 1; d <= REPLAN_FORWARD_DAYS; d++) {
      const dateKey = addDaysToKey(todayKey, d)
      const base = futureBaseBlocks.get(dateKey) ?? []
      const baseLoad = base.reduce((acc, b) => acc + b.durationMinutes, 0)
      const isStudyDay = isStudyDate(dateKey, availability)
      const capacity = isStudyDay ? baseLoad : 0
      const maxDaily = isStudyDay
        ? Math.min(MAX_DAILY_MINUTES_CAP, Math.round(capacity * 1.25) + 15)
        : 0
      futureDays.push({
        date: dateKey,
        baseLoadMinutes: capacity,
        maxDailyMinutes: Math.max(capacity, maxDaily),
      })
    }

    const sessions = await loadSessions(supabase, userId, plan.generated_at || plan.created_at)
    const overdueReviews = await loadOverdueReviewsByDiscipline(supabase, userId)
    const examDaysLeft = await loadExamDaysLeft(supabase, userId)

    // Contexto por disciplina: peso normalizado + desempenho recente
    const disciplineContexts = new Map<
      string,
      { weightNorm: number; accuracy: number | null; overdueReviews: number }
    >()
    const weightByDiscipline = new Map<string, number[]>()
    const statsByDiscipline = new Map<string, { correct: number; answered: number }>()
    for (const item of items) {
      const list = weightByDiscipline.get(item.discipline_id) ?? []
      list.push(Number(item.priority_score) || 1)
      weightByDiscipline.set(item.discipline_id, list)
    }
    for (const s of sessions) {
      const meta = (s as ReplanSession & { metadata: Record<string, unknown> | null }).metadata
      const answered = Number(meta?.["questions_answered"] ?? 0)
      const correct = Number(meta?.["questions_correct"] ?? 0)
      if (answered > 0) {
        const st = statsByDiscipline.get(s.disciplineId) ?? { correct: 0, answered: 0 }
        st.answered += answered
        st.correct += correct
        statsByDiscipline.set(s.disciplineId, st)
      }
    }
    const maxWeight = Math.max(
      1,
      ...[...weightByDiscipline.values()].map((l) => l.reduce((a, b) => a + b, 0) / l.length),
    )
    for (const item of items) {
      const weights = weightByDiscipline.get(item.discipline_id) ?? [1]
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length
      const st = statsByDiscipline.get(item.discipline_id)
      const accuracy = st && st.answered > 0 ? st.correct / st.answered : null
      disciplineContexts.set(item.discipline_id, {
        weightNorm: Math.min(1, Math.max(0.05, avg / maxWeight)),
        accuracy,
        overdueReviews: overdueReviews.get(item.discipline_id) ?? 0,
      })
    }

    const context: ReplanContext = {
      todayStr: todayKey,
      disciplineContexts,
      examDaysLeft,
      planType: plan.plan_type,
    }

    const result = computeReplan({
      pastBlocks,
      sessions,
      futureDays,
      futureBlocksByDate: futureBaseBlocks,
      alreadyDistributedBlockIds,
      context,
    })

    if (!result.ran) {
      return {
        ran: false,
        reason: result.reason,
        eventId: null,
        pendingMinutes: 0,
        pendingBlocks: 0,
        distributedDays: 0,
        unscheduledMinutes: 0,
        critical: false,
        message: "Nenhuma pendência.",
      }
    }

    // ---------------------------------------------------------------
    // Persistência do reajuste (somente FUTURO)
    // ---------------------------------------------------------------
    if (result.critical) {
      // Recuperação crítica: regenera a janela futura do zero (sem tocar no passado)
      const { error: delError } = await supabase
        .from("study_plan_daily_blocks")
        .delete()
        .eq("study_plan_id", plan.id)
        .gte("scheduled_date", todayKey)
      if (delError) {
        Sentry.captureException(delError, {
          extra: { feature: FEATURE, step: "critical_rebuild_delete" },
        })
      }
      await ensureDailyWindow(
        supabase,
        userId,
        plan,
        items,
        todayKey,
        availability,
        0,
        REPLAN_FORWARD_DAYS,
      )
    }

    const eventInsert = await supabase
      .from("study_plan_replan_events")
      .insert({
        user_id: userId,
        study_plan_id: plan.id,
        trigger: args.trigger,
        reason: result.reason,
        pending_minutes: result.totalPendingMinutes,
        pending_blocks: result.pendingBlocks.length,
        redistributed_days: Object.values(result.assignmentsByDate).filter((a) => a.length > 0)
          .length,
        unscheduled_minutes: result.unscheduledMinutes,
        critical: result.critical,
        details: { assignmentsByDate: result.assignmentsByDate },
      })
      .select("id")
      .single()

    const eventId = eventInsert.error
      ? null
      : ((eventInsert.data as { id: string } | null)?.id ?? null)
    if (eventInsert.error) {
      Sentry.captureException(eventInsert.error, {
        extra: { feature: FEATURE, step: "event_insert" },
      })
    }

    // Cria (ou mescla) blocos REAJUSTE nos dias futuros
    for (const [date, assignments] of Object.entries(result.assignmentsByDate)) {
      for (const assignment of assignments) {
        const existingBlock = windowBlocks.find(
          (b) =>
            b.item_id === assignment.itemId && b.scheduled_date === date && b.origin === "BASE",
        )
        if (existingBlock) {
          await supabase
            .from("study_plan_daily_blocks")
            .update({ duration_minutes: existingBlock.duration_minutes + assignment.minutes })
            .eq("id", existingBlock.id)
        } else {
          const { error } = await supabase.from("study_plan_daily_blocks").insert({
            user_id: userId,
            study_plan_id: plan.id,
            item_id: assignment.itemId,
            discipline_id: assignment.disciplineId,
            scheduled_date: date,
            duration_minutes: assignment.minutes,
            execution_order: 1,
            status: "PENDENTE",
            origin: result.critical ? "CRITICO" : "REAJUSTE",
            source_block_id: assignment.pendingBlockId,
            replan_event_id: eventId,
          })
          if (error) {
            Sentry.captureException(error, {
              extra: { feature: FEATURE, step: "assignment_insert", date },
            })
          }
        }
      }
    }

    const distributedDays = Object.values(result.assignmentsByDate).filter(
      (a) => a.length > 0,
    ).length
    return {
      ran: true,
      reason: result.reason,
      eventId,
      pendingMinutes: result.totalPendingMinutes,
      pendingBlocks: result.pendingBlocks.length,
      distributedDays,
      unscheduledMinutes: result.unscheduledMinutes,
      critical: result.critical,
      message: buildReplanMessage(result.totalPendingMinutes, distributedDays),
    }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: FEATURE, step: "run_replanning", userId },
    })
    return {
      ran: false,
      reason: "error",
      eventId: null,
      pendingMinutes: 0,
      pendingBlocks: 0,
      distributedDays: 0,
      unscheduledMinutes: 0,
      critical: false,
      message: "Não foi possível recalcular o cronograma.",
    }
  }
}

function buildReplanMessage(pendingMinutes: number, distributedDays: number): string {
  const h = Math.floor(pendingMinutes / 60)
  const m = pendingMinutes % 60
  const time = h > 0 ? `${h}h${m > 0 ? `${m}min` : ""}` : `${m}min`
  return `Identificamos ${time} de estudos pendentes e redistribuímos para os próximos ${distributedDays} dia${distributedDays !== 1 ? "s" : ""}.`
}

// ---------------------------------------------------------------------------
// Desfazer (apenas reajustes não-críticos — janela segura)
// ---------------------------------------------------------------------------

export async function undoLastReplanning(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: event } = await supabase
      .from("study_plan_replan_events")
      .select("id, user_id, critical, reverted_at, study_plan_id")
      .eq("id", eventId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!event) return { ok: false, error: "Evento não encontrado." }
    if (event.critical) return { ok: false, error: "Reajustes críticos não podem ser desfeitos." }
    if (event.reverted_at) return { ok: false, error: "Este reajuste já foi desfeito." }

    const { error: delError } = await supabase
      .from("study_plan_daily_blocks")
      .delete()
      .eq("replan_event_id", eventId)

    if (delError) return { ok: false, error: delError.message }

    const { error: updError } = await supabase
      .from("study_plan_replan_events")
      .update({ reverted_at: new Date().toISOString() })
      .eq("id", eventId)

    if (updError) return { ok: false, error: updError.message }

    return { ok: true }
  } catch (error) {
    Sentry.captureException(error, { extra: { feature: FEATURE, step: "undo_replanning" } })
    return { ok: false, error: "Erro ao desfazer o reajuste." }
  }
}

// ---------------------------------------------------------------------------
// Informações para a interface (banner + painel de pendências)
// ---------------------------------------------------------------------------

export interface ReplanInfoPayload {
  enabled: boolean
  todayStr: string
  dailyBlocks: Record<string, ReplanUiBlock[]>
  pendingByDiscipline: { disciplineId: string; disciplineName: string; pendingMinutes: number }[]
  totalPendingMinutes: number
  unscheduledMinutes: number
  lastEvent: {
    id: string
    createdAt: string
    reason: string
    pendingMinutes: number
    distributedDays: number
    critical: boolean
    revertedAt: string | null
    message: string
  } | null
  hasPlan: boolean
}

export interface ReplanUiBlock {
  id: string
  itemId: string | null
  disciplineId: string
  disciplineName: string
  durationMinutes: number
  executionOrder: number
  origin: string
}

export async function getReplanInfo(
  supabase: SupabaseClient,
  userId: string,
  availability: ReplanAvailability,
  autoEnabled: boolean,
): Promise<ReplanInfoPayload> {
  const todayKey = todayKeyInSaoPaulo()
  const empty: ReplanInfoPayload = {
    enabled: autoEnabled,
    todayStr: todayKey,
    dailyBlocks: {},
    pendingByDiscipline: [],
    totalPendingMinutes: 0,
    unscheduledMinutes: 0,
    lastEvent: null,
    hasPlan: false,
  }

  try {
    const loaded = await loadActivePlan(supabase, userId)
    if (!loaded) return empty
    const { plan, items } = loaded

    await ensureDailyWindow(supabase, userId, plan, items, todayKey, availability)

    const windowBlocks = await loadWindowBlocks(
      supabase,
      plan.id,
      addDaysToKey(todayKey, -REPLAN_LOOKBACK_DAYS),
      addDaysToKey(todayKey, REPLAN_FORWARD_DAYS),
    )

    const dailyBlocks: Record<string, ReplanUiBlock[]> = {}
    const disciplineNameById = new Map(items.map((i) => [i.discipline_id, i.discipline_name]))

    for (const row of windowBlocks) {
      if (row.scheduled_date < todayKey) continue
      const list = dailyBlocks[row.scheduled_date] ?? []
      list.push({
        id: row.id,
        itemId: row.item_id,
        disciplineId: row.discipline_id,
        disciplineName: disciplineNameById.get(row.discipline_id) ?? "Disciplina",
        durationMinutes: row.duration_minutes,
        executionOrder: row.execution_order,
        origin: row.origin,
      })
      dailyBlocks[row.scheduled_date] = list
    }

    const pastBlocks: ReplanBlock[] = windowBlocks
      .filter((r) => r.scheduled_date < todayKey)
      .map((row) => ({
        blockId: row.id,
        itemId: row.item_id,
        disciplineId: row.discipline_id,
        disciplineName: disciplineNameById.get(row.discipline_id) ?? "Disciplina",
        scheduledDate: row.scheduled_date,
        durationMinutes: row.duration_minutes,
        executionOrder: row.execution_order,
        origin: row.origin as ReplanBlock["origin"],
        status: row.status as ReplanBlockStatus,
      }))

    const sessions = await loadSessions(supabase, userId, plan.generated_at || plan.created_at)
    const pendings = computePendingBlocks(pastBlocks, sessions)

    const { data: event } = await supabase
      .from("study_plan_replan_events")
      .select("id, created_at, reason, pending_minutes, redistributed_days, critical, reverted_at")
      .eq("user_id", userId)
      .eq("study_plan_id", plan.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const byDiscipline = new Map<
      string,
      { disciplineId: string; disciplineName: string; pendingMinutes: number }
    >()
    for (const p of pendings) {
      const e = byDiscipline.get(p.disciplineId) ?? {
        disciplineId: p.disciplineId,
        disciplineName: p.disciplineName,
        pendingMinutes: 0,
      }
      e.pendingMinutes += p.pendingMinutes
      byDiscipline.set(p.disciplineId, e)
    }

    const totalPending = [...byDiscipline.values()].reduce((acc, d) => acc + d.pendingMinutes, 0)

    return {
      enabled: autoEnabled,
      todayStr: todayKey,
      dailyBlocks,
      pendingByDiscipline: [...byDiscipline.values()].sort(
        (a, b) => b.pendingMinutes - a.pendingMinutes,
      ),
      totalPendingMinutes: totalPending,
      unscheduledMinutes: 0,
      lastEvent: event
        ? {
            id: event.id,
            createdAt: event.created_at,
            reason: event.reason,
            pendingMinutes: event.pending_minutes,
            distributedDays: event.redistributed_days,
            critical: event.critical,
            revertedAt: event.reverted_at,
            message: buildReplanMessage(event.pending_minutes, event.redistributed_days),
          }
        : null,
      hasPlan: true,
    }
  } catch (error) {
    Sentry.captureException(error, { extra: { feature: FEATURE, step: "get_replan_info" } })
    return empty
  }
}

// ---------------------------------------------------------------------------
// Preferência "Reajustar automaticamente meu cronograma" (ON/OFF)
// ---------------------------------------------------------------------------

export async function getAutoReplanPreference(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle()

  const preferences = (data as { preferences?: Record<string, unknown> | null } | null)?.preferences
  const value = preferences?.["adaptive_replan"]
  if (value === undefined || value === null) return true // padrão ON
  return value === true || value === "true"
}

export async function setAutoReplanPreference(
  supabase: SupabaseClient,
  userId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle()

    const preferences =
      (profile as { preferences?: Record<string, unknown> | null } | null)?.preferences ?? {}
    const { error } = await supabase
      .from("profiles")
      .update({ preferences: { ...preferences, adaptive_replan: enabled } })
      .eq("id", userId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (error) {
    Sentry.captureException(error, { extra: { feature: FEATURE, step: "set_preference" } })
    return { ok: false, error: "Erro ao salvar preferência." }
  }
}
