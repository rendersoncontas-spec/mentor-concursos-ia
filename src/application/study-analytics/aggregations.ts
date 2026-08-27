import type { AnalyticsContext } from "./types"
import { formatDateToYYYYMMDD } from "./utils"
import { computeStudyTimeFromHistory } from "@/lib/study-time-calculator"

type BaseAggregations = {
  dailyMinutes: number
  weeklyMinutes: number
  monthlyMinutes: number
  totalMinutes: number
  longestSession: number
  averageSession: number
  interruptedSessions: number
  totalSessions: number
  consecutiveStreak: number
  longestStreak: number
  averageFocus: number | null
  averageEnergy: number | null
  averageDifficulty: number | null
}

export function getBaseAggregations(ctx: AnalyticsContext): BaseAggregations {
  return ctx.getCache('base_aggregations', () => {
    let interruptedSessions = 0
    let sumFocus = 0, countFocus = 0
    let sumEnergy = 0, countEnergy = 0
    let sumDifficulty = 0, countDifficulty = 0

    // Cálculo centralizado e padronizado no fuso de São Paulo conforme preferência do aluno (ctx.weekStartDay)
    const timeSummary = computeStudyTimeFromHistory(ctx.history, new Date(), ctx.weekStartDay ?? 0)

    for (const session of ctx.history) {
      if (session.interrupted) interruptedSessions++

      if (session.focus_score) { sumFocus += session.focus_score; countFocus++ }
      if (session.energy_level) { sumEnergy += session.energy_level; countEnergy++ }
      if (session.difficulty) { sumDifficulty += session.difficulty; countDifficulty++ }
    }

    const totalSessions = ctx.history.length
    const { currentStreak, longestStreak } = calculateStreaks(timeSummary.uniqueDaysStudied)

    return {
      dailyMinutes: timeSummary.dailyMinutes,
      weeklyMinutes: timeSummary.weeklyMinutes,
      monthlyMinutes: timeSummary.monthlyMinutes,
      totalMinutes: timeSummary.totalMinutes,
      longestSession: timeSummary.longestSession,
      averageSession: totalSessions > 0 ? Math.round(timeSummary.totalMinutes / totalSessions) : 0,
      interruptedSessions,
      totalSessions,
      consecutiveStreak: currentStreak,
      longestStreak: longestStreak,
      averageFocus: countFocus > 0 ? Number((sumFocus / countFocus).toFixed(1)) : null,
      averageEnergy: countEnergy > 0 ? Number((sumEnergy / countEnergy).toFixed(1)) : null,
      averageDifficulty: countDifficulty > 0 ? Number((sumDifficulty / countDifficulty).toFixed(1)) : null,
    }
  })
}

function calculateStreaks(uniqueDaysSet: Set<string>): { currentStreak: number, longestStreak: number } {
  if (uniqueDaysSet.size === 0) return { currentStreak: 0, longestStreak: 0 }

  const sortedDays = Array.from(uniqueDaysSet).sort((a, b) => b.localeCompare(a)) // Mais recente pro mais antigo
  
  let currentStreak = 0
  let longestStreak = 1
  
  const todayStr = formatDateToYYYYMMDD(new Date())
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterdayStr = formatDateToYYYYMMDD(d)

  // Verifica se a sequência atual ainda está viva
  if (sortedDays[0] === todayStr || sortedDays[0] === yesterdayStr) {
    currentStreak = 1
    let tempCurrentDateStr = sortedDays[0]
    
    for (let i = 1; i < sortedDays.length; i++) {
      const parts = tempCurrentDateStr.split("-")
      const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      dObj.setDate(dObj.getDate() - 1)
      const expectedPrevStr = formatDateToYYYYMMDD(dObj)

      if (sortedDays[i] === expectedPrevStr) {
        currentStreak++
        tempCurrentDateStr = expectedPrevStr
      } else {
        break
      }
    }
  }

  // Calcula o longestStreak analisando toda a série
  let tempLongest = 1
  let currentEvalStreak = 1
  
  for (let i = 0; i < sortedDays.length - 1; i++) {
    const day = sortedDays[i]
    if (!day) continue
    const parts = day.split("-")
    const dObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    dObj.setDate(dObj.getDate() - 1)
    const expectedPrevStr = formatDateToYYYYMMDD(dObj)

    if (sortedDays[i + 1] === expectedPrevStr) {
      currentEvalStreak++
      if (currentEvalStreak > tempLongest) tempLongest = currentEvalStreak
    } else {
      currentEvalStreak = 1
    }
  }

  longestStreak = tempLongest

  return { currentStreak, longestStreak }
}
