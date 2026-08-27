"use server"

import { revalidatePath } from "next/cache"

import * as Sentry from "@sentry/nextjs"

import { reconcileWeeklyPlan } from "@/application/study-plan/weekly-planner.service"
import { createClient } from "@/infrastructure/supabase/server"

import {
  DEFAULT_AVAILABILITY,
  REPLAN_MAINTENANCE_PAUSED,
  type PeriodFilter,
  type PeriodGoalData,
  type ReplanAvailability,
  type ReplanInfoPayload,
  type ReplanSummary,
  closeBlockManually,
  getAutoReplanPreference,
  getPeriodGoalData,
  getReplanInfo,
  runAdaptiveReplanning,
  setAutoReplanPreference,
  undoLastReplanning,
} from "./adaptive-replan.service"

const REPLAN_PATHS = ["/planejamento", "/dashboard"]

export interface ReplanAvailabilityInput {
  studyDays?: string[] | undefined
  scheduleMode?: string | undefined
  firstShiftDay?: number | undefined
  anchorShiftDate?: string | undefined
}

function normalizeAvailability(input?: ReplanAvailabilityInput): ReplanAvailability {
  const result: ReplanAvailability = {
    studyDays:
      input?.studyDays && input.studyDays.length > 0
        ? input.studyDays
        : DEFAULT_AVAILABILITY.studyDays,
    scheduleMode: input?.scheduleMode || DEFAULT_AVAILABILITY.scheduleMode,
    firstShiftDay:
      typeof input?.firstShiftDay === "number"
        ? input.firstShiftDay
        : DEFAULT_AVAILABILITY.firstShiftDay,
  }
  if (input?.anchorShiftDate) {
    result.anchorShiftDate = input.anchorShiftDate
  }
  return result
}

/**
 * Informações para o Cronograma do Dia (gatilho automático "ao abrir o planejamento"):
 * se a automação estiver ON, executa o replanejamento de forma segura (idempotente)
 * e retorna a janela ajustada. Se OFF, apenas informa pendências.
 */
export async function getReplanInfoAction(
  availabilityInput?: ReplanAvailabilityInput,
): Promise<{ data: ReplanInfoPayload | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const availability = normalizeAvailability(availabilityInput)
    const autoEnabled = await getAutoReplanPreference(supabase, user.id)

    // REGRA 0 — manutenção: não disparar o replanejamento em leitura
    // (abrir página, dashboard, trocar data, F5, salvar sessão).
    if (autoEnabled && !REPLAN_MAINTENANCE_PAUSED) {
      await runAdaptiveReplanning(supabase, user.id, { trigger: "AUTO", autoEnabled, availability })
    }

    await reconcileWeeklyPlan(supabase, user.id, availability).catch(() => null)

    const info = await getReplanInfo(supabase, user.id, availability, autoEnabled)
    return { data: info, error: null }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: "adaptive-planning", step: "get_replan_info_action" },
    })
    return { data: null, error: "Erro ao carregar informações do cronograma." }
  }
}

/** Botão "Recalcular cronograma" — disparo manual explícito (sempre executa). */
export async function runReplanningAction(
  availabilityInput?: ReplanAvailabilityInput,
): Promise<{ data: ReplanSummary | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const availability = normalizeAvailability(availabilityInput)
    const summary = await runAdaptiveReplanning(supabase, user.id, {
      trigger: "MANUAL",
      autoEnabled: true,
      availability,
    })

    await reconcileWeeklyPlan(supabase, user.id, availability).catch(() => null)

    for (const path of REPLAN_PATHS) revalidatePath(path)
    return { data: summary, error: null }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: "adaptive-planning", step: "run_replanning_action" },
    })
    return { data: null, error: "Erro ao recalcular o cronograma." }
  }
}

/** Desfazer o último reajuste (apenas eventos não-críticos, janela segura). */
export async function undoReplanningAction(
  eventId: string,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Usuário não autenticado" }

    const result = await undoLastReplanning(supabase, user.id, eventId)
    if (result.ok) {
      for (const path of REPLAN_PATHS) revalidatePath(path)
    }
    return { ok: result.ok, error: result.error ?? null }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: "adaptive-planning", step: "undo_replanning_action" },
    })
    return { ok: false, error: "Erro ao desfazer o reajuste." }
  }
}

/** "Marcar como concluído hoje" — decisão explícita do aluno: encerra o bloco
 *  mesmo parcial e perdoa a pendência restante (não será reprogramada). */
export async function closeBlockManuallyAction(
  blockId: string,
  plannedMinutes: number,
  realizedMinutes: number,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Usuário não autenticado" }

    const result = await closeBlockManually(
      supabase,
      user.id,
      blockId,
      plannedMinutes,
      realizedMinutes,
    )
    if (result.ok) {
      for (const path of REPLAN_PATHS) revalidatePath(path)
    }
    return { ok: result.ok, error: result.error ?? null }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: "adaptive-planning", step: "close_block_manually_action" },
    })
    return { ok: false, error: "Erro ao concluir o bloco." }
  }
}

/** Preferência "Reajustar automaticamente meu cronograma" (ON/OFF). */
export async function setAutoReplanPreferenceAction(
  enabled: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Usuário não autenticado" }

    const result = await setAutoReplanPreference(supabase, user.id, enabled)
    for (const path of REPLAN_PATHS) revalidatePath(path)
    return { ok: result.ok, error: result.error ?? null }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: "adaptive-planning", step: "set_preference_action" },
    })
    return { ok: false, error: "Erro ao salvar preferência." }
  }
}

/**
 * Dados de meta de estudo vs tempo real para um período.
 * Retorna: meta, estudado, falta — tudo calculado a partir de registros reais.
 */
export async function getPeriodGoalAction(
  period: PeriodFilter = "semana",
  offset = 0,
): Promise<{ data: PeriodGoalData | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const data = await getPeriodGoalData(supabase, user.id, period, offset)
    return { data, error: null }
  } catch (error) {
    Sentry.captureException(error, {
      extra: { feature: "adaptive-planning", step: "get_period_goal_action" },
    })
    return { data: null, error: "Erro ao carregar dados de meta." }
  }
}
