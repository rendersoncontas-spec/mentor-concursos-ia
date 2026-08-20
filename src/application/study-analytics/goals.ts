import type { AnalyticsContext, GoalProgress } from "./types"
import { getBaseAggregations } from "./aggregations"

/**
 * Calcula o atingimento da meta semanal com base no Perfil do Usuário
 */
export function getWeeklyGoalProgress(ctx: AnalyticsContext, weeklyTargetHours: number | null): GoalProgress {
  return ctx.getCache('weekly_goal', () => {
    const { weeklyMinutes } = getBaseAggregations(ctx)
    
    // Sanity check: se weeklyTargetHours for > 168 (horas semanais normais), foi passado em minutos
    const safeHours = weeklyTargetHours && weeklyTargetHours > 168 ? weeklyTargetHours / 60 : weeklyTargetHours
    const targetMinutes = safeHours && safeHours > 0 ? Math.round(safeHours * 60) : 0
    const percentage = targetMinutes > 0 
      ? Math.round((weeklyMinutes / targetMinutes) * 100)
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
    
    const safeHours = weeklyTargetHours && weeklyTargetHours > 168 ? weeklyTargetHours / 60 : weeklyTargetHours
    const safeDays = Math.max(1, Math.min(7, activeDaysPerWeek))
    const targetMinutes = safeHours && safeHours > 0 ? Math.round((safeHours * 60) / safeDays) : 0
    const percentage = targetMinutes > 0 
      ? Math.round((dailyMinutes / targetMinutes) * 100)
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
