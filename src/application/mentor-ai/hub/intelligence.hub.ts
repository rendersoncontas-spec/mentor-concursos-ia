import type { SupabaseClient } from "@supabase/supabase-js"
import type { IntelligenceContext } from "@/domain/mentor-ai/mentor-ai.models"
import { getStudyHistoryForAnalytics } from "@/application/study-analytics/study-analytics.service"
import { computeStreak, localDateKey } from "@/utils/study-streak"

/**
 * Hub Central de Inteligência.
 * Coleta dados de todos os módulos da aplicação (Reviews, Questions, Analytics)
 * e formata em um Snapshot unificado.
 */
export class IntelligenceHub {
  static async buildContext(
    supabase: SupabaseClient,
    userId: string
  ): Promise<IntelligenceContext> {
    // 1. Histórico Base (dados reais dos últimos 30 dias)
    const history30 = await getStudyHistoryForAnalytics(supabase, userId, 30)

    let totalMinutes = 0
    let energySum = 0
    let energyCount = 0
    let focusSum = 0
    let focusCount = 0
    const days = new Set<string>()

    for (const h of history30) {
      totalMinutes += h.duration_minutes || 0

      const started = new Date(h.started_at)
      if (!Number.isNaN(started.getTime())) {
        days.add(localDateKey(started))
      }

      if (h.energy_level && h.energy_level > 0) {
        energySum += h.energy_level
        energyCount += 1
      }
      if (h.focus_score && h.focus_score > 0) {
        focusSum += h.focus_score
        focusCount += 1
      }
    }

    // 2. Meta semanal real do perfil
    let weeklyHoursTarget = 20
    const { data: profile } = await supabase
      .from("profiles")
      .select("weekly_study_hours")
      .eq("id", userId)
      .maybeSingle()
    if (profile?.weekly_study_hours && profile.weekly_study_hours > 0) {
      weeklyHoursTarget = profile.weekly_study_hours
    }

    // Snapshot generator
    const snapshotId = crypto.randomUUID()

    return {
      version: "1.0.0",
      generatedAt: new Date(),
      snapshotId,
      userId,

      performance: {
        overallAccuracy: 0,
        disciplinesAccuracy: {},
        weakestDisciplines: [],
        strongestDisciplines: []
      },

      reviews: {
        totalOverdue: 0,
        criticalOverdue: 0,
        itemsToReviewToday: 0
      },

      studyHistory: {
        totalMinutes,
        averageEnergy: energyCount > 0 ? Math.round((energySum / energyCount) * 10) / 10 : 0,
        averageFocus: focusCount > 0 ? Math.round((focusSum / focusCount) * 10) / 10 : 0,
        daysStudied: days.size,
        streak: computeStreak(days)
      },

      goals: {
        weeklyHoursTarget
      }
    }
  }
}