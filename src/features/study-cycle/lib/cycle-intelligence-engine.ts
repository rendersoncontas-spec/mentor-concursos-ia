import type { CycleIntelligence } from "@/domain/study-cycle/study-cycle.types"

interface DisciplineStats {
  disciplineId: string
  disciplineName: string
  totalSessions: number
  totalMinutes: number
  accuracy: number | null
  recentErrors: number
  overdueReviews: number
  daysSinceLastStudy: number
  plannedMinutes: number
  completedMinutes: number
}

export function computeAttentionScore(stats: DisciplineStats): number {
  let score = 50

  if (stats.accuracy !== null) {
    if (stats.accuracy < 50) score += 25
    else if (stats.accuracy < 70) score += 15
    else if (stats.accuracy > 90) score -= 10
  }

  if (stats.recentErrors > 10) score += 20
  else if (stats.recentErrors > 5) score += 10
  else if (stats.recentErrors > 2) score += 5

  if (stats.overdueReviews > 5) score += 15
  else if (stats.overdueReviews > 2) score += 8

  if (stats.daysSinceLastStudy > 14) score += 20
  else if (stats.daysSinceLastStudy > 7) score += 10
  else if (stats.daysSinceLastStudy > 3) score += 5

  const completionRatio =
    stats.plannedMinutes > 0 ? stats.completedMinutes / stats.plannedMinutes : 0
  if (completionRatio < 0.3) score += 10
  else if (completionRatio > 0.8) score -= 5

  return Math.max(0, Math.min(100, score))
}

export function generateSuggestion(stats: DisciplineStats, attentionScore: number): string | null {
  if (attentionScore >= 75) {
    const reasons: string[] = []
    if (stats.accuracy !== null && stats.accuracy < 60) {
      reasons.push(`acerto de ${stats.accuracy}%`)
    }
    if (stats.recentErrors > 5) {
      reasons.push(`${stats.recentErrors} erros recentes`)
    }
    if (stats.overdueReviews > 3) {
      reasons.push(`${stats.overdueReviews} revisões atrasadas`)
    }
    if (stats.daysSinceLastStudy > 7) {
      reasons.push(`${stats.daysSinceLastStudy} dias sem estudar`)
    }
    if (reasons.length > 0) {
      return `${stats.disciplineName} apresenta maior necessidade de atenção. Motivos: ${reasons.join("; ")}.`
    }
  }

  if (attentionScore < 25) {
    return `${stats.disciplineName} está com bom desempenho. Considere manter a frequência.`
  }

  return null
}

export function computeCycleIntelligence(
  disciplinesStats: DisciplineStats[]
): CycleIntelligence[] {
  return disciplinesStats.map((stats) => {
    const attentionScore = computeAttentionScore(stats)
    const suggestion = generateSuggestion(stats, attentionScore)

    return {
      disciplineId: stats.disciplineId,
      disciplineName: stats.disciplineName,
      accuracy: stats.accuracy,
      recentErrors: stats.recentErrors,
      overdueReviews: stats.overdueReviews,
      attentionScore,
      suggestion,
    }
  })
}

export function sortByAttention(intelligences: CycleIntelligence[]): CycleIntelligence[] {
  return [...intelligences].sort((a, b) => b.attentionScore - a.attentionScore)
}

export function getCompletionRate(
  totalPlanned: number,
  totalCompleted: number
): number {
  if (totalPlanned <= 0) return 0
  return Math.round((totalCompleted / totalPlanned) * 100)
}
