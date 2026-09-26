"use server"

import { revalidatePath } from "next/cache"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  parseFirstShiftDay,
  parseShiftAnchorDate,
  parseStudyDays,
  parseWorkScale,
  resolvePlanningPreferences,
  type PlanningLocalPrefs,
  type ResolvedPlanningPrefs,
} from "./planning-preferences"
import type { ReplanAvailability } from "./replan/adaptive-replan.service"
import { DEFAULT_AVAILABILITY } from "./replan/adaptive-replan.service"

export type PlanningPreferencesResult = ResolvedPlanningPrefs & {
  weeklyGoalHours: number | null
}

/**
 * P1.5 — lê a fonte oficial (profiles) e resolve contra o legado local
 * enviado pelo cliente. Banco vence; local válido migra (migrateUp);
 * inválido é ignorado. Nunca confia no cliente como autoridade de userId.
 */
export async function getPlanningPreferencesAction(
  local?: PlanningLocalPrefs,
): Promise<{ data: PlanningPreferencesResult | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId) return { data: null, error: "Usuário não autenticado" }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("work_scale, first_shift_day, shift_anchor_date, study_days, weekly_study_hours")
      .eq("id", effectiveUserId)
      .maybeSingle()

    // Colunas P1.5 podem ainda não existir (migration pendente): trata como
    // ausência (fallback legado), sem quebrar a leitura.
    if (profileError) {
      const missingColumn =
        profileError.code === "42703" ||
        /work_scale|first_shift_day|shift_anchor_date|study_days/.test(profileError.message ?? "")
      if (!missingColumn) return { data: null, error: "Erro ao carregar preferências." }
    }

    const row = (profile ?? {}) as Record<string, unknown>
    const resolved = resolvePlanningPreferences(
      {
        workScale: typeof row["work_scale"] === "string" ? row["work_scale"] : null,
        firstShiftDay: typeof row["first_shift_day"] === "number" ? row["first_shift_day"] : null,
        shiftAnchorDate: typeof row["shift_anchor_date"] === "string" ? row["shift_anchor_date"] : null,
        studyDays: Array.isArray(row["study_days"]) ? (row["study_days"] as string[]) : null,
      },
      {
        workScale: local?.workScale ?? null,
        firstShiftDay: local?.firstShiftDay ?? null,
        shiftAnchorDate: local?.shiftAnchorDate ?? null,
        studyDays: local?.studyDays ?? null,
        customScale: local?.customScale ?? null,
      },
    )

    const weekly =
      typeof row["weekly_study_hours"] === "number" && Number.isFinite(row["weekly_study_hours"])
        ? (row["weekly_study_hours"] as number)
        : null

    return { data: { ...resolved, weeklyGoalHours: weekly }, error: null }
  } catch {
    return { data: null, error: "Erro ao carregar preferências." }
  }
}

export interface SavePlanningPreferencesInput {
  workScale?: unknown
  firstShiftDay?: unknown
  shiftAnchorDate?: unknown
  studyDays?: unknown
}

/**
 * P1.5 — persiste preferências validadas. UPDATE somente das 4 colunas,
 * escopado ao usuário efetivo (RLS reforça). Concorrência: escrita simples
 * por campo é suficiente (preferências independentes, sem soma/contador);
 * última escrita vence por campo, sem perda de dados relacionados.
 */
