import { SupabaseClient } from "@supabase/supabase-js"
import { StudyHistory, StudyHistoryInsert } from "@/domain/study-history/study-history.types"

/**
 * Cria ou inicia uma sessão de estudo.
 */
export async function createStudySession(
  supabase: SupabaseClient,
  userId: string,
  data: StudyHistoryInsert
) {
  const { data: session, error } = await supabase
    .from("study_history")
    .insert({
      user_id: userId,
      discipline_id: data.discipline_id,
      study_plan_item_id: data.study_plan_item_id,
      study_source: data.study_source,
      planned_minutes: data.planned_minutes,
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw new Error("Erro ao iniciar sessão: " + error.message)
  return session
}

/**
 * Finaliza a sessão de estudo calculando a duração no backend para evitar fraudes.
 */
export async function finishStudySession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  feedback: {
    energy_level?: number
    difficulty?: number
    focus_score?: number
    mood?: string
    notes?: string
    interrupted?: boolean
  }
) {
  // 1. Buscar a sessão para calcular o tempo real
  const { data: session, error: fetchError } = await supabase
    .from("study_history")
    .select("started_at, planned_minutes")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single()

  if (fetchError || !session) throw new Error("Sessão não encontrada")

  const finishedAt = new Date()
  const startedAt = new Date(session.started_at)
  const durationMinutes = Math.floor((finishedAt.getTime() - startedAt.getTime()) / 60000)

  // Opcional: Se for interrompida e tiver menos de 1 minuto, pode ser descartada ou salva como 0
  const isCompleted = feedback.interrupted ? false : (durationMinutes >= (session.planned_minutes || 0) * 0.9)

  const { data: updated, error: updateError } = await supabase
    .from("study_history")
    .update({
      finished_at: finishedAt.toISOString(),
      duration_minutes: durationMinutes,
      completed: isCompleted,
      interrupted: feedback.interrupted ?? false,
      energy_level: feedback.energy_level,
      difficulty: feedback.difficulty,
      focus_score: feedback.focus_score,
      mood: feedback.mood,
      notes: feedback.notes
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select()
    .single()

  if (updateError) throw new Error("Erro ao finalizar sessão: " + updateError.message)
  return updated
}

/**
 * Busca todo o histórico de um usuário
 */
export async function getUserHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
) {
  const { data, error } = await supabase
    .from("study_history")
    .select(`
      *,
      disciplines ( id, name, area )
    `)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error("Erro ao buscar histórico: " + error.message)
  return data
}

/**
 * Busca as últimas atividades finalizadas formatadas para o Dashboard.
 * Possui limite de itens parametrizável.
 */
export async function getRecentActivities(
  supabase: SupabaseClient,
  userId: string,
  limit = 5
) {
  const { data, error } = await supabase
    .from("study_history")
    .select(`
      id,
      duration_minutes,
      study_source,
      started_at,
      completed,
      disciplines ( name )
    `)
    .eq("user_id", userId)
    .not("duration_minutes", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map((item: any) => ({
    id: item.id,
    discipline_name: item.disciplines?.name || "Estudo Livre",
    duration_minutes: item.duration_minutes || 0,
    study_source: item.study_source || "FREE",
    started_at: item.started_at,
    completed: item.completed ?? false
  }))
}

