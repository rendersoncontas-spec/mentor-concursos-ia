"use server"

import { revalidatePath } from "next/cache"

import { pickNextDisciplineColor } from "@/application/disciplines/discipline-color.service"
import {
  deactivateUserStudyPlan,
  generateStudyPlan,
} from "@/application/study-plan/study-plan.service"
import {
  MAX_WEEKLY_HOURS,
  MIN_WEEKLY_HOURS,
  validatePlanningForm,
} from "@/features/planejamento/lib/planning-form"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

export type GeneratePlanResult =
  { success: true; planId: string; version: number } | { success: false; error: string }

type GeneratePlanConfig = {
  horasSemana?: number | string | Array<number | string>
  nivel?: string
  importanceMap?: Record<string, unknown>
  knowledgeMap?: Record<string, unknown>
}

export async function generateStudyPlanAction(
  reason: string = "manual",
  config?: GeneratePlanConfig,
): Promise<GeneratePlanResult> {
  if (isMaintenanceMode()) return { success: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    // Buscar target ativo
    const { data: rawTarget } = await supabase
      .from("user_targets")
      .select("id, exam_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single()

    if (!rawTarget) {
      return { success: false, error: "Nenhum concurso ativo encontrado." }
    }

    let targetWeeklyHours: number | undefined = undefined

    if (config) {
      const rawHours = Array.isArray(config.horasSemana)
        ? config.horasSemana[0]
        : config.horasSemana
      const hoursNum =
        typeof rawHours === "number" ? rawHours : parseInt(String(rawHours ?? ""), 10) || NaN

      // Mesma validação do wizard (cliente e servidor usam planning-form.ts)
      const serverValidation = validatePlanningForm({
        mode: "ciclo",
        weeklyHours: Number.isFinite(hoursNum) ? hoursNum : NaN,
        dayConfigMode: "semana",
        scale: "normal",
        customWorkDays: 3,
        customOffDays: 2,
        firstShiftDay: 2,
        studyDays: [],
        minMinutes: 30,
        maxMinutes: 180,
        sessionStyle: "equilibradas",
        selectedDisciplines: Object.keys(config.importanceMap || {}),
        importanceMap: (config.importanceMap || {}) as Record<string, number>,
        knowledgeMap: (config.knowledgeMap || {}) as Record<string, number>,
      })
      if (!serverValidation.ok) {
        return { success: false, error: serverValidation.errors[0] || "Dados inválidos." }
      }

      targetWeeklyHours = Number.isFinite(hoursNum)
        ? Math.min(MAX_WEEKLY_HOURS, Math.max(MIN_WEEKLY_HOURS, Math.round(hoursNum)))
        : 25

      // 1. Atualizar perfil com os dados do Wizard (nível, horas/semana)
      await supabase
        .from("profiles")
        .update({
          experience_level: config.nivel || "iniciante",
          weekly_study_hours: targetWeeklyHours,
        })
        .eq("id", user.id)

      // 2. Apagar disciplinas antigas caso esteja gerando do Wizard e tenha enviado as novas
      if (config.importanceMap && config.knowledgeMap) {
        await supabase
          .from("user_disciplines")
          .delete()
          .eq("user_id", user.id)
          .eq("target_id", rawTarget.id)

        const discNames = Object.keys(config.importanceMap)
        const toInsert = []

        for (const name of discNames) {
          let { data: d } = await supabase
            .from("disciplines")
            .select("id")
            .eq("name", name)
            .maybeSingle()
          if (!d) {
            const color = await pickNextDisciplineColor(supabase)
            const res = await supabase
              .from("disciplines")
              .insert({ name, area: "Geral", ...(color ? { color_hex: color } : {}) })
              .select("id")
              .single()
            d = res.data
          }
          if (d) {
            // Em uma versão mais complexa, salvaríamos o peso/dificuldade no user_disciplines ou num config
            toInsert.push({
              user_id: user.id,
              target_id: rawTarget.id,
              discipline_id: d.id,
              status: "STUDYING",
            })
          }
        }

        if (toInsert.length > 0) {
          await supabase.from("user_disciplines").insert(toInsert)
        }
      } else {
        // Fallback antigo
        const { data: userDiscs } = await supabase
          .from("user_disciplines")
          .select("id")
          .eq("user_id", user.id)
          .eq("target_id", rawTarget.id)
          .limit(1)
        if (!userDiscs || userDiscs.length === 0) {
          // ... (fallback genérico)
        }
      }
    }

    const plan = await generateStudyPlan(supabase, user.id, reason, rawTarget.id, targetWeeklyHours)

    if (!plan) {
      return {
        success: false,
        error:
          "Não foi possível gerar o cronograma. Verifique se seu concurso e disciplinas estão configurados.",
      }
    }

    revalidatePath("/planejamento")
    revalidatePath("/study-plan")
    revalidatePath("/dashboard")
    revalidatePath("/planos")

    return { success: true, planId: plan.id, version: plan.version }
  } catch (err: unknown) {
    console.error("generateStudyPlanAction error:", err)
    return { success: false, error: "Erro interno ao gerar o cronograma." }
  }
}

export async function deactivateStudyPlanAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, error: "Usuário não autenticado." }

    const ok = await deactivateUserStudyPlan(supabase, user.id)
    if (ok) {
      revalidatePath("/planejamento")
      revalidatePath("/dashboard")
      revalidatePath("/planos")
    }
    return { success: ok }
  } catch (err: unknown) {
    console.error("deactivateStudyPlanAction error:", err)
    return { success: false, error: "Erro ao desativar planejamento." }
  }
}
