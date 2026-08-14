"use server"

import { revalidatePath } from "next/cache"

import * as Sentry from "@sentry/nextjs"

import { createClient } from "@/infrastructure/supabase/server"

import {
  DEFAULT_AVAILABILITY,
  type ReplanAvailability,
  type ReplanInfoPayload,
  type ReplanSummary,
  closeBlockManually,
  getAutoReplanPreference,
  getReplanInfo,
  runAdaptiveReplanning,
  setAutoReplanPreference,
  undoLastReplanning,
} from "./adaptive-replan.service"

const REPLAN_PATHS = ["/planejamento", "/dashboard"]

export interface ReplanAvailabilityInput {
  studyDays?: string[]
  scheduleMode?: string
  firstShiftDay?: number
}

function normalizeAvailability(input?: ReplanAvailabilityInput): ReplanAvailability {
  return {
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

    if (autoEnabled) {
      await runAdaptiveReplanning(supabase, user.id, { trigger: "AUTO", autoEnabled, availability })
    }

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
