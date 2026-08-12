import type { SupabaseClient } from "@supabase/supabase-js"
import type { QuestionAttempt, MistakeType } from "@/domain/questions/types"

type RegisterAttemptInput = {
  questionId: string
  selectedAnswer: string
  correct: boolean
  responseTimeSeconds: number
  confidenceLevel: number // 1 to 5
  attemptSource?: string
}

export async function registerAttempt(
  supabase: SupabaseClient,
  userId: string,
  input: RegisterAttemptInput
) {
  // Lógica Heurística de Revisão Automática (IA Prep)
  let reviewRequired = false
  let mistakeType: MistakeType | null = null

  if (!input.correct) {
    reviewRequired = true // Errou, precisa revisar
    
    // Heurística de Erro Básica (Substituível por IA depois)
    if (input.confidenceLevel >= 4) {
      // Errou mas tinha certeza absoluta? Provavelmente erro conceitual ou PEGADINHA
      mistakeType = 'CONTENT'
    } else if (input.responseTimeSeconds < 15) {
      // Errou rápido demais? Falta de atenção
      mistakeType = 'DISTRACTION'
    } else if (input.responseTimeSeconds > 180) {
      // Errou demorando 3 minutos? Faltou tempo ou adivinhou
      mistakeType = 'TIME'
    } else {
      mistakeType = 'GUESS'
    }
  } else {
    // Acertou. Mas precisa revisar?
    if (input.confidenceLevel <= 2) {
      // Acertou com muita dúvida -> Chute sortudo
      reviewRequired = true
      mistakeType = 'GUESS'
    }
  }

  const { data, error } = await supabase
    .from('question_attempts')
    .insert({
      user_id: userId,
      question_id: input.questionId,
      selected_answer: input.selectedAnswer,
      correct: input.correct,
      response_time_seconds: input.responseTimeSeconds,
      confidence_level: input.confidenceLevel,
      review_required: reviewRequired,
      mistake_type: mistakeType,
      attempt_source: input.attemptSource || 'MANUAL'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Erro ao registrar tentativa: ${error.message}`)
  }

  // O motor de Performance Score consumirá estas tentativas depois.
  return data as QuestionAttempt
}

export async function getUserAttempts(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 100
) {
  const { data, error } = await supabase
    .from('question_attempts')
    .select(`
      *,
      questions (
        discipline_id,
        topic_id,
        difficulty_level
      )
    `)
    .eq('user_id', userId)
    .order('answered_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return data
}
