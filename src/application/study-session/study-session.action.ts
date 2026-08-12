"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export async function saveStudySessionAction(data: Record<string, unknown>) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: "Usuário não autenticado. Faça login novamente." }
    }

    // 1. Busca Disciplina (não cria mais - RLS impede INSERT na tabela disciplines)
    let disciplineId = data["discipline_id"]
    if (!disciplineId && data["discipline_name"]) {
      const { data: existingDisc, error: findError } = await supabase
        .from("disciplines")
        .select("id")
        .ilike("name", String(data["discipline_name"]))
        .maybeSingle()

      if (findError) {
        console.error("Erro ao buscar disciplina:", findError)
      }

      if (existingDisc) {
        disciplineId = existingDisc.id
      } else {
        return {
          success: false,
          error: "Disciplina não encontrada no sistema. Selecione uma disciplina existente na lista.",
        }
      }
    }

    if (!disciplineId) {
      return { success: false, error: "Disciplina não encontrada e não foi possível criar." }
    }

    // 2. Monta o Metadata
    const metadata: Record<string, unknown> = {
      pages_read: data["pages_read"] || 0,
      questions_answered: data["questions_answered"] || 0,
      questions_correct: data["questions_correct"] || 0,
      flashcards_reviewed: data["flashcards_reviewed"] || 0,
      flashcards_correct: data["flashcards_correct"] || 0,
      audio_name: data["audio_name"] || null,
      audio_author: data["audio_author"] || null,
      audio_platform: data["audio_platform"] || null,
      audio_speed: data["audio_speed"] || null,
      audio_url: data["audio_url"] || null,
      focus_percentage: data["focusPercentage"] || 0,
      completed_cycles: data["completedCycles"] || 0,
      topic_name: data["topic_name"] || null,
    }

    // 3. Calcular duração real
    let activeMinutesFinal = 0
    let pausedMinutesFinal = 0
    let startedAtISO: string | null = null
    let finishedAtISO: string | null = null

    if (!data["is_manual_mode"] && data["sessionStartTime"]) {
      const now = Date.now()
      const startTime = Number(data["sessionStartTime"])
      // Desconta o total de pausas já finalizadas E a pausa em andamento (se houver),
      // espelhando o cálculo do client (calculateTimes).
      let totalPausedMs = Number(data["sessionTotalPausedMs"] || 0)
      const lastPauseStartTime = Number(data["sessionLastPauseStartTime"])
      if (lastPauseStartTime > 0) {
        totalPausedMs += Math.max(0, now - lastPauseStartTime)
      }

      const totalElapsedMs = now - startTime
      const activeMs = Math.max(0, totalElapsedMs - totalPausedMs)

      // Banco espera integer — arredondar para inteiro
      activeMinutesFinal = Math.round(activeMs / 60000)
      pausedMinutesFinal = Math.round(totalPausedMs / 60000)

      startedAtISO = new Date(startTime).toISOString()
      finishedAtISO = new Date().toISOString()
    } else {
      // Modo manual: garantir que sejam inteiros
      activeMinutesFinal = Math.round(Number(data["activeMinutes"]) || 0)
      pausedMinutesFinal = Math.round(Number(data["pausedMinutes"]) || 0)
    }

    // 4. Mapear studyType → study_source (campo NOT NULL com CHECK constraint)
    // Valores permitidos: 'PLAN', 'FREE', 'REVIEW', 'SIMULADO', 'QUESTOES', 'VIDEO', 'PDF'
    const studySourceMap: Record<string, string> = {
      TEORIA: 'FREE',
      QUESTOES: 'QUESTOES',
      REVISAO: 'REVIEW',
      AUDIO: 'FREE',
      VIDEOAULA: 'VIDEO',
      SIMULADO: 'SIMULADO',
      OUTRO: 'FREE',
      RESUMO: 'FREE',
      MAPA_MENTAL: 'FREE',
      FLASHCARDS: 'FREE',
      LEITURA: 'FREE',
      LEI_SECA: 'FREE',
      JURISPRUDENCIA: 'FREE',
      INFORMATIVOS: 'FREE',
      DOUTRINA: 'FREE',
      MONITORIA: 'FREE',
      ESTUDO_IA: 'FREE',
      DISCUSSAO: 'FREE',
    }
    const studySource = studySourceMap[String(data["studyType"])] || 'FREE'

    // 5. Monta o payload base do study_history
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      discipline_id: disciplineId,
      study_source: studySource,  // OBRIGATÓRIO com CHECK constraint
      study_type: data["studyType"] || null,
      technique: data["technique"] || null,
      active_minutes: activeMinutesFinal,
      paused_minutes: pausedMinutesFinal,
      duration_minutes: activeMinutesFinal,
      completed: true,
      interrupted: false,
      notes: data["notes"] || null,
      metadata: metadata,
    }

    // Se for cronômetro, usar timestamps reais
    if (startedAtISO) {
      insertPayload["started_at"] = startedAtISO
      insertPayload["finished_at"] = finishedAtISO
    } else if (data["study_date"]) {
      // Manual com data retroativa
      insertPayload["started_at"] = new Date(String(data["study_date"]) + "T12:00:00").toISOString()
      insertPayload["finished_at"] = insertPayload["started_at"]
    } else {
      // Manual sem data específica
      const now = new Date().toISOString()
      insertPayload["started_at"] = now
      insertPayload["finished_at"] = now
    }

    // 6. Salva no study_history
    const { data: historyData, error: historyError } = await supabase
      .from("study_history")
      .insert(insertPayload)
      .select("id")
      .single()

    if (historyError) {
      console.error("[STUDY_SAVE] Erro ao inserir study_history:", historyError)
      return {
        success: false,
        error: "Erro ao salvar sessão: " + (historyError.message || JSON.stringify(historyError)),
        code: historyError.code,
      }
    }

    // Revalidar páginas que dependem de dados de sessão
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/history")
    revalidatePath("/estatisticas")
    revalidatePath("/home")

    return { success: true, historyId: historyData.id }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro inesperado ao salvar."
    console.error("[saveStudySession] Erro inesperado:", err)
    return { success: false, error: message }
  }
}