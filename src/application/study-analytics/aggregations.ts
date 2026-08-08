import { AnalyticsContext } from "./types"
import { getStartOfWeek, getStartOfMonth, formatDateToYYYYMMDD } from "./utils"

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
    let dailyMinutes = 0
    let weeklyMinutes = 0
    let monthlyMinutes = 0
    let totalMinutes = 0
    let longestSession = 0
    let interruptedSessions = 0
    
    let sumFocus = 0, countFocus = 0
    let sumEnergy = 0, countEnergy = 0
    let sumDifficulty = 0, countDifficulty = 0

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeekMs = getStartOfWeek(now, ctx.weekStartDay).getTime()
    const startOfMonthMs = getStartOfMonth(now).getTime()

    const uniqueDaysStudied = new Set<string>()

    for (const session of ctx.history) {
      const startedAtDate = new Date(session.started_at)
      const startedAtMs = startedAtDate.getTime()
      const duration = session.duration_minutes || 0

      totalMinutes += duration
      if (duration > longestSession) longestSession = duration
      if (session.interrupted) interruptedSessions++

      if (startedAtMs >= startOfDay) dailyMinutes += duration
      if (startedAtMs >= startOfWeekMs) weeklyMinutes += duration
      if (startedAtMs >= startOfMonthMs) monthlyMinutes += duration

      if (session.focus_score) { sumFocus += session.focus_score; countFocus++ }
      if (session.energy_level) { sumEnergy += session.energy_level; countEnergy++ }
      if (session.difficulty) { sumDifficulty += session.difficulty; countDifficulty++ }

      uniqueDaysStudied.add(formatDateToYYYYMMDD(startedAtDate))
    }

    const totalSessions = ctx.history.length

    const { currentStreak, longestStreak } = calculateStreaks(uniqueDaysStudied)

    return {
      dailyMinutes,
      weeklyMinutes,
      monthlyMinutes,
      totalMinutes,
      longestSession,
      averageSession: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
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
    const parts = sortedDays[i]!.split("-")
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
