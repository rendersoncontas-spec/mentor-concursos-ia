import type { AnalyticsContext, RankingItem } from "./types"
import type { StudyHistory } from "@/domain/study-history/study-history.types"

type SessionWithDiscipline = StudyHistory & {
  disciplines: { name: string; area: string | null } | null
}

export function getDisciplineRanking(ctx: AnalyticsContext): RankingItem[] {
  return ctx.getCache('discipline_ranking', () => {
    // Para calcular a tendência, vamos dividir o período no meio
    // Ex: últimos 30 dias -> Compara dias 0-15 vs 16-30
    const now = new Date().getTime()
    const halfPeriodMs = (ctx.periodDays / 2) * 24 * 60 * 60 * 1000
    const midpoint = now - halfPeriodMs

    const map = new Map<string, {
      name: string
      totalMinutes: number
      recentMinutes: number
      olderMinutes: number
      sessions: number
    }>()

    ctx.history.forEach(session => {
      // Ignora sessões sem disciplina mapeada (ex: estuda avulso sem disciplina ID)
      const withDiscipline = session as SessionWithDiscipline
      if (!session.discipline_id || !withDiscipline.disciplines?.name) return
      
      const id = session.discipline_id
      const name = withDiscipline.disciplines.name
      const duration = session.duration_minutes || 0
      const startedAt = new Date(session.started_at).getTime()

      const current = map.get(id) || { name, totalMinutes: 0, recentMinutes: 0, olderMinutes: 0, sessions: 0 }
      
      current.totalMinutes += duration
      current.sessions += 1

      if (startedAt >= midpoint) {
        current.recentMinutes += duration
      } else {
        current.olderMinutes += duration
      }

      map.set(id, current)
    })

    const ranking: RankingItem[] = []

    map.forEach((data, id) => {
      // Calcular trend
      let direction: 'UP' | 'DOWN' | 'STABLE' = 'STABLE'
      let percentage = 0

      if (data.olderMinutes > 0) {
        percentage = Math.round(((data.recentMinutes - data.olderMinutes) / data.olderMinutes) * 100)
        if (percentage > 5) direction = 'UP'
        else if (percentage < -5) direction = 'DOWN'
      } else if (data.recentMinutes > 0) {
        // Não estudou na primeira metade, estudou agora
        direction = 'UP'
        percentage = 100
      }

      ranking.push({
        id,
        name: data.name,
        value: data.totalMinutes,
        secondaryValue: data.sessions,
        trend: {
          direction,
          percentage: Math.abs(percentage)
        }
      })
    })

    return ranking.sort((a, b) => b.value - a.value)
  })
}

export function getAreaRanking(ctx: AnalyticsContext): RankingItem[] {
  return ctx.getCache('area_ranking', () => {
    const map = new Map<string, { totalMinutes: number, sessions: number }>()

    ctx.history.forEach(session => {
      const area = (session as SessionWithDiscipline).disciplines?.area
      if (!area) return

      const duration = session.duration_minutes || 0
      const current = map.get(area) || { totalMinutes: 0, sessions: 0 }
      
      current.totalMinutes += duration
      current.sessions += 1

      map.set(area, current)
    })

    const ranking: RankingItem[] = []
    map.forEach((data, area) => {
      ranking.push({
        id: area,
        name: area,
        value: data.totalMinutes,
        secondaryValue: data.sessions
      })
    })

    return ranking.sort((a, b) => b.value - a.value)
  })
}
