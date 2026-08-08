"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { getStudyHistoryForAnalytics, AnalyticsEngine } from "./study-analytics.service"
import { isMaintenanceMode } from "@/lib/maintenance"

export async function getUserStatisticsAction(periodDays: number = 365) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Usuário não autenticado")
    }

    const history = await getStudyHistoryForAnalytics(supabase, user.id, periodDays)
    
    // Calcula agregações
    const context = AnalyticsEngine.createContext(history as any)
    const baseAggregations = AnalyticsEngine.aggregations.getBase(context)
    const disciplineRanking = AnalyticsEngine.rankings.getDisciplineRanking(context)
    const evolution = AnalyticsEngine.visuals.getEvolutionTimeSeries(context, 7) // Ultimos 7 dias
    
    // Mock de acertos por enquanto até integrar com 'question_attempts'
    const totalCorrect = 0
    const totalWrong = 0
    
    return {
      data: {
        totalMinutes: baseAggregations.totalMinutes,
        totalSessions: baseAggregations.totalSessions,
        disciplineRanking,
        evolution,
        totalCorrect,
        totalWrong,
      },
      error: null
    }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

export async function getGlobalRankingAction(targetExamId?: string) {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  
  try {
    const supabase = await createClient()
    
    // Como ainda não temos uma tabela consolidada de ranking global,
    // e "study_history" não deve ser pesada, em produção teríamos uma materialized view.
    // Para resolver a issue de "tirar o dado mockado e deixar zerado / real":
    // Vamos retornar lista vazia ou query real vazia.
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .limit(0) // Empty array para evitar erro e mostrar empty state

    return { data: [], error: null }
  } catch (error: any) {
    return { data: null, error: error.message }
  }
}

