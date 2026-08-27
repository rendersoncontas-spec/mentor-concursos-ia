// ============================================================================
// SERVIÇO CENTRALIZADO DE PLANEJAMENTO SEMANAL ADAPTATIVO — NOMEIA
// ----------------------------------------------------------------------------
// Fonte única de verdade para:
// 1. Definição da semana (respeitando weekStartDay / firstDayOfWeek).
// 2. Cálculo do tempo real estudado (exclusivo do study_history).
// 3. Cálculo do saldo restante da meta semanal.
// 4. Reconciliação e distribuição idempotente dos blocos futuros da semana.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import { isShiftDayForDate } from "@/features/planejamento/lib/planning-form"
import { getDayInSaoPaulo, todayKeyInSaoPaulo } from "@/lib/sao-paulo"
import { getSaoPauloWeekRange, type WeekRangeInfo } from "@/lib/study-time-calculator"

import {
  MAX_DAILY_MINUTES_CAP,
  distributeWeeklyRemainingGoal,
  type DistributeWeeklyGoalResult,
} from "./replan/replan-engine"

export interface ReconcileAvailability {
  studyDays: string[]
  scheduleMode: string
  firstShiftDay: number
  anchorShiftDate?: string | undefined
  customShiftDays?: Record<string, string> | undefined
}

const DEFAULT_AVAILABILITY: ReconcileAvailability = {
  studyDays: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
  scheduleMode: "normal",
  firstShiftDay: 2,
}

const WEEKDAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]

export interface WeeklyStudySummary {
  weekStartKey: string
  weekEndKey: string
  todayKey: string
  weekDays: string[]
  weeklyGoalHours: number
  weeklyGoalMinutes: number
  realStudiedMinutesThisWeek: number
  remainingMinutesToGoal: number
  remainingAvailableDaysInWeek: string[]
  weekDistribution: DistributeWeeklyGoalResult
}

/**
 * Retorna os limites da semana (respeitando weekStartDay: 0 = Domingo, 1 = Segunda).
 */
export function getCurrentWeekRange(
  referenceDate: string | Date = new Date(),
  weekStartDay: number = 0,
): WeekRangeInfo {
  return getSaoPauloWeekRange(referenceDate, weekStartDay)
}

/**
 * Retorna o tempo REAL estudado na semana atual vindo exclusivamente do study_history.
 */
export async function getWeeklyRealStudyTime(
  supabase: SupabaseClient,
  userId: string,
  weekRange: WeekRangeInfo,
): Promise<{
  totalMinutes: number
  byDate: Map<string, number>
  byDiscipline: Map<string, number>
}> {
  const { data } = await supabase
    .from("study_history")
    .select("discipline_id, duration_minutes, started_at")
    .eq("user_id", userId)
    .gte("started_at", `${weekRange.mondayKey}T00:00:00.000Z`)
    .lte("started_at", `${weekRange.sundayKey}T23:59:59.999Z`)
    .not("duration_minutes", "is", null)

  const byDate = new Map<string, number>()
  const byDiscipline = new Map<string, number>()
  let totalMinutes = 0

  for (const row of (data ?? []) as Array<{
    discipline_id: string
    duration_minutes: number
    started_at: string
  }>) {
    if (!row.started_at) continue
    const dateKey = getDayInSaoPaulo(row.started_at)
    if (dateKey >= weekRange.mondayKey && dateKey <= weekRange.sundayKey) {
      const mins = Number(row.duration_minutes) || 0
      totalMinutes += mins
      byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + mins)
      if (row.discipline_id) {
        byDiscipline.set(row.discipline_id, (byDiscipline.get(row.discipline_id) ?? 0) + mins)
      }
    }
  }

  return { totalMinutes, byDate, byDiscipline }
}

/**
 * Verifica se uma data é dia disponível para estudo.
 */
