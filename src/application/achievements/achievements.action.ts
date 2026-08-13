"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { computeStreak, localDateKey } from "@/utils/study-streak"

export interface AchievementsFacts {
  streak: number
  totalMinutes: number
  attempts: number
  reviews: number
  pages: number
  simulados: number
  plans: number
  sessions: number
  onboardingCompleted: boolean
  maxDayMinutes: number
  firstSessionAt: string | null
  lastSessionAt: string | null
  hasLateNightSession: boolean
  hasEarlyMorningSession: boolean
  rankingPodiums: number
  planDaysTotal: number
  planDaysDone: number
}

export async function getAchievementsAction(): Promise<{ data: AchievementsFacts | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const [historyRes, attemptsRes, reviewsRes, simuladosRes, plansRes, profileRes] = await Promise.all([
      supabase
        .from("study_history")
        .select("started_at, duration_minutes, metadata")
        .eq("user_id", user.id),
      supabase.from("question_attempts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("review_history").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("simulados").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("study_plans").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("profiles").select("onboarding_completed").eq("id", user.id).maybeSingle(),
    ])

    const facts: AchievementsFacts = {
      streak: 0,
      totalMinutes: 0,
      attempts: attemptsRes.count ?? 0,
      reviews: reviewsRes.count ?? 0,
      pages: 0,
      simulados: simuladosRes.count ?? 0,
      plans: plansRes.count ?? 0,
      sessions: historyRes.data?.length ?? 0,
      onboardingCompleted: profileRes.data?.onboarding_completed === true,
      maxDayMinutes: 0,
      firstSessionAt: null,
      lastSessionAt: null,
      hasLateNightSession: false,
      hasEarlyMorningSession: false,
      rankingPodiums: 0,
      planDaysTotal: 0,
      planDaysDone: 0,
    }

    const days = new Map<string, number>()
    let firstAt: string | null = null
    let lastAt: string | null = null

    const now = new Date()
    const todayDow = now.getDay()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayDow)
    const studiedDow = new Set<number>()

    for (const row of historyRes.data ?? []) {
      const startedAt = row.started_at as string | null
      const minutes = Number(row.duration_minutes) || 0
      facts.totalMinutes += minutes

      if (startedAt) {
        const date = new Date(startedAt)
        if (!Number.isNaN(date.getTime())) {
          const key = localDateKey(date)
          days.set(key, (days.get(key) ?? 0) + minutes)
          if (!firstAt || date.getTime() < new Date(firstAt).getTime()) firstAt = startedAt
          if (!lastAt || date.getTime() > new Date(lastAt).getTime()) lastAt = startedAt
          const hour = date.getHours()
          if (hour >= 22 || hour < 5) facts.hasLateNightSession = true
          if (hour >= 5 && hour < 8) facts.hasEarlyMorningSession = true
          if (date >= weekStart && date <= now) studiedDow.add(date.getDay())
        }
      }

      const meta = (row.metadata ?? {}) as Record<string, unknown>
      facts.pages += Number(meta["pages_read"]) || 0
    }

    for (const minutes of days.values()) {
      if (minutes > facts.maxDayMinutes) facts.maxDayMinutes = minutes
    }

    facts.streak = computeStreak(new Set(days.keys()))
    facts.firstSessionAt = firstAt
    facts.lastSessionAt = lastAt

    const activePlanRes = await supabase
      .from("study_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
    const activePlanRows = activePlanRes.data
    const podiums = await countRankingPodiums(supabase, user.id)

    const activePlan = activePlanRows?.[0]
    if (activePlan) {
      const { data: planItems } = await supabase
        .from("study_plan_items")
        .select("day_of_week")
        .eq("study_plan_id", activePlan.id)
      const plannedDow = new Set(
        (planItems ?? []).map((i) => Number((i as { day_of_week: unknown }).day_of_week))
      )
      const plannedDays = [...plannedDow].filter((d) => d >= 0 && d <= todayDow)
      facts.planDaysTotal = plannedDays.length
      facts.planDaysDone = plannedDays.filter((d) => studiedDow.has(d)).length
    }

    facts.rankingPodiums = podiums

    return { data: facts, error: null }
  } catch (err) {
    return { data: null, error: (err as { message?: string }).message ?? "Erro ao carregar conquistas" }
  }
}

// Conta em quantas das últimas 8 semanas o usuário esteve no pódio (top 3)
// do ranking de tempo, usando a mesma RPC do ranking global (SECURITY DEFINER,
// sem RLS). Retorna 0 se a RPC não estiver disponível (medalha fica bloqueada,
// nunca é concedida sem dados reais).
async function countRankingPodiums(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const weeks = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      supabase.rpc("get_global_ranking", {
        p_period: "this_week",
        p_current_user_id: userId,
        p_week_offset: -(i + 1),
      })
    )
  )

  let podiums = 0
  for (const week of weeks) {
    if (week.status !== "fulfilled" || week.value.error) continue
    const rpcData = week.value.data

    let raw = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (raw && typeof raw === "object" && "result" in raw) {
      const nested = (raw as { result: unknown }).result
      raw = Array.isArray(nested) ? nested[0] : nested
    }
    const list =
      raw && typeof raw === "object" && Array.isArray((raw as { rankingTempo?: unknown }).rankingTempo)
        ? (raw as { rankingTempo: Array<Record<string, unknown>> }).rankingTempo
        : []

    for (let i = 0; i < Math.min(list.length, 3); i++) {
      const row = list[i] ?? {}
      if (row["id"] === userId || row["user_id"] === userId) {
        podiums++
        break
      }
    }
  }
  return podiums
}