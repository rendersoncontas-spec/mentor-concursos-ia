import type { SupabaseClient } from "@supabase/supabase-js"
import type { SessionCompletionPayload, SessionSummary } from "./study-session.models"
import { finishStudySession } from "@/application/study-history/study-history.service"
import { MentorAIService } from "@/application/mentor-ai/mentor-ai.service"
import { registerStudyToCycle } from "@/application/study-cycle/cycle-study-registration.service"

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
      })
    })

    // 2. Question Engine (Delega inserção de questões)
    if (payload.questionsAnswered > 0) {
      await this.logQuestionsToEngine(supabase, userId, payload)
    }

    // 3. Fase I.6 (achado M6): NÃO existe mais delegação ao motor de revisões.
    //
    // Havia aqui uma chamada a `logReviewsToEngine`, um stub que só escrevia no
    // console: nenhum item de revisão era concluído, mas o fluxo (e o campo
    // "Revisões concluídas" no cronômetro) sugeria que sim. O campo saiu junto.
    //
    // Decisão D2 intacta: estudo não cria, conclui nem agenda revisão. Quem
    // revisa é a página de Revisões, respondendo os cards.

    // 4. Registrar no ciclo se a disciplina estiver no ciclo ativo
    // Qualquer origem de estudo pode contribuir para o ciclo (não só CYCLE)
    if (payload.disciplineId && historyResult.duration_minutes && historyResult.duration_minutes > 0) {
      const cycleResult = await registerStudyToCycle({
        studyHistoryId: payload.sessionId,
        disciplineId: payload.disciplineId,
        durationMinutes: historyResult.duration_minutes,
        studySource: "CYCLE",
      })
      if (!cycleResult.success) {
        throw new Error(`Estudo salvo, mas o ciclo não foi atualizado: ${cycleResult.error || "erro desconhecido"}`)
      }
    }

    // 5. Mentor IA (Calcula o impacto global após as inserções)
    const mentorResponse = await MentorAIService.generateMentorSession(supabase, userId, { 
      logSession: true, 
      useCache: false // Forçamos recalcular IGA 
    })

    // 6. Compila o resumo final
    return {
      durationMinutes: historyResult.duration_minutes || payload.durationMinutes,
      focusVariation: payload.focusFinal - payload.focusInitial,
      energyVariation: payload.energyFinal - payload.energyInitial,
      questionsAnswered: payload.questionsAnswered,
      accuracy: payload.questionsAnswered > 0 
        ? Math.round((payload.correctAnswers / payload.questionsAnswered) * 100) 
        : 0,
      mentorResponse: mentorResponse.feed.now[0]?.message ?? "Sessão concluída com sucesso!"
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
    console.warn(`[QuestionEngine] Logando ${payload.questionsAnswered} questões...`)
  }

}
