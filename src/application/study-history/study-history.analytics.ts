import { SupabaseClient } from "@supabase/supabase-js"
import { StudyStats, DisciplineTrend } from "@/domain/study-history/study-history.types"

// ==============================================================================
// 1. Agregadores Base (Dashboard UI)
// ==============================================================================

export async function getStudyStats(supabase: SupabaseClient, userId: string): Promise<StudyStats> {
  const { data: history } = await supabase
    .from("study_history")
    .select("started_at, duration_minutes, discipline_id, focus_score, interrupted")
    .eq("user_id", userId)
    .not("duration_minutes", "is", null)

  const items = history || []

  // Cálculos de tempo
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).getTime() // Simplificado (Domingo)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  let dailyMinutes = 0
  let weeklyMinutes = 0
  let monthlyMinutes = 0
  let totalMinutes = 0
  let longestSession = 0
  
  let totalFocus = 0
  let focusCount = 0

  const disciplineMap = new Map<string, number>()

  items.forEach(item => {
    const startedAt = new Date(item.started_at).getTime()
    const duration = item.duration_minutes || 0

    totalMinutes += duration
    if (duration > longestSession) longestSession = duration

    if (startedAt >= startOfDay) dailyMinutes += duration
    if (startedAt >= startOfWeek) weeklyMinutes += duration
    if (startedAt >= startOfMonth) monthlyMinutes += duration

    if (item.focus_score) {
      totalFocus += item.focus_score
      focusCount++
    }

    const currentDiscMins = disciplineMap.get(item.discipline_id) || 0
    disciplineMap.set(item.discipline_id, currentDiscMins + duration)
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

  // TODO: Implementar getBestStudyHour, getBestWeekday baseado em distribuição
  // TODO: Implementar consecutiveStreak rodando sobre dias únicos
  const consecutiveStreak = 0 

  return {
    dailyMinutes,
    weeklyMinutes,
    monthlyMinutes,
    totalMinutes,
    longestSession,
    bestStudyHour: null, // Stub
    bestWeekday: null, // Stub
    mostStudiedDisciplineId,
    averageFocus: focusCount > 0 ? totalFocus / focusCount : null,
    consecutiveStreak
  }
}

// Funções stubbadas específicas para facilitar refatorações
export async function getDailyMinutes(supabase: SupabaseClient, userId: string) { return (await getStudyStats(supabase, userId)).dailyMinutes }
export async function getWeeklyMinutes(supabase: SupabaseClient, userId: string) { return (await getStudyStats(supabase, userId)).weeklyMinutes }
export async function getMonthlyMinutes(supabase: SupabaseClient, userId: string) { return (await getStudyStats(supabase, userId)).monthlyMinutes }

export async function getStudyHeatmap(supabase: SupabaseClient, userId: string) {
  // TODO: Retornar estrutura para os quadrados de atividade (GitHub calendar)
  return []
}

// ==============================================================================
// 2. Machine Learning / IA - Stubs Atuais
// ==============================================================================

/**
 * MOCK: Futura IA que analisará dificuldade vs performance
 */
export async function calculateDisciplineTrend(supabase: SupabaseClient, disciplineId: string): Promise<DisciplineTrend> {
  return {
    disciplineId,
    trend: 'STABLE',
    averageFocus: 3,
    averageDifficulty: 3
  }
}

export async function predictNextWeakness(supabase: SupabaseClient, userId: string): Promise<string | null> {
  // Retornará a disciplina que a IA acha que o aluno vai esquecer
  return null
}

export async function recommendStudyTime(supabase: SupabaseClient, userId: string, disciplineId: string): Promise<number> {
  // Ex: IA recomenda 45 min baseado na última sessão
  return 60
}

export async function estimateBurnout(supabase: SupabaseClient, userId: string): Promise<number> {
  // 0 a 100%
  return 10
}

export async function estimateRetention(supabase: SupabaseClient, userId: string, disciplineId: string): Promise<number> {
  // Curva de esquecimento de Ebbinghaus
  return 85
}

export async function estimateRevisionNeed(supabase: SupabaseClient, userId: string, disciplineId: string): Promise<boolean> {
  return false
}
