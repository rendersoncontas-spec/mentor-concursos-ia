import type { SupabaseClient } from "@supabase/supabase-js"
import { createAnalyticsContext } from "./context"
import { getBaseAggregations } from "./aggregations"
import { getHeatmap } from "./heatmap"
import { getDisciplineRanking, getAreaRanking } from "./rankings"
import { getEvolutionTimeSeries } from "./evolution"
import { getWeeklyGoalProgress, getDailyGoalProgress } from "./goals"
import { getAiInsights } from "./insights"

const ANALYTICS_FETCH_LIMIT = 50_000

export interface AnalyticsHistoryRow {
  id: string
  discipline_id: string | null
  study_source: string | null
  study_type: string | null
  started_at: string
  duration_minutes: number | null
  completed: boolean | null
  interrupted: boolean | null
  focus_score: number | null
  energy_level: number | null
  difficulty: number | null
  metadata: Record<string, unknown> | null
  disciplines: { name: string | null; area: string | null } | { name: string | null; area: string | null }[] | null
}

/**
 * Busca os dados brutos no banco otimizados para Analytics.
 * @param periodDays Quantos dias de histórico puxar. Use 0 para "Tudo" (sem filtro de data).
 */
export async function getStudyHistoryForAnalytics(
  supabase: SupabaseClient,
  userId: string,
  periodDays: number = 365
): Promise<AnalyticsHistoryRow[]> {
  const allData: AnalyticsHistoryRow[] = []
  const PAGE = 1000
  let offset = 0
  let done = false

  while (!done && allData.length < ANALYTICS_FETCH_LIMIT) {
    let query = supabase
      .from("study_history")
      .select(`
        id,
        discipline_id,
        study_source,
        study_type,
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
      .not("duration_minutes", "is", null)
      .order("started_at", { ascending: true })

    if (periodDays > 0) {
      const d = new Date()
      d.setDate(d.getDate() - periodDays)
      query = query.gte("started_at", d.toISOString())
    }

    const { data, error } = await query.range(offset, offset + PAGE - 1)

    if (error) {
      console.error(JSON.stringify({
        context: "Analytics Fetch Error",
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      }, null, 2))
      break
    }

    if (!data || data.length === 0) {
      done = true
      break
    }

    allData.push(...(data as AnalyticsHistoryRow[]))

    if (data.length < PAGE) {
      done = true
    }

    offset += PAGE
  }

  return allData
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
