import { SupabaseClient } from "@supabase/supabase-js"
import { SessionCompletionPayload, SessionSummary } from "./study-session.models"
import { finishStudySession } from "@/application/study-history/study-history.service"
import { MentorAIService } from "@/application/mentor-ai/mentor-ai.service"

export class SessionOrchestrator {
  
  /**
   * Ponto único de entrada para finalização de sessão.
   * Coordena todos os domínios para que cada um registre seus próprios dados.
   */
  static async finalizeSession(
    supabase: SupabaseClient,
    userId: string,
    payload: SessionCompletionPayload
  ): Promise<SessionSummary> {
    
    // 1. Study History (Duração e Feedback comportamental)
    const historyResult = await finishStudySession(supabase, userId, payload.sessionId, {
      energy_level: payload.energyFinal,
      focus_score: payload.focusFinal,
      interrupted: payload.interrupted,
      // Passamos um resumo agregado para histórico caso útil em relatórios simples
      notes: JSON.stringify({
        questions: payload.questionsAnswered,
        correct: payload.correctAnswers,
        reviews: payload.reviewsCompleted
      })
    })

    // 2. Question Engine (Delega inserção de questões)
    if (payload.questionsAnswered > 0) {
      await this.logQuestionsToEngine(supabase, userId, payload)
    }

    // 3. Review Engine (Delega resolução de revisões pendentes)
    if (payload.reviewsCompleted > 0 && payload.disciplineId) {
      await this.logReviewsToEngine(supabase, userId, payload)
    }

    // 4. Mentor IA (Calcula o impacto global após as inserções)
    const mentorResponse = await MentorAIService.generateMentorSession(supabase, userId, { 
      logSession: true, 
      useCache: false // Forçamos recalcular IGA 
    })

    // 5. Compila o resumo final
    return {
      durationMinutes: historyResult.duration_minutes || payload.durationMinutes,
      focusVariation: payload.focusFinal - payload.focusInitial,
      energyVariation: payload.energyFinal - payload.energyInitial,
      questionsAnswered: payload.questionsAnswered,
      accuracy: payload.questionsAnswered > 0 
        ? Math.round((payload.correctAnswers / payload.questionsAnswered) * 100) 
        : 0,
      reviewsCompleted: payload.reviewsCompleted,
      igaBefore: 0, // Placeholder se não tivermos histórico anterior imediato
      igaAfter: mentorResponse.globalScore.score,
      mentorResponse: mentorResponse.feed.now.length > 0 
        ? mentorResponse.feed.now[0].message 
        : "Sessão concluída com sucesso! Seu IGA foi atualizado."
    }
  }

  /**
   * Stub para o Question Engine (Grava as métricas brutas geradas na sessão)
   */
  private static async logQuestionsToEngine(
    supabase: SupabaseClient, 
    userId: string, 
    payload: SessionCompletionPayload
  ) {
    if (!payload.disciplineId) return
    
    // Como a UI permite registrar "N Acertos e N Erros" em lote,
    // e o BD de question_attempts exige um question_id,
    // Em um cenário real, estas questões viriam de uma prova gerada no sistema.
    // Para cumprir o fluxo sem quebrar constraint, delegamos ao Analytics ou 
    // registramos como tentativas "Livre" num serviço dedicado.
    console.log(`[QuestionEngine] Logando ${payload.questionsAnswered} questões...`)
  }

  /**
   * Stub para o Review Engine (Completa itens do FSRS)
   */
  private static async logReviewsToEngine(
    supabase: SupabaseClient, 
    userId: string, 
    payload: SessionCompletionPayload
  ) {
    if (!payload.disciplineId) return
    console.log(`[ReviewEngine] Concluindo ${payload.reviewsCompleted} revisões para disciplina ${payload.disciplineId}...`)
  }
}
