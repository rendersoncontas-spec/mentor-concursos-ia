"use server"

import { createClient } from "@/infrastructure/supabase/server"

export async function saveStudySessionAction(data: any) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("Auth error:", authError)
      return { success: false, error: "Usuário não autenticado. Faça login novamente." }
    }

    // 1. Busca ou cria Disciplina
    let disciplineId = data.discipline_id
    if (!disciplineId && data.discipline_name) {
      // Buscar se existe a disciplina global pelo nome
      const { data: existingDisc, error: findError } = await supabase
        .from("disciplines")
        .select("id")
        .ilike("name", data.discipline_name)
        .maybeSingle()

      if (findError) {
        console.error("Erro ao buscar disciplina:", findError)
      }

      if (existingDisc) {
        disciplineId = existingDisc.id
      } else {
        // Criar nova disciplina
        const { data: newDisc, error: discError } = await supabase
          .from("disciplines")
          .insert({ name: data.discipline_name, area: "Geral" })
          .select("id")
          .single()
          
        if (discError) {
          console.error("Erro ao criar disciplina:", discError)
          return { success: false, error: "Erro ao criar disciplina: " + discError.message }
        }
        disciplineId = newDisc.id
      }
    }

    if (!disciplineId) {
      return { success: false, error: "Disciplina não encontrada e não foi possível criar." }
    }

    // 2. Monta o Metadata
    const metadata = {
      pages_read: data.pages_read || 0,
      questions_answered: data.questions_answered || 0,
      questions_correct: data.questions_correct || 0,
      audio_name: data.audio_name || null,
      audio_author: data.audio_author || null,
      audio_platform: data.audio_platform || null,
      audio_speed: data.audio_speed || null,
      audio_url: data.audio_url || null,
      focus_percentage: data.focusPercentage || 0,
      completed_cycles: data.completedCycles || 0,
      topic_name: data.topic_name || null,
    }

    // 3. Monta o payload base do study_history
    const insertPayload: Record<string, any> = {
      user_id: user.id,
      discipline_id: disciplineId,
      study_type: data.studyType,
      technique: data.technique,
      active_minutes: data.activeMinutes || 0,
      paused_minutes: data.pausedMinutes || 0,
      duration_minutes: data.activeMinutes || 0,
      completed: true,
      notes: data.notes || null,
      metadata: metadata,
    }

    // 3a. Se for lançamento manual com data retroativa, inclui started_at
    if (data.study_date) {
      insertPayload["started_at"] = new Date(data.study_date + "T12:00:00").toISOString()
    }

    console.log("[saveStudySession] Inserindo:", JSON.stringify(insertPayload, null, 2))

    // 4. Salva no study_history
    const { data: historyData, error: historyError } = await supabase
      .from("study_history")
      .insert(insertPayload)
      .select("id")
      .single()

    if (historyError) {
      console.error("Erro ao inserir study_history:", historyError)
      return { success: false, error: "Erro ao salvar: " + historyError.message }
    }

    return { success: true, historyId: historyData.id }

  } catch (err: any) {
    console.error("[saveStudySession] Erro inesperado:", err)
    return { success: false, error: err.message || "Erro inesperado ao salvar." }
  }
}
