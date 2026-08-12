import type { SupabaseClient } from "@supabase/supabase-js"
import { createAnalyticsContext } from "./context"
import { getBaseAggregations } from "./aggregations"
import { getHeatmap } from "./heatmap"
import { getDisciplineRanking, getAreaRanking } from "./rankings"
import { getEvolutionTimeSeries } from "./evolution"
import { getWeeklyGoalProgress, getDailyGoalProgress } from "./goals"
import { getAiInsights } from "./insights"

/**
 * Busca os dados brutos no banco otimizados para Analytics.
 * @param periodDays Quantos dias de histórico puxar.
 */
export async function getStudyHistoryForAnalytics(
  supabase: SupabaseClient,
  userId: string,
  periodDays: number = 365
) {
  const d = new Date()
  d.setDate(d.getDate() - periodDays)
  
  // Primeira tentativa: Tabela com schema rico (study_history)
  const { data, error } = await supabase
    .from("study_history")
    .select(`
      id,
      discipline_id,
      started_at,
      duration_minutes,
      completed,
      interrupted,
      focus_score,
      energy_level,
      difficulty,
      metadata,
      disciplines ( name, area )
    `)
    .eq("user_id", userId)
    .gte("started_at", d.toISOString())
    .not("duration_minutes", "is", null)
    .order("started_at", { ascending: true })

  if (error) {
    console.error(JSON.stringify({
      context: "Analytics Fetch Error",
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    }, null, 2))

    return []
  }

  return data || []
}

// Exportando os domínios especializados para consumo limpo no Dashboard ou outras views
export const AnalyticsEngine = {
  createContext: createAnalyticsContext,
  aggregations: {
    getBase: getBaseAggregations
  },
  visuals: {
    getHeatmap,
    getEvolutionTimeSeries
  },
  rankings: {
    getDisciplineRanking,
    getAreaRanking
  },
  goals: {
    getWeeklyGoalProgress,
    getDailyGoalProgress
  },
  ai: {
    getInsights: getAiInsights
  }
}
