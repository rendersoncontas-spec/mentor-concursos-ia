import type { AnalyticsContext, HeatmapDay } from "./types"
import { formatDateToYYYYMMDD, getDaysAgoDate } from "./utils"

export function getHeatmap(ctx: AnalyticsContext): HeatmapDay[] {
  return ctx.getCache('heatmap', () => {
    // 1. Agrupar os minutos estudados por dia
    const map = new Map<string, { minutes: number; sessions: number }>()
    
    let maxMinutes = 0

    ctx.history.forEach(session => {
      const dateStr = formatDateToYYYYMMDD(new Date(session.started_at))
      const current = map.get(dateStr) || { minutes: 0, sessions: 0 }
      
      const duration = session.duration_minutes || 0
      current.minutes += duration
      current.sessions += 1
      
      map.set(dateStr, current)

      if (current.minutes > maxMinutes) {
        maxMinutes = current.minutes
      }
    })

    // 2. Preencher todos os dias do período, mesmo os vazios
    const heatmap: HeatmapDay[] = []
    
    // Opcional: O heatmap do Github geralmente começa num Domingo. 
    // Para simplificar, traremos apenas os últimos X dias exatos.
    for (let i = ctx.periodDays - 1; i >= 0; i--) {
      const d = getDaysAgoDate(i)
      const dateStr = formatDateToYYYYMMDD(d)
      
      const data = map.get(dateStr) || { minutes: 0, sessions: 0 }
      
      // Cálculo de intensidade relativa (0 a 100)
      let intensity = 0
      if (maxMinutes > 0 && data.minutes > 0) {
        intensity = Math.round((data.minutes / maxMinutes) * 100)
      }

      heatmap.push({
        date: dateStr,
        minutes: data.minutes,
        sessions: data.sessions,
        intensity
      })
    }

    return heatmap
  })
}
