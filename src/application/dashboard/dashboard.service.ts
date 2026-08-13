import { type SupabaseClient } from "@supabase/supabase-js"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { getTodayStudyItems, getCycleOverviewData } from "@/application/study-plan/study-plan.service"
import { getUserDisciplines } from "@/application/disciplines/disciplines.service"
import { getStudyHistoryForAnalytics, AnalyticsEngine } from "@/application/study-analytics/study-analytics.service"
import { getPendingReviewsSummary } from "@/application/review-engine/review-engine.service"
import { getRecentActivities } from "@/application/study-history/study-history.service"
import { getStartOfWeek } from "@/application/study-analytics/utils"

export async function getDashboardData(supabase: SupabaseClient, userId: string): Promise<DashboardSnapshot> {
  try {
    const [
      profileResult,
      targetResult,
      cycleOverview,
      todayPlanItems,
      rawHistory,
      reviewsSummary,
      recentActivities,
      questionAttemptsResult,
      userLayoutResult
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("name, weekly_study_hours, weekly_questions_goal, weekly_revisions_goal, weekly_study_days_goal, week_start_day, work_regime, experience_level")
        .eq("id", userId)
        .maybeSingle(),

      supabase
        .from("user_targets")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),

      getCycleOverviewData(supabase, userId).catch(() => null),
      getTodayStudyItems(supabase, userId).catch(() => []),
      getStudyHistoryForAnalytics(supabase, userId, 30).catch(() => []),
      getPendingReviewsSummary(supabase, userId).catch(() => ({
        count: 0,
        overdue: 0,
        today: 0,
        highPriority: 0,
        nextReview: null
      })),
      getRecentActivities(supabase, userId, 5).catch(() => []),
      supabase
        .from("question_attempts")
        .select("id, correct, question_id, created_at, answered_at, questions!inner ( discipline_id )")
        .eq("user_id", userId),
      supabase
        .from("user_dashboard_layouts")
        .select("widget_id, position_order, col_span, row_span, visible")
        .eq("user_id", userId)
        .order("position_order")
    ])

    const profile = profileResult?.data || null;
    const rawTarget = targetResult?.data || null;
    // Fetch disciplines now that rawTarget is known
    const disciplines = await getUserDisciplines(supabase, userId, rawTarget?.id).catch(() => []);

    let exam_date = rawTarget?.exam_date || null
    let exam_time = rawTarget?.exam_time || null
    let exam_location = rawTarget?.exam_location || null
    let exam_name = rawTarget?.exam_name || null

    if (rawTarget?.main_study_source) {
      try {
        if (rawTarget.main_study_source.startsWith("{") && rawTarget.main_study_source.endsWith("}")) {
          const meta = JSON.parse(rawTarget.main_study_source)
          if (meta.examDate) exam_date = meta.examDate
          if (meta.examTime) exam_time = meta.examTime
          if (meta.examLocation) exam_location = meta.examLocation
          if (meta.examName) exam_name = meta.examName
        }
      } catch {
        // Ignorar se não for JSON válido
      }
    }

    if (!exam_name) {
      exam_name = rawTarget?.target_exam || "Concurso Alvo"
    }

    const activeTarget = rawTarget ? {
      id: rawTarget.id,
      target_exam: rawTarget.target_exam || "Concurso Alvo",
      target_role: rawTarget.target_role || "Concurseiro",
      main_study_source: rawTarget.main_study_source,
      exam_date,
      exam_time,
      exam_location,
      exam_name,
    } : null

    const attemptsRaw = questionAttemptsResult?.data || []
    const attempts = attemptsRaw.map((a: {
      id: string
      correct: boolean
      question_id: string
      created_at: string
      answered_at: string
      questions?: { discipline_id?: string } | Array<{ discipline_id?: string }>
    }) => ({
      id: a.id,
      correct: a.correct,
      question_id: a.question_id,
      created_at: a.created_at,
      answered_at: a.answered_at,
      discipline_id: (Array.isArray(a.questions) ? a.questions[0]?.discipline_id : a.questions?.discipline_id) ?? null,
    }))
    let totalQuestions = attempts.length
    let correctQuestions = attempts.filter((a: { correct: boolean }) => a.correct).length

    // Add manual questions from study history metadata
    rawHistory.forEach((session) => {
      const meta = (session.metadata || {}) as Record<string, unknown>
      if (meta["questions_answered"]) {
        totalQuestions += Number(meta["questions_answered"])
      }
      if (meta["questions_correct"]) {
        correctQuestions += Number(meta["questions_correct"])
      }
    })

    const wrongQuestions = totalQuestions - correctQuestions
    const accuracyPercentage = totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : 0

    const typedDisciplines = (disciplines || []) as Array<{ status: string }>
    const disciplinesStats = {
      total: typedDisciplines.length,
      completed: typedDisciplines.filter((d) => d.status === "COMPLETED").length,
      revising: typedDisciplines.filter((d) => d.status === "REVISING").length,
      studying: typedDisciplines.filter((d) => d.status === "STUDYING").length,
    }

    const completedTopics = disciplinesStats.completed
    const pendingTopics = Math.max(0, disciplinesStats.total - completedTopics)
    const editalProgress = disciplinesStats.total > 0 ? Math.round((completedTopics / disciplinesStats.total) * 100) : 0

    const ctx = AnalyticsEngine.createContext(rawHistory as unknown as Parameters<typeof AnalyticsEngine.createContext>[0], 30, "America/Sao_Paulo", profile?.week_start_day ?? 1)
    const baseStats = AnalyticsEngine.aggregations.getBase(ctx)
    const targetHours = profile?.weekly_study_hours ?? null
    const targetQuestions = profile?.weekly_questions_goal ?? null
    const targetRevisions = profile?.weekly_revisions_goal ?? null
    const targetDays = profile?.weekly_study_days_goal ?? null
    
    // Calcular metas adicionais não presentes na base
    const startOfWeekMs = getStartOfWeek(new Date(), profile?.week_start_day ?? 1).getTime()
    
    let weeklyQuestions = attempts.filter((a) => {
      const d = new Date(a.answered_at || a.created_at)
      return d.getTime() >= startOfWeekMs
    }).length

    rawHistory.forEach((session) => {
      const d = new Date(session.started_at)
      if (d.getTime() >= startOfWeekMs) {
        const meta = (session.metadata || {}) as Record<string, unknown>
        if (meta["questions_answered"]) {
          weeklyQuestions += Number(meta["questions_answered"])
        }
      }
    })

    // Revisões concluídas na semana = sessões registradas como revisão no histórico
    const weeklyRevisions = rawHistory.filter((h) => {
      const d = new Date(h.started_at)
      return h.completed && d.getTime() >= startOfWeekMs && (h.study_type === "REVISAO" || h.study_source === "REVIEW")
    }).length || 0
    
    // Dias ativos na semana
    const uniqueDaysThisWeek = new Set(
      rawHistory
        .filter((h) => new Date(h.started_at).getTime() >= startOfWeekMs)
        .map((h) => h.started_at.split("T")[0])
    )
    const weeklyStudyDays = uniqueDaysThisWeek.size

    return {
      user: profile,
      activeTarget,
      stats: {
        dailyMinutes: baseStats.dailyMinutes,
        weeklyMinutes: baseStats.weeklyMinutes,
        monthlyMinutes: baseStats.monthlyMinutes,
        longestSession: baseStats.longestSession,
        consecutiveStreak: baseStats.consecutiveStreak,
        longestStreak: baseStats.longestStreak,
        averageFocus: baseStats.averageFocus,
        averageEnergy: baseStats.averageEnergy,
        averageDifficulty: baseStats.averageDifficulty,
        totalQuestions,
        correctQuestions,
        wrongQuestions,
        accuracyPercentage,
        completedTopics,
        pendingTopics,
        editalProgress
      },
      disciplinesStats,
      todayPlanItems,
      cycleBlocks: cycleOverview?.blocks || [],
      rawDisciplines: (disciplines || []).map((ud) => {
        const discId = ud.discipline?.id
        const discAttempts = attempts.filter((a) => a.discipline_id === discId)
        let correctCount = discAttempts.filter((a) => a.correct).length
        let totalCount = discAttempts.length

        const discHistory = rawHistory.filter((h) => h.discipline_id === discId && h.completed)
        
        discHistory.forEach(h => {
          const meta = (h.metadata || {}) as Record<string, unknown>
          if (meta["questions_answered"]) totalCount += Number(meta["questions_answered"])
          if (meta["questions_correct"]) correctCount += Number(meta["questions_correct"])
        })

        const wrongCount = totalCount - correctCount
        const accuracyPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0
        const totalMinutes = discHistory.reduce((acc: number, h) => acc + (h.duration_minutes || 0), 0)
        
        const h = Math.floor(totalMinutes / 60)
        const m = totalMinutes % 60
        const tempoFormatted = totalMinutes > 0 ? `${h}h${m.toString().padStart(2, "0")}min` : "-"

        return {
          id: ud.id,
          discipline_id: discId,
          name: ud.discipline?.name || "Desconhecida",
          tempoFormatted,
          correctCount,
          wrongCount,
          notebookCount: 0,
          accuracyPercentage,
        }
      }),
      reviews: reviewsSummary,
      recentActivities,
      analytics: {
        stats: {
          dailyMinutes: baseStats.dailyMinutes,
          weeklyMinutes: baseStats.weeklyMinutes,
          monthlyMinutes: baseStats.monthlyMinutes,
          longestSession: baseStats.longestSession,
          consecutiveStreak: baseStats.consecutiveStreak,
          longestStreak: baseStats.longestStreak,
          averageFocus: baseStats.averageFocus,
          averageEnergy: baseStats.averageEnergy,
          averageDifficulty: baseStats.averageDifficulty
        },
        heatmap: AnalyticsEngine.visuals.getHeatmap(ctx),
        evolution: AnalyticsEngine.visuals.getEvolutionTimeSeries(ctx, 7),
        rankings: {
          disciplines: AnalyticsEngine.rankings.getDisciplineRanking(ctx),
          areas: AnalyticsEngine.rankings.getAreaRanking(ctx)
        },
        goals: {
          weekly: AnalyticsEngine.goals.getWeeklyGoalProgress(ctx, targetHours),
          daily: AnalyticsEngine.goals.getDailyGoalProgress(ctx, targetHours),
          questions: {
            target: targetQuestions,
            achieved: weeklyQuestions,
            percentage: targetQuestions && targetQuestions > 0 ? Math.min(100, Math.round((weeklyQuestions / targetQuestions) * 100)) : null,
            remaining: targetQuestions && targetQuestions > 0 ? Math.max(0, targetQuestions - weeklyQuestions) : null,
          },
          revisions: {
            target: targetRevisions,
            achieved: weeklyRevisions,
            percentage: targetRevisions && targetRevisions > 0 ? Math.min(100, Math.round((weeklyRevisions / targetRevisions) * 100)) : null,
            remaining: targetRevisions && targetRevisions > 0 ? Math.max(0, targetRevisions - weeklyRevisions) : null,
          },
          studyDays: {
            target: targetDays,
            achieved: weeklyStudyDays,
            percentage: targetDays && targetDays > 0 ? Math.min(100, Math.round((weeklyStudyDays / targetDays) * 100)) : null,
            remaining: targetDays && targetDays > 0 ? Math.max(0, targetDays - weeklyStudyDays) : null,
          }
        },
        insights: AnalyticsEngine.ai.getInsights(ctx)
      },
      userLayout: (userLayoutResult?.data && userLayoutResult.data.length > 0)
        ? userLayoutResult.data.map((item) => ({
            widget_id: item.widget_id,
            position_order: item.position_order,
            col_span: Math.min(3, Math.max(1, item.col_span || 1)) as 1 | 2 | 3,
            row_span: item.row_span || 1,
            visible: item.visible
          }))
        : undefined
    }
  } catch (error) {
    console.error("Erro ao carregar Dashboard:", error)
    return {
      user: null,
      activeTarget: null,
      stats: {
        dailyMinutes: 0,
        weeklyMinutes: 0,
        monthlyMinutes: 0,
        longestSession: 0,
        consecutiveStreak: 0,
        longestStreak: 0,
        averageFocus: null,
        averageEnergy: null,
        averageDifficulty: null,
        totalQuestions: 0,
        correctQuestions: 0,
        wrongQuestions: 0,
        accuracyPercentage: 0,
        completedTopics: 0,
        pendingTopics: 0,
        editalProgress: 0
      },
      disciplinesStats: { total: 0, completed: 0, revising: 0, studying: 0 },
      todayPlanItems: [],
      rawDisciplines: [],
      reviews: { count: 0, overdue: 0, today: 0, highPriority: 0, nextReview: null },
      recentActivities: [],
      analytics: {
        stats: {
          dailyMinutes: 0,
          weeklyMinutes: 0,
          monthlyMinutes: 0,
          longestSession: 0,
          consecutiveStreak: 0,
          longestStreak: 0,
          averageFocus: null,
          averageEnergy: null,
          averageDifficulty: null
        },
        heatmap: [],
        evolution: [],
        rankings: { disciplines: [], areas: [] },
        goals: {
          weekly: { target: null, achieved: 0, percentage: null, remaining: null },
          daily: { target: null, achieved: 0, percentage: null, remaining: null },
          questions: { target: null, achieved: 0, percentage: null, remaining: null },
          revisions: { target: null, achieved: 0, percentage: null, remaining: null },
          studyDays: { target: null, achieved: 0, percentage: null, remaining: null }
        },
        insights: []
      }
    }
  }
}
