"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"

export async function saveStudySessionAction(data: any) {
  const log = (msg: string, payload?: any) => {
    console.log(`[STUDY_SAVE] ${msg}`, payload !== undefined ? payload : "")
  }

  try {
    log("START", { 
      is_manual_mode: data.is_manual_mode, 
      discipline_id: data.discipline_id, 
      discipline_name: data.discipline_name,
      studyType: data.studyType,
      technique: data.technique,
      has_sessionStartTime: !!data.sessionStartTime,
    })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    log("USER", { userId: user?.id, authError: authError?.message })

    if (authError || !user) {
      log("AUTH_ERROR", authError)
      return { success: false, error: "Usuário não autenticado. Faça login novamente." }
    }

    // 1. Busca Disciplina (não cria mais - RLS impede INSERT na tabela disciplines)
    let disciplineId = data.discipline_id
    if (!disciplineId && data.discipline_name) {
      log("DISCIPLINE_FIND", { name: data.discipline_name })
      const { data: existingDisc, error: findError } = await supabase
        .from("disciplines")
        .select("id")
        .ilike("name", data.discipline_name)
        .maybeSingle()

      if (findError) {
        log("DISCIPLINE_FIND_ERROR", findError)
        console.error("Erro ao buscar disciplina:", findError)
      }

      if (existingDisc) {
        disciplineId = existingDisc.id
        log("DISCIPLINE_FOUND", { id: disciplineId })
      } else {
        // Não tentar criar — RLS impede INSERT na tabela disciplines
        log("DISCIPLINE_NOT_FOUND", { name: data.discipline_name })
        return { 
          success: false, 
          error: "Disciplina não encontrada no sistema. Selecione uma disciplina existente na lista." 
        }
      }
    }

    if (!disciplineId) {
      log("DISCIPLINE_MISSING")
      return { success: false, error: "Disciplina não encontrada e não foi possível criar." }
    }

    // 2. Monta o Metadata
    const metadata = {
      pages_read: data.pages_read || 0,
      questions_answered: data.questions_answered || 0,
      questions_correct: data.questions_correct || 0,
      flashcards_reviewed: data.flashcards_reviewed || 0,
      flashcards_correct: data.flashcards_correct || 0,
      audio_name: data.audio_name || null,
      audio_author: data.audio_author || null,
      audio_platform: data.audio_platform || null,
      audio_speed: data.audio_speed || null,
      audio_url: data.audio_url || null,
      focus_percentage: data.focusPercentage || 0,
      completed_cycles: data.completedCycles || 0,
      topic_name: data.topic_name || null,
    }

    // 3. Calcular duração real
    let activeMinutesFinal = 0
    let pausedMinutesFinal = 0
    let startedAtISO: string | null = null
    let finishedAtISO: string | null = null

    if (!data.is_manual_mode && data.sessionStartTime) {
      const now = Date.now()
      const startTime = Number(data.sessionStartTime)
      const totalPausedMs = Number(data.sessionTotalPausedMs || 0)

const totalElapsedMs = now - startTime
      const activeMs = Math.max(0, totalElapsedMs - totalPausedMs)

      // Banco espera integer — arredondar para inteiro
      activeMinutesFinal = Math.round(activeMs / 60000)
      pausedMinutesFinal = Math.round(totalPausedMs / 60000)

      startedAtISO = new Date(startTime).toISOString()
      finishedAtISO = new Date().toISOString()
    } else {
      // Modo manual: garantir que sejam inteiros
      activeMinutesFinal = Math.round(data.activeMinutes || 0)
      pausedMinutesFinal = Math.round(data.pausedMinutes || 0)
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
    const studySource = studySourceMap[data.studyType] || 'FREE'

    // 5. Monta o payload base do study_history
    const insertPayload: Record<string, any> = {
      user_id: user.id,
      discipline_id: disciplineId,
      study_source: studySource,  // OBRIGATÓRIO com CHECK constraint
      study_type: data.studyType || null,
      technique: data.technique || null,
      active_minutes: activeMinutesFinal,
      paused_minutes: pausedMinutesFinal,
      duration_minutes: activeMinutesFinal,
      completed: true,
      interrupted: false,
      notes: data.notes || null,
      metadata: metadata,
    }

    // Se for cronômetro, usar timestamps reais
    if (startedAtISO) {
      insertPayload["started_at"] = startedAtISO
      insertPayload["finished_at"] = finishedAtISO
    } else if (data.study_date) {
      // Manual com data retroativa
      insertPayload["started_at"] = new Date(data.study_date + "T12:00:00").toISOString()
      insertPayload["finished_at"] = insertPayload["started_at"]
    } else {
      // Manual sem data específica
      const now = new Date().toISOString()
      insertPayload["started_at"] = now
      insertPayload["finished_at"] = now
    }

    log("PAYLOAD", insertPayload)

    // 6. Salva no study_history
    const { data: historyData, error: historyError } = await supabase
      .from("study_history")
      .insert(insertPayload)
      .select("id")
      .single()

    if (historyError) {
      log("DATABASE_ERROR", historyError)
      console.error("[STUDY_SAVE] Erro ao inserir study_history:", historyError)
      return { 
        success: false, 
        error: "Erro ao salvar sessão: " + (historyError.message || JSON.stringify(historyError)),
        code: historyError.code
      }
    }

    log("SUCCESS", { id: historyData.id })

    // Revalidar páginas que dependem de dados de sessão
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/history")
    revalidatePath("/estatisticas")
    revalidatePath("/home")

    return { success: true, historyId: historyData.id }

  } catch (err: any) {
    log("EXCEPTION", { message: err.message, stack: err.stack })
    console.error("[saveStudySession] Erro inesperado:", err)
    return { success: false, error: err.message || "Erro inesperado ao salvar." }
  }
}
