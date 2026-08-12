import type { AnalyticsContext, TimeSeriesDataPoint } from "./types"
import { formatDateToYYYYMMDD, getDaysAgoDate } from "./utils"

/**
 * Retorna as séries temporais de minutos estudados agrupados por dia.
 * @param ctx O contexto do Analytics.
 * @param sliceDays Quantidade de dias a recortar do final do período (ex: últimos 7 dias do total de 30)
 */
export function getEvolutionTimeSeries(ctx: AnalyticsContext, sliceDays: number = 7): TimeSeriesDataPoint[] {
  const cacheKey = `evolution_${sliceDays}`
  
  return ctx.getCache(cacheKey, () => {
    const map = new Map<string, number>()

    // Soma os minutos de cada dia
    ctx.history.forEach(session => {
      const dateStr = formatDateToYYYYMMDD(new Date(session.started_at))
      const duration = session.duration_minutes || 0
      const current = map.get(dateStr) || 0
      map.set(dateStr, current + duration)
    })

    const series: TimeSeriesDataPoint[] = []

    // Limita aos dias solicitados (ex: últimos 7 dias)
    const limit = Math.min(sliceDays, ctx.periodDays)

    // Preenche todos os dias da janela, ordenados do mais antigo para hoje
    for (let i = limit - 1; i >= 0; i--) {
      const d = getDaysAgoDate(i)
      const dateStr = formatDateToYYYYMMDD(d)
      
      series.push({
        date: dateStr,
        value: map.get(dateStr) || 0
      })
    }

    return series
  })
}
