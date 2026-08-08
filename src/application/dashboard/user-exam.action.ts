"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export interface SaveUserExamInput {
  examName?: string
  examDate: string // YYYY-MM-DD
  examTime?: string // HH:MM
  examLocation?: string
}

export async function saveUserExamAction(input: SaveUserExamInput) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    if (!input.examDate) {
      return { success: false, error: "A data da prova é obrigatória." }
    }

    // Buscar o target ativo do usuário
    const { data: target } = await supabase
      .from("user_targets")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const examName = input.examName?.trim() || target?.target_exam || "Minha Prova"

    const metaPayload = JSON.stringify({
      examDate: input.examDate,
      examTime: input.examTime || null,
      examLocation: input.examLocation || null,
      examName: examName,
    })

    if (target?.id) {
      // 1. Tentar atualização completa com colunas dedicadas e fallback no main_study_source
      const { error: directError } = await supabase
        .from("user_targets")
        .update({
          target_exam: examName,
          exam_date: input.examDate,
          exam_time: input.examTime || null,
          exam_location: input.examLocation || null,
          exam_name: examName,
          main_study_source: metaPayload,
        })
        .eq("id", target.id)

      if (directError) {
        // Fallback resiliente: salvar target_exam e main_study_source
        const { error: fallbackError } = await supabase
          .from("user_targets")
          .update({
            target_exam: examName,
            main_study_source: metaPayload,
          })
          .eq("id", target.id)

        if (fallbackError) {
          console.error("Erro ao salvar data da prova no Supabase:", fallbackError)
          return { success: false, error: "Falha ao salvar no banco de dados." }
        }
      }
    } else {
      // 2. Criar novo target se não existir
      const { error: insertError } = await supabase.from("user_targets").insert({
        user_id: user.id,
        target_exam: examName,
        target_role: "Concurseiro",
        main_study_source: metaPayload,
        is_active: true,
        exam_date: input.examDate,
        exam_time: input.examTime || null,
        exam_location: input.examLocation || null,
        exam_name: examName,
      })

      if (insertError) {
        // Fallback insert com colunas básicas
        const { error: fallbackInsertError } = await supabase.from("user_targets").insert({
          user_id: user.id,
          target_exam: examName,
          target_role: "Concurseiro",
          main_study_source: metaPayload,
          is_active: true,
        })

        if (fallbackInsertError) {
          console.error("Erro ao criar prova no Supabase:", fallbackInsertError)
          return { success: false, error: "Falha ao cadastrar a prova no banco." }
        }
      }
    }

    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true }
  } catch (err) {
    console.error("saveUserExamAction error:", err)
    return { success: false, error: "Erro interno ao salvar a data da prova." }
  }
}

export async function deleteUserExamAction() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const { data: target } = await supabase
      .from("user_targets")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (target?.id) {
      const { error: directError } = await supabase
        .from("user_targets")
        .update({
          exam_date: null,
          exam_time: null,
          exam_location: null,
          exam_name: null,
          main_study_source: null,
        })
        .eq("id", target.id)

      if (directError) {
        await supabase
          .from("user_targets")
          .update({
            main_study_source: null,
          })
          .eq("id", target.id)
      }
    }

    revalidatePath("/dashboard")
    revalidatePath("/planejamento")

    return { success: true }
  } catch (err) {
    console.error("deleteUserExamAction error:", err)
    return { success: false, error: "Erro interno ao excluir a prova." }
  }
}
