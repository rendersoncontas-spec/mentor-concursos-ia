import { type SupabaseClient } from "@supabase/supabase-js"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"
import { type DashboardSnapshot } from "@/domain/dashboard/dashboard.types"
import { getTodayStudyItems, getCycleOverviewData } from "@/application/study-plan/study-plan.service"
import { getUserDisciplines } from "@/application/disciplines/disciplines.service"
import { getStudyHistoryForAnalytics, AnalyticsEngine } from "@/application/study-analytics/study-analytics.service"
import { getPendingReviewsSummary } from "@/application/review-engine/review-engine.service"
import { getRecentActivities } from "@/application/study-history/study-history.service"
import { getDayInSaoPaulo, startOfDayInSaoPauloMs } from "@/lib/sao-paulo"
import { getSaoPauloWeekRange, resolveWeekStartDay } from "@/lib/study-time-calculator"
import { formatDurationMinutes } from "@/lib/format-duration"

/** Fase F.2: únicas chaves do metadata das sessões que o Dashboard usa. */
export const DASHBOARD_METADATA_KEYS = ["questions_answered", "questions_correct"] as const

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
      questionAttemptsResult
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("name, weekly_study_hours, weekly_questions_goal, weekly_revisions_goal, weekly_study_days_goal, week_start_day, work_regime, experience_level, preferences")
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
      // Fase F.2: o Dashboard só lê questions_answered/questions_correct do
      // metadata (acertos por período e por disciplina) — pede só essas chaves.
      getStudyHistoryForAnalytics(supabase, userId, 0, { metadataKeys: DASHBOARD_METADATA_KEYS }).catch(() => []),
      getPendingReviewsSummary(supabase, userId).catch(() => ({
        count: 0,
        overdue: 0,
        today: 0,
        highPriority: 0,
        nextReview: null
      })),
      getRecentActivities(supabase, userId, 5).catch(() => []),
      // Fase F.1: paginado (question_attempts cresce 1 linha por questão
      // respondida; 1 requisição era cortada em 1.000). Mesmo formato
      // { data } de antes; erro → data null, como antes.
      fetchAllRowsPaged<{
        id: string
        correct: boolean
        question_id: string
        created_at: string
        answered_at: string
        questions?: { discipline_id?: string } | Array<{ discipline_id?: string }>
      }>(
        (withCount) =>
          supabase
            .from("question_attempts")
            .select("id, correct, question_id, created_at, answered_at, questions!inner ( discipline_id )", countOption(withCount))
            .eq("user_id", userId),
        [{ column: "id", ascending: true }],
      ).then(({ data, error }) => ({ data: error ? null : data })),
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

    // Determinar primeiro dia da semana do perfil (0 = Domingo, 1 = Segunda)
    const prefsFirstDay = (profile?.preferences as Record<string, unknown> | null)?.["firstDayOfWeek"]
    const weekStartDay = resolveWeekStartDay(prefsFirstDay, profile?.week_start_day)

    // Calcular desempenho por período (Hoje, Semana, Mês, Ano, Total)
    // Fase 5 da auditoria: os limites eram calculados com Date local do
    // runtime do servidor (UTC em produção), não com o fuso de São Paulo,
    // causando um desvio de até ~3h na virada do dia/semana/mês/ano.
    const now = new Date()
    const todayKey = getDayInSaoPaulo(now)
    const weekRange = getSaoPauloWeekRange(todayKey, weekStartDay)
    const startOfTodayMs = startOfDayInSaoPauloMs(todayKey)
    const startOfWeekMs = startOfDayInSaoPauloMs(weekRange.mondayKey)
    const startOfMonthMs = startOfDayInSaoPauloMs(`${todayKey.slice(0, 7)}-01`)
    const startOfYearMs = startOfDayInSaoPauloMs(`${todayKey.slice(0, 4)}-01-01`)

    const periodThresholds = [
      { key: "HOJE" as const, minMs: startOfTodayMs },
      { key: "SEMANA" as const, minMs: startOfWeekMs },
      { key: "MES" as const, minMs: startOfMonthMs },
      { key: "ANO" as const, minMs: startOfYearMs },
      { key: "TOTAL" as const, minMs: 0 },
    ]

    const performanceByPeriod = {
      HOJE: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      SEMANA: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      MES: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      ANO: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
      TOTAL: { totalQuestions: 0, correctQuestions: 0, wrongQuestions: 0, accuracyPercentage: 0 },
    }

    for (const p of periodThresholds) {
      let pTotal = 0
      let pCorrect = 0

      // 1. Question Attempts na plataforma
      for (const a of attempts) {
        const d = new Date(a.answered_at || a.created_at).getTime()
        if (d >= p.minMs) {
          pTotal += 1
          if (a.correct) {
            pCorrect += 1
          }
        }
      }

      // 2. Questões manuais ou importadas do histórico de sessões
      for (const session of rawHistory) {
        const d = new Date(session.started_at).getTime()
        if (d >= p.minMs) {
          const meta = (session.metadata || {}) as Record<string, unknown>
          const answered = Number(meta["questions_answered"] || 0)
          const correct = Number(meta["questions_correct"] || 0)
          if (answered > 0) {
            pTotal += answered
            pCorrect += Math.min(answered, Math.max(0, correct))
          }
        }
      }

      const pWrong = Math.max(0, pTotal - pCorrect)
      const pAccuracy = pTotal > 0 ? Math.round((pCorrect / pTotal) * 100) : 0

      performanceByPeriod[p.key] = {
        totalQuestions: pTotal,
        correctQuestions: pCorrect,
        wrongQuestions: pWrong,
        accuracyPercentage: pAccuracy,
      }
    }

    const totalQuestions = performanceByPeriod.TOTAL.totalQuestions
    const correctQuestions = performanceByPeriod.TOTAL.correctQuestions
    const wrongQuestions = performanceByPeriod.TOTAL.wrongQuestions
    const accuracyPercentage = performanceByPeriod.TOTAL.accuracyPercentage

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

    const ctx = AnalyticsEngine.createContext(rawHistory as unknown as Parameters<typeof AnalyticsEngine.createContext>[0], 30, "America/Sao_Paulo", weekStartDay)
    const baseStats = AnalyticsEngine.aggregations.getBase(ctx)
    const targetHours = profile?.weekly_study_hours ?? null
    const targetQuestions = profile?.weekly_questions_goal ?? null
    const targetRevisions = profile?.weekly_revisions_goal ?? null
    const targetDays = profile?.weekly_study_days_goal ?? null
    
    // Calcular metas adicionais não presentes na base
    const weeklyQuestions = performanceByPeriod.SEMANA.totalQuestions

    // Revisões concluídas na semana = sessões registradas como revisão no histórico (Segunda a Domingo)
    const weeklyRevisions = rawHistory.filter((h) => {
      if (!h.completed || !h.started_at) return false
      const dateKey = getDayInSaoPaulo(h.started_at)
      return (
        dateKey >= weekRange.mondayKey &&
        dateKey <= weekRange.sundayKey &&
        (h.study_type === "REVISAO" || h.study_source === "REVIEW")
      )
    }).length || 0
    
    // Dias ativos na semana (Segunda a Domingo)
    const uniqueDaysThisWeek = new Set(
      rawHistory
        .filter((h) => {
          if (!h.started_at) return false
          const dateKey = getDayInSaoPaulo(h.started_at)
          return (
            dateKey >= weekRange.mondayKey &&
            dateKey <= weekRange.sundayKey &&
            (Number(h.duration_minutes) || 0) > 0
          )
        })
        .map((h) => getDayInSaoPaulo(h.started_at))
    )
    const weeklyStudyDays = uniqueDaysThisWeek.size

    // ── CONTEXTO PLANO + CICLO + 30D (consolidação em memória, sem novas queries) ──
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const thirtyDaysAgoMs = now.getTime() - THIRTY_DAYS_MS

    const plannedById = new Map<string, { name: string }>()
    for (const item of todayPlanItems || []) {
      const discId = (item as { discipline_id?: string }).discipline_id
      const discName = (item as { discipline?: { name?: string } }).discipline?.name
      if (discId && !plannedById.has(discId)) {
        plannedById.set(discId, { name: discName || "Desconhecida" })
      }
    }

    const cycleBlocks = cycleOverview?.blocks || []
    const cycleById = new Map<string, { name: string; order: number; isCurrent: boolean }>()
    cycleBlocks.forEach((block, index) => {
      const discId = (block as { disciplineId?: string }).disciplineId
      const discName = (block as { disciplineName?: string }).disciplineName
      if (discId && !cycleById.has(discId)) {
        cycleById.set(discId, {
          name: discName || "Desconhecida",
          order: index,
          isCurrent: index === (cycleOverview?.currentBlockIndex ?? -1),
        })
      }
    })

    const recentById = new Map<string, string>()
    for (const h of rawHistory || []) {
      const discId = (h as { discipline_id?: string | null }).discipline_id
      const startedAt = (h as { started_at?: string }).started_at
      if (!discId || !startedAt) continue
      const ms = new Date(startedAt).getTime()
      if (isNaN(ms) || ms < thirtyDaysAgoMs) continue
      const prev = recentById.get(discId)
      if (!prev || startedAt > prev) recentById.set(discId, startedAt)
    }

    const knownDisciplines = new Map<string, string>()
    for (const ud of disciplines || []) {
      const discId = (ud as { discipline?: { id?: string; name?: string } }).discipline?.id
      const discName = (ud as { discipline?: { id?: string; name?: string } }).discipline?.name
      if (discId && discName && !knownDisciplines.has(discId)) {
        knownDisciplines.set(discId, discName)
      }
    }
    for (const [id, v] of plannedById) {
      if (!knownDisciplines.has(id)) knownDisciplines.set(id, v.name)
    }
    for (const [id, v] of cycleById) {
      if (!knownDisciplines.has(id)) knownDisciplines.set(id, v.name)
    }

    const subjectContexts = Array.from(knownDisciplines.entries()).map(([discipline_id, name]) => {
      const planned = plannedById.has(discipline_id)
      const cycleInfo = cycleById.get(discipline_id)
      const recentAt = recentById.get(discipline_id) ?? null
      return {
        discipline_id,
        name,
        planned,
        inCycle: !!cycleInfo,
        cycleOrder: cycleInfo ? cycleInfo.order : null,
        isCurrentInCycle: cycleInfo ? cycleInfo.isCurrent : false,
        recent30d: recentAt !== null,
        lastStudiedAt: recentAt,
      }
    })

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
        performanceByPeriod,
        completedTopics,
        pendingTopics,
        editalProgress
      },
      disciplinesStats,
      todayPlanItems,
      cycleBlocks: cycleOverview?.blocks || [],
      subjectContexts,
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
        
        const tempoFormatted = totalMinutes > 0 ? formatDurationMinutes(totalMinutes) : "-"

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
      }
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
