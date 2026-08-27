import type { SupabaseClient } from "@supabase/supabase-js"
import type { StudyStats, DisciplineTrend } from "@/domain/study-history/study-history.types"
import { computeStudyTimeFromHistory } from "@/lib/study-time-calculator"

// ==============================================================================
// 1. Agregadores Base (Dashboard UI)
// ==============================================================================

export async function getStudyStats(supabase: SupabaseClient, userId: string): Promise<StudyStats> {
  const [{ data: history }, { data: profile }] = await Promise.all([
    supabase
      .from("study_history")
      .select("started_at, duration_minutes, discipline_id, focus_score, interrupted")
      .eq("user_id", userId)
      .not("duration_minutes", "is", null),
    supabase
      .from("profiles")
      .select("week_start_day, preferences")
      .eq("id", userId)
      .maybeSingle(),
  ])

  const items = history || []
  const weekStartDay =
    profile?.week_start_day ??
    ((profile?.preferences as Record<string, unknown> | null)?.["firstDayOfWeek"] === "Segunda-feira" ? 1 : 0)

  // Cálculo de tempo centralizado no fuso de São Paulo conforme preferência do aluno
  const timeSummary = computeStudyTimeFromHistory(items, new Date(), weekStartDay)

  let totalFocus = 0
  let focusCount = 0
  const disciplineMap = new Map<string, number>()

  items.forEach(item => {
    const duration = Number(item.duration_minutes) || 0

    if (item.focus_score) {
      totalFocus += item.focus_score
      focusCount++
    }

    if (item.discipline_id) {
      const currentDiscMins = disciplineMap.get(item.discipline_id) || 0
      disciplineMap.set(item.discipline_id, currentDiscMins + duration)
    }
  })

  // Disciplina mais estudada
  let mostStudiedDisciplineId: string | null = null
  let maxDiscMins = 0
  disciplineMap.forEach((mins, id) => {
    if (mins > maxDiscMins) {
      maxDiscMins = mins
      mostStudiedDisciplineId = id
    }
  })

  return {
    dailyMinutes: timeSummary.dailyMinutes,
    weeklyMinutes: timeSummary.weeklyMinutes,
    monthlyMinutes: timeSummary.monthlyMinutes,
    totalMinutes: timeSummary.totalMinutes,
    longestSession: timeSummary.longestSession,
    bestStudyHour: null, // Stub
    bestWeekday: null, // Stub
    mostStudiedDisciplineId,
    averageFocus: focusCount > 0 ? totalFocus / focusCount : null,
    consecutiveStreak: 0
  }
}

// Funções stubbadas específicas para facilitar refatorações
export async function getDailyMinutes(supabase: SupabaseClient, userId: string) { return (await getStudyStats(supabase, userId)).dailyMinutes }
export async function getWeeklyMinutes(supabase: SupabaseClient, userId: string) { return (await getStudyStats(supabase, userId)).weeklyMinutes }
export async function getMonthlyMinutes(supabase: SupabaseClient, userId: string) { return (await getStudyStats(supabase, userId)).monthlyMinutes }

export async function getStudyHeatmap(_supabase: SupabaseClient, _userId: string) {
  // TODO: Retornar estrutura para os quadrados de atividade (GitHub calendar)
  return []
}

// ==============================================================================
// 2. Machine Learning / IA - Stubs Atuais
// ==============================================================================

/**
 * MOCK: Futura IA que analisará dificuldade vs performance
 */
export async function calculateDisciplineTrend(_supabase: SupabaseClient, disciplineId: string): Promise<DisciplineTrend> {
  return {
    disciplineId,
    trend: 'STABLE',
    averageFocus: 3,
    averageDifficulty: 3
  }
}

export async function predictNextWeakness(_supabase: SupabaseClient, _userId: string): Promise<string | null> {
  // Retornará a disciplina que a IA acha que o aluno vai esquecer
  return null
}

export async function recommendStudyTime(_supabase: SupabaseClient, _userId: string, _disciplineId: string): Promise<number> {
  // Ex: IA recomenda 45 min baseado na última sessão
  return 60
}

export async function estimateBurnout(_supabase: SupabaseClient, _userId: string): Promise<number> {
  // 0 a 100%
  return 10
}

export async function estimateRetention(_supabase: SupabaseClient, _userId: string, _disciplineId: string): Promise<number> {
  // Curva de esquecimento de Ebbinghaus
  return 85
}

export async function estimateRevisionNeed(_supabase: SupabaseClient, _userId: string, _disciplineId: string): Promise<boolean> {
  return false
}
