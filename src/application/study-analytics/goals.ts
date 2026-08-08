import { AnalyticsContext, GoalProgress } from "./types"
import { getBaseAggregations } from "./aggregations"

/**
 * Calcula o atingimento da meta semanal com base no Perfil do Usuário
 */
export function getWeeklyGoalProgress(ctx: AnalyticsContext, weeklyTargetHours: number): GoalProgress {
  return ctx.getCache('weekly_goal', () => {
    const { weeklyMinutes } = getBaseAggregations(ctx)
    
    const targetMinutes = weeklyTargetHours * 60
    const percentage = targetMinutes > 0 
      ? Math.min(100, Math.round((weeklyMinutes / targetMinutes) * 100))
      : 0
      
    const remainingMinutes = Math.max(0, targetMinutes - weeklyMinutes)

    return {
      target: targetMinutes,
      achieved: weeklyMinutes,
      percentage,
      remaining: remainingMinutes
    }
  })
}

/**
 * Calcula a meta diária fracionada baseada nos dias disponíveis que o usuário costuma estudar.
 * (Pode ser evoluída usando availableDays do profile)
 */
export function getDailyGoalProgress(ctx: AnalyticsContext, weeklyTargetHours: number, activeDaysPerWeek: number = 7): GoalProgress {
  return ctx.getCache('daily_goal', () => {
    const { dailyMinutes } = getBaseAggregations(ctx)
    
    const targetMinutes = Math.round((weeklyTargetHours * 60) / activeDaysPerWeek)
    const percentage = targetMinutes > 0 
      ? Math.min(100, Math.round((dailyMinutes / targetMinutes) * 100))
      : 0
      
    const remainingMinutes = Math.max(0, targetMinutes - dailyMinutes)

    return {
      target: targetMinutes,
      achieved: dailyMinutes,
      percentage,
      remaining: remainingMinutes
    }
  })
}
