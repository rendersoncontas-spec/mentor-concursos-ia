"use server"

import * as Sentry from "@sentry/nextjs"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

import { createClient } from "@/infrastructure/supabase/server"
import { computeStreak, localDateKey } from "@/utils/study-streak"
import { getDayInSaoPaulo, daysAgoKeyInSaoPaulo, dayOfWeekForDateKey, getHourInSaoPaulo } from "@/lib/sao-paulo"

export interface AchievementsFacts {
  streak: number
  totalMinutes: number
  totalQuestions: number
  totalCorrect: number
  overallAccuracy: number
  reviews: number
  simulados: number
  simuladoAvgScore: number
  plans: number
  sessions: number
  onboardingCompleted: boolean
  firstSessionAt: string | null
  lastSessionAt: string | null
  morningSessions: number
  afternoonSessions: number
  nightSessions: number
  distinctTopicsStudied: number
  bestDisciplineAcc30: number
  bestDisciplineAcc50: number
  planDaysTotal: number
  planDaysDone: number
  adherencePercentage: number
  replanRecoveredCount: number
}

export async function getAchievementsAction(): Promise<{
  data: AchievementsFacts | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: "Usuário não autenticado" }
    }

    const [historyRes, attemptsRes, reviewsRes, simuladosRes, plansRes, profileRes] =
      await Promise.all([
        // Fase F.1: paginados (antes 1 requisição cada, cortada em 1.000 linhas
        // → conquistas calculadas sobre um recorte arbitrário do histórico).
        // Mesmo formato { data, error } de antes.
        fetchAllRowsPaged<{
          started_at: string
          duration_minutes: number | null
          study_type: string | null
          discipline_id: string | null
          metadata: Record<string, unknown> | null
        }>(
          (withCount) =>
            supabase
              .from("study_history")
              .select("started_at, duration_minutes, study_type, discipline_id, metadata", countOption(withCount))
              .eq("user_id", user.id),
          [
            { column: "started_at", ascending: true },
            { column: "id", ascending: true },
          ],
        ).then(({ data, error }) => ({ data: error ? null : data, error })),
        fetchAllRowsPaged<{ is_correct: boolean | null }>(
          (withCount) => supabase.from("question_attempts").select("is_correct", countOption(withCount)).eq("user_id", user.id),
          [{ column: "id", ascending: true }],
        ).then(({ data, error }) => ({ data: error ? null : data, error })),
        supabase
          .from("review_history")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.from("simulados").select("id, pontuacao, total_questoes").eq("user_id", user.id),
        supabase.from("study_plans").select("id, active").eq("user_id", user.id),
        supabase.from("profiles").select("onboarding_completed").eq("id", user.id).maybeSingle(),
      ])

    const facts: AchievementsFacts = {
      streak: 0,
      totalMinutes: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      overallAccuracy: 0,
      reviews: reviewsRes.count ?? 0,
      simulados: simuladosRes.data?.length ?? 0,
      simuladoAvgScore: 0,
      plans: plansRes.data?.length ?? 0,
      sessions: historyRes.data?.length ?? 0,
      onboardingCompleted: profileRes.data?.onboarding_completed === true,
      firstSessionAt: null,
      lastSessionAt: null,
      morningSessions: 0,
      afternoonSessions: 0,
      nightSessions: 0,
      distinctTopicsStudied: 0,
      bestDisciplineAcc30: 0,
      bestDisciplineAcc50: 0,
      planDaysTotal: 0,
      planDaysDone: 0,
      adherencePercentage: 0,
      replanRecoveredCount: 0,
    }

    const days = new Map<string, number>()
    const distinctTopics = new Set<string>()
    const disciplineStats = new Map<string, { answered: number; correct: number }>()

    let firstAt: string | null = null
    let lastAt: string | null = null

    // Fase 5 da auditoria (timezone): todayDow/weekStart eram calculados com
    // accessors de Date no fuso local do runtime (UTC em produção), não no
    // fuso de negócio (America/Sao_Paulo) — o mesmo desvio de ~3h na virada
    // do dia podia fazer o "domingo" da semana e o dia da semana de hoje
    // ficarem errados, afetando facts.planDaysDone/adherencePercentage.
    const now = new Date()
    const todayKey = getDayInSaoPaulo(now)
    const todayDow = dayOfWeekForDateKey(todayKey)
    const weekStartKey = daysAgoKeyInSaoPaulo(todayDow, todayKey)
    const studiedDow = new Set<number>()

    for (const row of historyRes.data ?? []) {
      const startedAt = row.started_at as string | null
      const minutes = Number(row.duration_minutes) || 0
      facts.totalMinutes += minutes

      const meta = (row.metadata ?? {}) as Record<string, unknown>
      const qAnswered = Number(meta["questions_answered"]) || 0
      const qCorrect = Number(meta["questions_correct"]) || 0
      facts.totalQuestions += qAnswered
      facts.totalCorrect += qCorrect

      if (row.study_type === "REVISAO" && (reviewsRes.count ?? 0) === 0) {
        facts.reviews += 1
      }
      if (row.study_type === "SIMULADO" && (simuladosRes.data?.length ?? 0) === 0) {
        facts.simulados += 1
      }

      const topicName = typeof meta["topic_name"] === "string" ? meta["topic_name"].trim() : ""
      if (topicName) {
        distinctTopics.add(topicName.toLowerCase())
      }

      // Desempenho por disciplina
      const discId = row.discipline_id as string | null
      if (discId && qAnswered > 0) {
        const prev = disciplineStats.get(discId) ?? { answered: 0, correct: 0 }
        disciplineStats.set(discId, {
          answered: prev.answered + qAnswered,
          correct: prev.correct + qCorrect,
        })
      }

      if (startedAt) {
        const date = new Date(startedAt)
        if (!Number.isNaN(date.getTime())) {
          const key = localDateKey(date)
          days.set(key, (days.get(key) ?? 0) + minutes)

          if (!firstAt || date.getTime() < new Date(firstAt).getTime()) firstAt = startedAt
          if (!lastAt || date.getTime() > new Date(lastAt).getTime()) lastAt = startedAt

          const hour = getHourInSaoPaulo(date)
          if (hour >= 6 && hour < 12) facts.morningSessions += 1
          if (hour >= 12 && hour < 18) facts.afternoonSessions += 1
          if (hour >= 18 && hour <= 22) facts.nightSessions += 1

          if (key >= weekStartKey && key <= todayKey) studiedDow.add(dayOfWeekForDateKey(key))
        }
      }
    }

    // Questões de question_attempts
    if (attemptsRes.data && attemptsRes.data.length > 0) {
      const attemptsCount = attemptsRes.data.length
      const correctCount = attemptsRes.data.filter((a) => a.is_correct).length
      // Se não foram registradas via study_history, somar
      if (facts.totalQuestions < attemptsCount) {
        facts.totalQuestions = Math.max(facts.totalQuestions, attemptsCount)
        facts.totalCorrect = Math.max(facts.totalCorrect, correctCount)
      }
    }

    facts.distinctTopicsStudied = distinctTopics.size
    facts.streak = computeStreak(new Set(days.keys()))
    facts.firstSessionAt = firstAt
    facts.lastSessionAt = lastAt

    if (facts.totalQuestions > 0) {
      facts.overallAccuracy = Math.round((facts.totalCorrect / facts.totalQuestions) * 100)
    }

    // Médias de simulados
    if (simuladosRes.data && simuladosRes.data.length > 0) {
      let totalSimPct = 0
      let validSims = 0
      for (const s of simuladosRes.data) {
        if (s.total_questoes && s.total_questoes > 0) {
          totalSimPct += (Number(s.pontuacao || 0) / Number(s.total_questoes)) * 100
          validSims += 1
        }
      }
      if (validSims > 0) {
        facts.simuladoAvgScore = Math.round(totalSimPct / validSims)
      }
    }

    // Disciplinas fortes e especialistas
    for (const stats of disciplineStats.values()) {
      if (stats.answered >= 30) {
        const acc = Math.round((stats.correct / stats.answered) * 100)
        if (acc > facts.bestDisciplineAcc30) facts.bestDisciplineAcc30 = acc
      }
      if (stats.answered >= 50) {
        const acc = Math.round((stats.correct / stats.answered) * 100)
        if (acc > facts.bestDisciplineAcc50) facts.bestDisciplineAcc50 = acc
      }
    }

    // Plano ativo e aderência
    const activePlan = plansRes.data?.find((p) => p.active)
    if (activePlan) {
      const { data: planItems } = await supabase
        .from("study_plan_items")
        .select("day_of_week")
        .eq("study_plan_id", activePlan.id)

      const plannedDow = new Set(
        (planItems ?? []).map((i) => Number((i as { day_of_week: unknown }).day_of_week)),
      )
      const plannedDays = [...plannedDow].filter((d) => d >= 0 && d <= todayDow)
      facts.planDaysTotal = plannedDays.length
      facts.planDaysDone = plannedDays.filter((d) => studiedDow.has(d)).length

      if (facts.planDaysTotal > 0) {
        facts.adherencePercentage = Math.round((facts.planDaysDone / facts.planDaysTotal) * 100)
      }
    }

    return { data: facts, error: null }
  } catch (err) {
    console.error("[getAchievementsAction] Erro ao carregar conquistas:", err)
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { feature: "achievements" },
    })
    return {
      data: null,
      error: (err as { message?: string }).message ?? "Erro ao carregar conquistas.",
    }
  }
}
