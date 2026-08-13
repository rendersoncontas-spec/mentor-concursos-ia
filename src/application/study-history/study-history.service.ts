import type { SupabaseClient } from "@supabase/supabase-js"
import type { StudyHistoryInsert } from "@/domain/study-history/study-history.types";

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
 * Atualiza uma sessão de estudo existente.
 */
export async function updateStudySession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  data: Partial<StudyHistoryInsert>
) {
  // Build update object from allowed fields
  const updateData: Record<string, unknown> = {}
  const allowedFields = [
    'discipline_id',
    'study_plan_item_id',
    'study_source',
    'study_type',
    'technique',
    'started_at',
    'finished_at',
    'duration_minutes',
    'active_minutes',
    'paused_minutes',
    'planned_minutes',
    'completed',
    'interrupted',
    'energy_level',
    'difficulty',
    'focus_score',
    'mood',
    'notes',
    'metadata'
  ] as const

  for (const key of allowedFields) {
    if (data[key as keyof StudyHistoryInsert] !== undefined) {
      updateData[key] = data[key as keyof StudyHistoryInsert]
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("Nenhum campo para atualizar")
  }

  const { data: updated, error } = await supabase
    .from("study_history")
    .update(updateData)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select()
    .single()

  if (error) throw new Error("Erro ao atualizar sessão: " + error.message)
  return updated
}

/**
 * Remove uma sessão de estudo.
 */
export async function deleteStudySession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
) {
  const { error } = await supabase
    .from("study_history")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId)

  if (error) throw new Error("Erro ao excluir sessão: " + error.message)
}

/**
 * Busca o histórico de um usuário com paginação.
 * Retorna os registros da página solicitada + contagem total real.
 */
export async function getUserHistory(
  supabase: SupabaseClient,
  userId: string,
  options: { page: number; pageSize: number } = { page: 1, pageSize: 50 },
) {
  const { page, pageSize } = options
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from("study_history")
    .select(
      `
      *,
      disciplines ( id, name, area )
    `,
      { count: "exact" },
    )
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .range(from, to)

  if (error) throw new Error("Erro ao buscar histórico: " + error.message)
  return { data: data ?? [], total: count ?? 0 }
}

/**
 * Pagina todos os registros de uma query do Supabase que ultrapassam o
 * limite do PostgREST (geralmente 1000 linhas). Usa múltiplas requisições
 * com .range() para buscar tudo.
 */
async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  filters: { column: string; op: "eq" | "not.is"; value: unknown }[],
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + pageSize - 1)
    for (const f of filters) {
      if (f.op === "eq") query = query.eq(f.column, f.value)
      else if (f.op === "not.is") query = query.not(f.column, "is", f.value)
    }
    const { data, error } = await query
    if (error) break
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

/**
 * Busca a soma total de duration_minutes de TODAS as sessões do usuário.
 * Pagina a query porque o PostgREST limita o número de linhas retornadas
 * por requisição (geralmente 1000).
 */
export async function getTotalStudyMinutes(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const rows = await fetchAllRows<{ duration_minutes: number | null }>(
    supabase,
    "study_history",
    "duration_minutes",
    [
      { column: "user_id", op: "eq", value: userId },
      { column: "duration_minutes", op: "not.is", value: null },
    ],
  )
  return rows.reduce((acc, row) => acc + (Number(row.duration_minutes) || 0), 0)
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

  return data.map((item) => {
    const disc = Array.isArray(item.disciplines) ? item.disciplines[0] : item.disciplines
    return {
    id: item.id,
    discipline_name: disc?.name || "Estudo Livre",
    duration_minutes: item.duration_minutes || 0,
    study_source: item.study_source || "FREE",
    started_at: item.started_at,
    completed: item.completed ?? false
  }})
}

/**
 * Busca todas as sessões de um usuário em um determinado mês e ano.
 * Realiza paginação automática para ultrapassar limites do PostgREST e garantir que
 * todas as sessões daquele mês sejam carregadas.
 * O agrupamento leva em consideração o timezone "America/Sao_Paulo".
 */
export async function getMonthlyHistory(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month: number // 1 a 12
) {
  // Construir as datas de início e fim do mês usando offset -03:00 (Brasília padrão)
  const paddedMonth = String(month).padStart(2, '0')
  const startStr = `${year}-${paddedMonth}-01T00:00:00.000-03:00`
  
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const paddedNextMonth = String(nextMonth).padStart(2, '0')
  const nextMonthStartStr = `${nextYear}-${paddedNextMonth}-01T00:00:00.000-03:00`

  const allSessions: any[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("study_history")
      .select(`
        *,
        disciplines ( id, name, area )
      `)
      .eq("user_id", userId)
      .gte("started_at", startStr)
      .lt("started_at", nextMonthStartStr)
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error("Erro ao buscar histórico mensal: " + error.message)
    if (!data || data.length === 0) break
    
    allSessions.push(...data)
    
    if (data.length < pageSize) break
    offset += pageSize
  }

  return allSessions
}
