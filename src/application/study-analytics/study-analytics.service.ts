import type { SupabaseClient } from "@supabase/supabase-js"
import { createAnalyticsContext } from "./context"
import { getBaseAggregations } from "./aggregations"
import { getHeatmap } from "./heatmap"
import { getDisciplineRanking, getAreaRanking } from "./rankings"
import { getEvolutionTimeSeries } from "./evolution"
import { getWeeklyGoalProgress, getDailyGoalProgress } from "./goals"
import { fetchAllPagesInParallel } from "@/lib/parallel-pagination"

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
  periodDays: number = 365,
  options: { metadataKeys?: readonly string[] } = {},
): Promise<AnalyticsHistoryRow[]> {
  // Fase F.2: quem só usa algumas chaves do `metadata` (o Dashboard usa apenas
  // questions_answered/questions_correct) pode pedir só elas — o banco devolve
  // cada chave pelo caminho JSON (`metadata->chave`) em vez do objeto inteiro,
  // e o `metadata` de cada linha é remontado só com essas chaves. As linhas,
  // a ordem e os demais campos são os mesmos; sem a opção, nada muda.
  const metadataKeys = options.metadataKeys
  const metadataSelect = metadataKeys
    ? metadataKeys.map((k) => `meta_${k}:metadata->${k}`).join(",\n        ")
    : "metadata"
  // Fase F: a leitura era página a página em sequência (≈2.800 sessões = 3
  // idas e voltas em fila, e o Dashboard lê TODO o histórico). Agora a 1ª
  // página traz a contagem e as demais saem em paralelo. Mesmo filtro, mesma
  // ordem (com "id" desempatando started_at iguais), mesmo limite de segurança
  // e mesma semântica de erro: registra e devolve o que já foi lido.
  const since = periodDays > 0 ? new Date() : null
  if (since) since.setDate(since.getDate() - periodDays)

  const { data } = await fetchAllPagesInParallel<AnalyticsHistoryRow>(
    async (from, to, withCount) => {
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
        ${metadataSelect},
        disciplines!left ( name, area )
      `, withCount ? { count: "exact" } : undefined)
        .eq("user_id", userId)
        .not("duration_minutes", "is", null)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })

      if (since) {
        query = query.gte("started_at", since.toISOString())
      }

      const { data, error, count } = await query.range(from, to)
      if (error) {
        console.error(JSON.stringify({
          context: "Analytics Fetch Error",
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        }, null, 2))
      }
      const rows = data as Array<Record<string, unknown>> | null
      if (rows && metadataKeys) {
        for (const row of rows) {
          const metadata: Record<string, unknown> = {}
          for (const k of metadataKeys) {
            const value = row[`meta_${k}`]
            if (value !== null && value !== undefined) metadata[k] = value
            delete row[`meta_${k}`]
          }
          row["metadata"] = metadata
        }
      }
      return { data: rows as AnalyticsHistoryRow[] | null, error, count }
    },
    { pageSize: 1000, maxRows: ANALYTICS_FETCH_LIMIT, perfLabel: "study_history.analytics_dashboard" },
  )

  return data
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
  // Fase H: o grupo "ai" (getAiInsights) foi removido — regras com scores fixos
  // (ex.: "85% de chance de burnout"), sem IA, e nunca exibidas.
}