export function isAvailableStudyDate(
  dateKey: string,
  availability: ReconcileAvailability = DEFAULT_AVAILABILITY,
): boolean {
  if (availability.customShiftDays?.[dateKey] === "PLANTAO") return false
  if (availability.customShiftDays?.[dateKey] === "FOLGA_ESTUDO") return true

  if (availability.scheduleMode !== "normal") {
    const [y, m, d] = dateKey.split("-").map(Number)
    const padM = String(m).padStart(2, "0")
    const padD = String(d).padStart(2, "0")
    const effectiveAnchor =
      availability.anchorShiftDate ||
      `${y}-${padM}-${String(availability.firstShiftDay).padStart(2, "0")}`

    if (isShiftDayForDate(dateKey, effectiveAnchor, availability.scheduleMode)) {
      return false
    }
  }

  const [year, month, day] = dateKey.split("-").map(Number)
  const dayOfWeek = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1).getDay()
  const weekdayKey = WEEKDAY_KEYS[dayOfWeek] ?? ""
  return availability.studyDays.includes(weekdayKey)
}

/**
 * Calcula o sumário completo da semana (meta, estudo real, saldo e distribuição).
 */
export async function getWeeklyPlanSummary(
  supabase: SupabaseClient,
  userId: string,
  availability: ReconcileAvailability = DEFAULT_AVAILABILITY,
): Promise<WeeklyStudySummary> {
  const todayKey = todayKeyInSaoPaulo()

  // 1. Buscar meta semanal e preferência de primeiro dia
  const { data: profile } = await supabase
    .from("profiles")
    .select("weekly_study_hours, week_start_day, preferences")
    .eq("id", userId)
    .maybeSingle()

  const weeklyGoalHours =
    (profile as { weekly_study_hours?: number } | null)?.weekly_study_hours ?? 20
  const weeklyGoalMinutes = weeklyGoalHours * 60

  const prefsFirstDay = (profile?.preferences as Record<string, unknown> | null)?.["firstDayOfWeek"]
  const weekStartDay =
    prefsFirstDay === "Domingo"
      ? 0
      : prefsFirstDay === "Segunda-feira"
        ? 1
        : ((profile as { week_start_day?: number } | null)?.week_start_day ?? 0)

  // 2. Limites da semana atual
  const weekRange = getCurrentWeekRange(todayKey, weekStartDay)

  // 3. Estudo real na semana (study_history)
  const { totalMinutes: realStudiedMinutesThisWeek } = await getWeeklyRealStudyTime(
    supabase,
    userId,
    weekRange,
  )

  // 4. Saldo restante da meta
  const remainingMinutesToGoal = Math.max(0, weeklyGoalMinutes - realStudiedMinutesThisWeek)

  // 5. Dias restantes disponíveis na semana
  const remainingAvailableDaysInWeek = weekRange.weekDays.filter(
    (d) => d >= todayKey && isAvailableStudyDate(d, availability),
  )

  // 6. Distribuição estrita
  const weekDistribution = distributeWeeklyRemainingGoal({
    weeklyGoalMinutes,
    realStudiedMinutesThisWeek,
    remainingAvailableDays: remainingAvailableDaysInWeek,
    maxDailyMinutesCap: MAX_DAILY_MINUTES_CAP,
  })

  return {
    weekStartKey: weekRange.mondayKey,
    weekEndKey: weekRange.sundayKey,
    todayKey,
    weekDays: weekRange.weekDays,
    weeklyGoalHours,
    weeklyGoalMinutes,
    realStudiedMinutesThisWeek,
    remainingMinutesToGoal,
    remainingAvailableDaysInWeek,
    weekDistribution,
  }
}

/**
 * RECONCILIAÇÃO AUTOMÁTICA DO CRONOGRAMA SEMANAL (reconcileWeeklyPlan)
 *
 * Garante que:
 * 1. O total planejado nos dias restantes da semana NUNCA ultrapasse o saldo da meta.
 * 2. Dias de plantão fiquem com 0 blocos.
 * 3. Blocos passados ou concluídos NUNCA sejam apagados ou modificados.
 * 4. A execução seja 100% IDEMPOTENTE.
 */
