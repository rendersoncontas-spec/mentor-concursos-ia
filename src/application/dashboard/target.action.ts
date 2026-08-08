"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export interface UserTargetSummary {
  id: string
  target_exam: string
  target_role: string
  is_active: boolean
  exam_name?: string | null
  exam_date?: string | null
  exam_time?: string | null
  exam_location?: string | null
  daysRemaining?: number | null
  editalProgress?: number
}

export async function getUserTargetsAction(): Promise<{ success: boolean; targets?: UserTargetSummary[]; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data: rawTargets, error: targetsError } = await supabase
      .from("user_targets")
      .select("*")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })

    if (targetsError) {
      console.error("Erro ao buscar alvos do usuário:", targetsError)
      return { success: false, error: "Erro ao buscar lista de concursos." }
    }

    // Calcular progresso do edital geral
    let editalProgress = 0
    try {
      const { count: completedCount } = await supabase
        .from("study_plan_items")
        .select("id", { count: "exact", head: true })
        .eq("completed", true)

      const { count: totalCount } = await supabase
        .from("study_plan_items")
        .select("id", { count: "exact", head: true })

      if (totalCount && totalCount > 0) {
        editalProgress = Math.round(((completedCount || 0) / totalCount) * 100)
      }
    } catch {
      editalProgress = 0
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const targets: UserTargetSummary[] = (rawTargets || []).map((t) => {
      let exam_date = t.exam_date || null
      let exam_time = t.exam_time || null
      let exam_location = t.exam_location || null
      let exam_name = t.exam_name || t.target_exam || "Concurso Alvo"

      if (!exam_date && t.main_study_source) {
        try {
          if (t.main_study_source.startsWith("{") && t.main_study_source.endsWith("}")) {
            const meta = JSON.parse(t.main_study_source)
            if (meta.examDate) exam_date = meta.examDate
            if (meta.examTime) exam_time = meta.examTime
            if (meta.examLocation) exam_location = meta.examLocation
            if (meta.examName) exam_name = meta.examName
          }
        } catch {
          // Ignorar se não for JSON válido
        }
      }

      let daysRemaining: number | null = null
      if (exam_date) {
        const targetDate = new Date(exam_date + "T00:00:00")
        const diffTime = targetDate.getTime() - today.getTime()
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }

      return {
        id: t.id,
        target_exam: t.target_exam || "Concurso Alvo",
        target_role: t.target_role || "Concurseiro",
        is_active: Boolean(t.is_active),
        exam_name,
        exam_date,
        exam_time,
        exam_location,
        daysRemaining,
        editalProgress,
      }
    })

    return { success: true, targets }
  } catch (err) {
    console.error("getUserTargetsAction error:", err)
    return { success: false, error: "Erro interno ao carregar concursos." }
  }
}

export async function switchActiveTargetAction(targetId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    if (!targetId) {
      return { success: false, error: "ID do concurso não fornecido." }
    }

    // 1. Desativar todos os alvos do usuário
    const { error: deactivateError } = await supabase
      .from("user_targets")
      .update({ is_active: false })
      .eq("user_id", user.id)

    if (deactivateError) {
      console.error("Erro ao desativar alvos:", deactivateError)
      return { success: false, error: "Falha ao desativar concursos anteriores." }
    }

    // 2. Ativar o alvo selecionado
    const { error: activateError } = await supabase
      .from("user_targets")
      .update({ is_active: true })
      .eq("id", targetId)
      .eq("user_id", user.id)

    if (activateError) {
      console.error("Erro ao ativar novo alvo:", activateError)
      return { success: false, error: "Falha ao ativar o concurso selecionado." }
    }

    // Revalidar todas as páginas dependentes do concurso ativo
    revalidatePath("/dashboard")
    revalidatePath("/planejamento")
    revalidatePath("/edital")
    revalidatePath("/ciclo")
    revalidatePath("/analytics")
    revalidatePath("/revisoes")
    revalidatePath("/questoes")

    return { success: true }
  } catch (err) {
    console.error("switchActiveTargetAction error:", err)
    return { success: false, error: "Erro interno ao trocar de concurso." }
  }
}
