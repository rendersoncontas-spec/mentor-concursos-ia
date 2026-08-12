import type { StudyHistory } from "@/domain/study-history/study-history.types"
import type { AnalyticsContext } from "./types"

/**
 * Cria a instância do Analytics Engine que viverá durante o ciclo de vida do request.
 * Responsável por rotear os dados brutos, definir o período e oferecer o cache (memoization)
 * interno para que funções de cálculo de diferentes gráficos compartilhem processamento pesado.
 */
export function createAnalyticsContext(
  history: StudyHistory[],
  periodDays: number = 365,
  timezone: string = "America/Sao_Paulo",
  weekStartDay: number = 1
): AnalyticsContext {
  
  // Limpamos itens não concluídos / dados corrompidos se necessário
  // Porém o histórico pode ter "interrupted", que é válido para algumas métricas.
  // Somente garantimos que há um duration_minutes.
  const validHistory = history.filter(h => h.duration_minutes !== null && h.started_at)

  const cache = new Map<string, unknown>()

  return {
    history: validHistory,
    periodDays,
    timezone,
    weekStartDay,
    cache,
    
    // Engine de Cache Padrão do Contexto
    getCache<T>(key: string, computeFn: () => T): T {
      if (cache.has(key)) {
        return cache.get(key) as T
      }
      const result = computeFn()
      cache.set(key, result)
      return result
    }
  }
}