export async function reconcileWeeklyPlan(
  supabase: SupabaseClient,
  userId: string,
  availability: ReconcileAvailability = DEFAULT_AVAILABILITY,
): Promise<{ ok: boolean; summary: WeeklyStudySummary }> {
  const summary = await getWeeklyPlanSummary(supabase, userId, availability)
  const { todayKey, weekDays, weekDistribution, remainingAvailableDaysInWeek } = summary

  // 1. Carregar plano ativo e itens
  const { data: plan } = await supabase
    .from("study_plans")
    .select("id, plan_type")
    .eq("user_id", userId)
    .eq("active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return { ok: true, summary }

  const { data: items } = await supabase
    .from("study_plan_items")
    .select("id, discipline_id, duration_minutes, priority_score, day_of_week")
    .eq("study_plan_id", plan.id)

  if (!items || items.length === 0) return { ok: true, summary }

  // 2. Carregar blocos existentes da semana
  const { data: existingBlocks } = await supabase
    .from("study_plan_daily_blocks")
    .select("id, scheduled_date, duration_minutes, status, origin, item_id")
    .eq("study_plan_id", plan.id)
    .gte("scheduled_date", summary.weekStartKey)
    .lte("scheduled_date", summary.weekEndKey)

  const existing = (existingBlocks ?? []) as Array<{
    id: string
    scheduled_date: string
    duration_minutes: number
    status: string
    origin: string
    item_id: string | null
  }>

  // 3. Ajuste de excesso para dias a partir de HOJE até o fim da semana
  for (const dateKey of weekDays) {
    if (dateKey < todayKey) continue // NUNCA alterar o passado

    const blocksOnDate = existing.filter((b) => b.scheduled_date === dateKey)
    const isAvailable = remainingAvailableDaysInWeek.includes(dateKey)
    const targetForDay = isAvailable ? (weekDistribution.targetMinutesByDay[dateKey] ?? 0) : 0

    // Somente blocos pendentes não concluídos podem ser ajustados
    const pendingBlocks = blocksOnDate.filter(
      (b) => (b.status as string) === "PENDENTE" && (b.status as string) !== "CONCLUIDO_MANUAL",
    )
    const totalPlannedOnDay = blocksOnDate.reduce((acc, b) => acc + (b.duration_minutes || 0), 0)

    if (!isAvailable || targetForDay === 0) {
      // Dia sem capacidade (plantão ou meta atingida): remove blocos pendentes
      const idsToDelete = pendingBlocks.map((b) => b.id)
      if (idsToDelete.length > 0) {
        await supabase.from("study_plan_daily_blocks").delete().in("id", idsToDelete)
      }
    } else if (totalPlannedOnDay > targetForDay) {
      // Excedente no dia: podar da cauda até atingir exatamente o alvo
      let currentDaySum = totalPlannedOnDay
      for (let i = pendingBlocks.length - 1; i >= 0; i--) {
        const pb = pendingBlocks[i]
        if (!pb) continue
        if (currentDaySum <= targetForDay) break

        const excess = currentDaySum - targetForDay
        if (pb.duration_minutes <= excess) {
          await supabase.from("study_plan_daily_blocks").delete().eq("id", pb.id)
          currentDaySum -= pb.duration_minutes
        } else {
          const newDuration = pb.duration_minutes - excess
          if (newDuration >= 15) {
            await supabase
              .from("study_plan_daily_blocks")
              .update({ duration_minutes: newDuration })
              .eq("id", pb.id)
            currentDaySum -= excess
          } else {
            await supabase.from("study_plan_daily_blocks").delete().eq("id", pb.id)
            currentDaySum -= pb.duration_minutes
          }
        }
      }
    }
  }

  // 4. Log informativo no servidor
  if (process.env.NODE_ENV !== "production") {
    console.log("[REPLAN]", {
      semana: `${summary.weekStartKey} -> ${summary.weekEndKey}`,
      metaMinutos: summary.weeklyGoalMinutes,
      estudadoReal: summary.realStudiedMinutesThisWeek,
      saldoRestante: summary.remainingMinutesToGoal,
      diasDisponiveis: remainingAvailableDaysInWeek,
      distribuicaoPorDia: weekDistribution.targetMinutesByDay,
      totalDistribuido: weekDistribution.totalDistributedMinutes,
    })
  }

  return { ok: true, summary }
}