export async function savePlanningPreferencesAction(
  input: SavePlanningPreferencesInput,
): Promise<{ ok: boolean; error: string | null }> {
  if (isMaintenanceMode()) return { ok: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId) return { ok: false, error: "Usuário não autenticado." }

    const updateData: Record<string, unknown> = {}
    if (input.workScale !== undefined) {
      const v = parseWorkScale(input.workScale)
      if (input.workScale !== null && v === null) return { ok: false, error: "Escala inválida." }
      updateData["work_scale"] = v
    }
    if (input.firstShiftDay !== undefined) {
      const v = parseFirstShiftDay(input.firstShiftDay)
      if (input.firstShiftDay !== null && v === null) {
        return { ok: false, error: "Primeiro plantão deve ser um dia de 1 a 31." }
      }
      updateData["first_shift_day"] = v
    }
    if (input.shiftAnchorDate !== undefined) {
      const v = parseShiftAnchorDate(input.shiftAnchorDate)
      if (input.shiftAnchorDate !== null && input.shiftAnchorDate !== "" && v === null) {
        return { ok: false, error: "Data âncora inválida." }
      }
      updateData["shift_anchor_date"] = v
    }
    if (input.studyDays !== undefined) {
      const v = parseStudyDays(input.studyDays)
      if (v === null) return { ok: false, error: "Dias de estudo inválidos." }
      updateData["study_days"] = v
    }

    if (Object.keys(updateData).length === 0) return { ok: true, error: null }

    const { error } = await supabase.from("profiles").update(updateData).eq("id", effectiveUserId)
    if (error) {
      // Colunas ainda sem migration: informa sem quebrar o fluxo do wizard.
      if (error.code === "42703") {
        return { ok: false, error: "Preferências ainda não habilitadas no banco." }
      }
      return { ok: false, error: "Falha ao salvar preferências." }
    }

    revalidatePath("/planejamento")
    return { ok: true, error: null }
  } catch {
    return { ok: false, error: "Erro ao salvar preferências." }
  }
}

export interface ServerAvailabilityInput {
  studyDays?: string[] | undefined
  scheduleMode?: string | undefined
  firstShiftDay?: number | undefined
  anchorShiftDate?: string | undefined
}

/**
 * P1.5 item 15 — o replan recebe configuração resolvida pelo SERVIDOR.
 * Precedência por campo: input do cliente (quando válido) > banco > default.
 * Input inválido nunca prevalece sobre o banco; nunca confia cegamente.
 */
export async function resolveServerAvailability(
  supabase: SupabaseClient,
  userId: string,
  input?: ServerAvailabilityInput,
): Promise<ReplanAvailability> {
  let row: Record<string, unknown> = {}
  try {
    const res = await supabase
      .from("profiles")
      .select("work_scale, first_shift_day, shift_anchor_date, study_days")
      .eq("id", userId)
      .maybeSingle()
    if (res?.data && typeof res.data === "object") row = res.data as Record<string, unknown>
  } catch {
    /* sem banco: cai nos defaults/valores válidos do input */
  }

  const inputDays = parseStudyDays(input?.studyDays)
  const dbDays = parseStudyDays(Array.isArray(row["study_days"]) ? row["study_days"] : null)
  const studyDays =
    inputDays ?? dbDays ?? [...DEFAULT_AVAILABILITY.studyDays]

  const inputMode = parseWorkScale(input?.scheduleMode)
  const dbMode = parseWorkScale(typeof row["work_scale"] === "string" ? row["work_scale"] : null)
  const scheduleMode = inputMode ?? dbMode ?? DEFAULT_AVAILABILITY.scheduleMode

  const inputFirst = parseFirstShiftDay(input?.firstShiftDay)
  const dbFirst = parseFirstShiftDay(typeof row["first_shift_day"] === "number" ? row["first_shift_day"] : null)
  const firstShiftDay = inputFirst ?? dbFirst ?? DEFAULT_AVAILABILITY.firstShiftDay

  const inputAnchor = parseShiftAnchorDate(input?.anchorShiftDate)
  const dbAnchor = parseShiftAnchorDate(typeof row["shift_anchor_date"] === "string" ? row["shift_anchor_date"] : null)
  const anchorShiftDate = inputAnchor ?? dbAnchor ?? undefined

  const out: ReplanAvailability = { studyDays: [...studyDays], scheduleMode, firstShiftDay }
  if (anchorShiftDate) out.anchorShiftDate = anchorShiftDate
  return out
}
