import { SupabaseClient } from "@supabase/supabase-js"
import { IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"
import { getStudyHistoryForAnalytics } from "@/application/study-analytics/study-analytics.service"

/**
 * Hub Central de Inteligência.
 * Coleta dados de todos os módulos da aplicação (Reviews, Questions, Analytics)
 * e formata em um Snapshot unificado.
 */
export class IntelligenceHub {
  static async buildContext(
    supabase: SupabaseClient,
    userId: string
  ): Promise<IntelligenceContext> {
    
    // Na Sprint atual usaremos mocks controlados ou chamadas reais básicas.
    // Em produção real chamaria os Services correspondentes.
    
    // 1. Histórico Base
    const history30 = await getStudyHistoryForAnalytics(supabase, userId, 30)
    
    // Exemplo de agregação simplificada (Na versão final, chama AnalyticsEngine)
    const totalMinutes = history30.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0)
    
    // Snapshot generator (hash simulado/uuid)
    const snapshotId = crypto.randomUUID()

    return {
      version: "1.0.0",
      generatedAt: new Date(),
      snapshotId,
      userId,

      performance: {
        overallAccuracy: 0,
        disciplinesAccuracy: {},
        weakestDisciplines: [],
        strongestDisciplines: []
      },

      reviews: {
        totalOverdue: 0,
        criticalOverdue: 0,
        itemsToReviewToday: 0
      },

      studyHistory: {
        totalMinutes,
        averageEnergy: 2.1,
        averageFocus: 2.8,
        daysStudied: 18,
        streak: 18
      },

      goals: {
        weeklyHoursTarget: 20
      }
    }
  }
}
