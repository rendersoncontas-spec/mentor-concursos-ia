import type { AnalyticsContext, GoalProgress } from "./types"
import { getBaseAggregations } from "./aggregations"

/**
 * Calcula o atingimento da meta semanal com base no Perfil do Usuário
 */
export function getWeeklyGoalProgress(ctx: AnalyticsContext, weeklyTargetHours: number | null): GoalProgress {
  return ctx.getCache('weekly_goal', () => {
    const { weeklyMinutes } = getBaseAggregations(ctx)
    
    const targetMinutes = weeklyTargetHours ? weeklyTargetHours * 60 : 0
    const percentage = targetMinutes > 0 
      ? Math.min(100, Math.round((weeklyMinutes / targetMinutes) * 100))
      : 0
      
    const remainingMinutes = targetMinutes > 0 ? Math.max(0, targetMinutes - weeklyMinutes) : 0

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
export function getDailyGoalProgress(ctx: AnalyticsContext, weeklyTargetHours: number | null, activeDaysPerWeek: number = 7): GoalProgress {
  return ctx.getCache('daily_goal', () => {
    const { dailyMinutes } = getBaseAggregations(ctx)
    
    const targetMinutes = weeklyTargetHours ? Math.round((weeklyTargetHours * 60) / activeDaysPerWeek) : 0
    const percentage = targetMinutes > 0 
      ? Math.min(100, Math.round((dailyMinutes / targetMinutes) * 100))
      : 0
      
    const remainingMinutes = targetMinutes > 0 ? Math.max(0, targetMinutes - dailyMinutes) : 0

    return {
      target: targetMinutes,
      achieved: dailyMinutes,
      percentage,
      remaining: remainingMinutes
    }
  })
}
