"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { invalidateStatisticsCenterCache } from "@/application/study-analytics/statistics-center.action"
import { weeklyGoalsSchema, type WeeklyGoalsInput } from "./goals.schema"

export async function saveWeeklyGoalsAction(data: WeeklyGoalsInput) {
  try {
    const validatedData = weeklyGoalsSchema.parse(data)
    const supabase = await createClient()

    const { data: userData, error: userError } = await supabase.auth.getUser()
    
    if (userError || !userData.user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        weekly_study_hours: validatedData.weekly_study_hours,
        weekly_questions_goal: validatedData.weekly_questions_goal,
        weekly_revisions_goal: validatedData.weekly_revisions_goal,
        weekly_study_days_goal: validatedData.weekly_study_days_goal,
        week_start_day: validatedData.week_start_day
      })
      .eq("id", userData.user.id)

    if (error) {
      console.error("Erro ao salvar metas semanais:", error)
      return { success: false, error: "Falha ao salvar metas." }
    }

    await invalidateStatisticsCenterCache(userData.user.id)
    revalidatePath("/dashboard")
    revalidatePath("/estatisticas")
    return { success: true }
  } catch (err: unknown) {
    console.error("Erro na server action de metas:", err)
    return { success: false, error: "Dados inválidos ou erro interno." }
  }
}
