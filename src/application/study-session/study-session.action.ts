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

    // 3. Calcular duração real com precisão de segundos
    //
    // FONTE DE VERDADE: Se temos sessionStartTime (timestamp do frontend),
    // calcular server-side: duration = (now - startTime - totalPausedMs) / 1000
    // Se não temos (modo manual), usar activeMinutes do input.
    //
    let activeMinutesFinal = 0
    let pausedMinutesFinal = 0
    let startedAtISO: string | null = null

    if (!data.is_manual_mode && data.sessionStartTime) {
      // === MODO CRONÔMETRO: calcular server-side a partir de timestamps ===
      const now = Date.now()
      const startTime = Number(data.sessionStartTime)
      const totalPausedMs = Number(data.sessionTotalPausedMs || 0)

      // Duração ativa = tempo total decorrido - tempo pausado
      const totalElapsedMs = now - startTime
      const activeMs = Math.max(0, totalElapsedMs - totalPausedMs)

      // Converter para minutos com precisão (arredondar para 1 decimal)
      activeMinutesFinal = Math.round((activeMs / 60000) * 10) / 10
      pausedMinutesFinal = Math.round((totalPausedMs / 60000) * 10) / 10

      // started_at para o banco = timestamp real de início
      startedAtISO = new Date(startTime).toISOString()
    } else {
      // === MODO MANUAL: usar input do usuário ===
      activeMinutesFinal = data.activeMinutes || 0
      pausedMinutesFinal = data.pausedMinutes || 0
    }

    // 4. Monta o payload base do study_history
    const insertPayload: Record<string, any> = {
      user_id: user.id,
      discipline_id: disciplineId,
      study_type: data.studyType,
      technique: data.technique,
      active_minutes: activeMinutesFinal,
      paused_minutes: pausedMinutesFinal,
      duration_minutes: activeMinutesFinal, // duração = tempo ativo
      completed: true,
      notes: data.notes || null,
      metadata: metadata,
    }

    // 4a. Se for cronômetro, usar started_at real
    if (startedAtISO) {
      insertPayload["started_at"] = startedAtISO
      insertPayload["finished_at"] = new Date().toISOString()
    } else if (data.study_date) {
      // Se for lançamento manual com data retroativa
      insertPayload["started_at"] = new Date(data.study_date + "T12:00:00").toISOString()
    }

    // 5. Salva no study_history
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
