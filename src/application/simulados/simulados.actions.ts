"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { revalidatePath } from "next/cache"

export async function getSimuladosAction() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: "Usuário não autenticado" }

    const { data, error } = await supabase
      .from("simulados")
      .select(`
        *,
        simulado_disciplines (*)
      `)
      .eq("user_id", user.id)
      .order("simulado_date", { ascending: false })

    if (error) throw error

    return { data, error: null }
  } catch (error: any) {
    return { data: [], error: error.message }
  }
}

export async function createSimuladoAction(simulado: any, disciplines: any[]) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Usuário não autenticado" }

    // Cria o cabeçalho
    const { data: createdSimulado, error: simError } = await supabase
      .from("simulados")
      .insert({
        user_id: user.id,
        name: simulado.name,
        exam_board: simulado.banca,
        style: simulado.style,
        time_spent_seconds: simulado.timeSpent,
        simulado_date: simulado.date,
        comments: simulado.comments,
        total_questions: simulado.totalQuestions,
        total_correct: simulado.totalCorrect,
        total_blank: simulado.totalBlank,
        total_wrong: simulado.totalWrong,
        score_percentage: simulado.scorePercentage
      })
      .select()
      .single()

    if (simError) throw simError

    // Cria as disciplinas filhas
    if (disciplines && disciplines.length > 0) {
      const inserts = disciplines.map(d => ({
        simulado_id: createdSimulado.id,
        user_id: user.id,
        discipline_name: d.name,
        weight: d.peso,
        questions_count: d.totalQuestions,
        correct_count: d.correct,
        blank_count: d.blank,
        wrong_count: d.wrong
      }))

      const { error: discError } = await supabase
        .from("simulado_disciplines")
        .insert(inserts)

      if (discError) throw discError
    }

    revalidatePath("/simulados")
    return { error: null }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function deleteSimuladoAction(simuladoId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: "Usuário não autenticado" }

    const { error } = await supabase
      .from("simulados")
      .delete()
      .eq("id", simuladoId)
      .eq("user_id", user.id)

    if (error) throw error

    revalidatePath("/simulados")
    return { error: null }
  } catch (error: any) {
    return { error: error.message }
  }
}
