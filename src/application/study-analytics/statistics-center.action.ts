"use server"

import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import {
  sanitizeSession,
  sanitizeAttempt,
  sanitizeDisciplineMeta,
  sanitizeUserDiscipline,
  sanitizeReviewItem,
  type SessionRecord,
  type QuestionAttemptRecord,
  type DisciplineMeta,
  type UserDisciplineInput,
  type ReviewItemRow,
  type ActivePlan,
} from "./engine/stats-engine"

// ─── Cache em memória (TTL 5 minutos) ──────────────────────────────────────

interface CacheEntry {
  at: number
  payload: StatisticsCenterPayload
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export interface StatisticsCenterPayload {
  sessions: SessionRecord[]
  attempts: QuestionAttemptRecord[]
  disciplines: DisciplineMeta[]
  userDisciplines: UserDisciplineInput[]
  reviewItems: ReviewItemRow[]
  reviewsCompletedLast30: number
  activePlan: ActivePlan | null
}

// Limite de segurança: 50.000 sessões carregadas por usuário (muito acima do
// uso normal; evita que alguém com volumes astronômicos prejudique o servidor).
const SESSIONS_LIMIT = 50_000
// Tentativas de questões: limitamos às mais recentes para manter o payload
// enxuto; a acurácia reflete a janela carregada (documentado na coleção).
const ATTEMPTS_LIMIT = 50000

type Supabase = Awaited<ReturnType<typeof createClient>>

interface UserDisciplineRow {
  discipline_id: string | null
  status: string | null
  target_id?: string | null
  disciplines?: { id: string; name: string; area: string | null } | { id: string; name: string; area: string | null }[] | null
}

// Prioridade de linha: concurso ativo > linha sem concurso (target NULL) > outros.
function rankUserDisciplineRow(row: UserDisciplineRow, activeTargetId: string | null): number {
  const tid = row.target_id ?? null
  if (activeTargetId && tid === activeTargetId) return 2
  if (tid === null) return 1
  return 0
}

// Uma disciplina por usuário no payload: ordena com o concurso ativo em primeiro
// lugar e mantém apenas a primeira ocorrência de cada discipline_id.
function dedupeUserDisciplines(rows: UserDisciplineRow[], activeTargetId: string | null): UserDisciplineRow[] {
  const sorted = activeTargetId
    ? [...rows].sort((a, b) => rankUserDisciplineRow(b, activeTargetId) - rankUserDisciplineRow(a, activeTargetId))
    : [...rows]
  const seen = new Set<string>()
  return sorted.filter((r) => {
    if (!r.discipline_id || seen.has(r.discipline_id)) return false
    seen.add(r.discipline_id)
    return true
  })
}

async function fetchActivePlan(supabase: Supabase, userId: string): Promise<ActivePlan | null> {
  const { data: plan } = await supabase
    .from("study_plans")
    .select("id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!plan) return null

  const { data: items } = await supabase
    .from("study_plan_items")
    .select("day_of_week, duration_minutes, discipline_id")
    .eq("study_plan_id", plan.id)

  const planItems = (items ?? [])
    .map((it) => ({
      dayOfWeek: Number(it.day_of_week) || 0,
      durationMinutes: Number(it.duration_minutes) || 0,
      disciplineId: it.discipline_id ?? null,
    }))
    .filter((it) => it.durationMinutes > 0)

  if (planItems.length === 0) return null

  // Carga semanal = soma da duração dos itens do plano (colunas reais de study_plans
  // não possuem metas; as metas semanais do perfil ficam em profiles).
  const weeklyHours = planItems.reduce((acc, it) => acc + it.durationMinutes, 0)

  return {
    weeklyHours: weeklyHours > 0 ? weeklyHours : null,
    weeklyQuestions: null,
    weeklyDays: null,
    items: planItems,
  }
}

export async function getStatisticsCenterAction(): Promise<{
  data: StatisticsCenterPayload | null
  error: string | null
  cached: boolean
}> {
  if (isMaintenanceMode()) {
    return { data: null, error: "Sistema temporariamente indisponível.", cached: false }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: "Usuário não autenticado.", cached: false }
    }

    const cached = cache.get(user.id)
    const nowMs = Date.now()
    if (cached && nowMs - cached.at < TTL_MS) {
      return { data: cached.payload, error: null, cached: true }
    }

    // 1. Sessões de estudo (a fonte primária de dados).
    //    Carregamos TODAS as sessões do usuário (sem filtro de data) para
    //    permitir o período "Tudo" nas Estatísticas — o filtro acontecerá no
    //    cliente. Paginamos porque o PostgREST limita ~1000 linhas por
    //    requisição.
    let sessions: SessionRecord[] = []
    const SESSION_SELECT = `
        id, discipline_id, started_at, finished_at, duration_minutes,
        active_minutes, paused_minutes, planned_minutes,
        completed, interrupted, energy_level, difficulty, focus_score,
        study_type, study_source, origin_source, notes, metadata,
        disciplines ( id, name, area )
      `
    try {
      const PAGE = 1000
      let offset = 0
      let fetched = 0
      let totalLoaded = 0
      while (totalLoaded < SESSIONS_LIMIT) {
        const { data: pageData, error: pageError } = await supabase
          .from("study_history")
          .select(SESSION_SELECT)
          .eq("user_id", user.id)
          .order("started_at", { ascending: true })
          .range(offset, offset + PAGE - 1)

        if (pageError) {
          console.error("[ESTATISTICAS] Erro ao carregar study_history:", pageError)
          break
        }
        if (!pageData || pageData.length === 0) break

        const pageSessions = (pageData as Record<string, unknown>[])
          .map((row) => {
            const disc = Array.isArray(row["disciplines"]) ? row["disciplines"][0] : row["disciplines"]
            return sanitizeSession({
              id: row["id"] as string,
              discipline_id: (row["discipline_id"] as string) ?? null,
              discipline_name: (disc as { name?: string } | null)?.name ?? null,
              discipline_area: (disc as { area?: string | null } | null)?.area ?? null,
              started_at: row["started_at"] as string,
              finished_at: (row["finished_at"] as string | null) ?? null,
              duration_minutes: row["duration_minutes"] as number | null,
              active_minutes: row["active_minutes"] as number | null,
              paused_minutes: row["paused_minutes"] as number | null,
              planned_minutes: row["planned_minutes"] as number | null,
              completed: row["completed"] as boolean,
              interrupted: row["interrupted"] as boolean,
              energy_level: (row["energy_level"] as number | null) ?? null,
              difficulty: (row["difficulty"] as number | null) ?? null,
              focus_score: (row["focus_score"] as number | null) ?? null,
              study_type: (row["study_type"] as string | null) ?? null,
              study_source: (row["study_source"] as string | null) ?? null,
              notes: (row["notes"] as string | null) ?? null,
              metadata: (row["metadata"] as Record<string, unknown>) ?? {},
              pages_read: (row["metadata"] as Record<string, unknown> | null)?.["pages_read"],
              questions_answered: (row["metadata"] as Record<string, unknown> | null)?.["questions_answered"],
              questions_correct: (row["metadata"] as Record<string, unknown> | null)?.["questions_correct"],
              flashcards_reviewed: (row["metadata"] as Record<string, unknown> | null)?.["flashcards_reviewed"],
              topic_name: (row["metadata"] as Record<string, unknown> | null)?.["topic_name"],
              focus_percentage: (row["metadata"] as Record<string, unknown> | null)?.["focus_percentage"],
            }, !!row["origin_source"])
          })
          .filter((s): s is SessionRecord => s !== null)

        sessions.push(...pageSessions)
        totalLoaded += pageData.length
        if (pageData.length < PAGE) break
        offset += PAGE
        fetched++
        if (fetched > 100) break // safety: max 100 pages = 100k rows
      }
    } catch (err) {
      console.error("[ESTATISTICAS] Falha em study_history:", err)
    }

    // 2. Tentativas de questões (disciplina vem do join com questions).
    let attempts: QuestionAttemptRecord[] = []
    try {
      const { data: rawAttempts, error: attemptsError } = await supabase
        .from("question_attempts")
        .select("id, correct, answered_at, questions ( discipline_id )")
        .eq("user_id", user.id)
        .order("answered_at", { ascending: false })
        .limit(ATTEMPTS_LIMIT)

      if (!attemptsError) {
        attempts = (rawAttempts ?? [])
          .map((row) => {
            const q = Array.isArray(row.questions) ? row.questions[0] : row.questions
            return sanitizeAttempt({
              id: row.id,
              question_id: (row as { question_id?: string | null }).question_id ?? null,
              discipline_id: q?.discipline_id ?? null,
              correct: row.correct,
              answered_at: row.answered_at,
            })
          })
          .filter((a): a is QuestionAttemptRecord => a !== null)
      } else {
        console.error("[ESTATISTICAS] Erro ao carregar question_attempts:", attemptsError)
      }
    } catch (err) {
      console.error("[ESTATISTICAS] Falha em question_attempts:", err)
    }

    // 3. Registro de disciplinas + user_disciplines (status do edital).
    //    A mesma disciplina pode existir legitimamente em vários concursos
    //    (UNIQUE user_id,target_id,discipline_id). O "Progresso no edital" mostra
    //    UMA linha por disciplina: priorizamos a linha do concurso ativo e
    //    eliminamos duplicatas por discipline_id antes de montar o payload.
    let userDisciplines: UserDisciplineInput[] = []
    let disciplines: DisciplineMeta[] = []
    try {
      let activeTargetId: string | null = null
      try {
        const { data: activeTarget } = await supabase
          .from("user_targets")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
        activeTargetId = activeTarget?.id ?? null
      } catch {
        activeTargetId = null
      }

      const { data: userDisciplineRows, error: udError } = await supabase
        .from("user_disciplines")
        .select("discipline_id, status, target_id, disciplines ( id, name, area )")
        .eq("user_id", user.id)

      if (!udError) {
        const rows = dedupeUserDisciplines(userDisciplineRows ?? [], activeTargetId)
        userDisciplines = rows
          .map((row) => sanitizeUserDiscipline({ discipline_id: row.discipline_id, status: row.status }))
          .filter((u): u is UserDisciplineInput => u !== null)

        disciplines = rows
          .map((row) => {
            const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
            return sanitizeDisciplineMeta({
              id: disc?.id ?? row.discipline_id,
              name: disc?.name,
              area: disc?.area,
            })
          })
          .filter((d): d is DisciplineMeta => d !== null)
      } else {
        console.error("[ESTATISTICAS] Erro ao carregar user_disciplines:", udError)
      }
    } catch (err) {
      console.error("[ESTATISTICAS] Falha em user_disciplines:", err)
    }

    // 4. Itens de revisão (estágio da memória) e itens concluídos em 30 dias.
    let reviewItems: ReviewItemRow[] = []
    try {
      const { data: reviewRows, error: reviewError } = await supabase
        .from("review_items")
        .select("id, discipline_id, next_review_at")
        .eq("user_id", user.id)

      if (!reviewError) {
        reviewItems = (reviewRows ?? [])
          .map((row) =>
            sanitizeReviewItem({
              id: row.id,
              discipline_id: row.discipline_id,
              next_review_at: row.next_review_at,
            })
          )
          .filter((r): r is ReviewItemRow => r !== null)
      } else {
        console.error("[ESTATISTICAS] Erro ao carregar review_items:", reviewError)
      }
    } catch (err) {
      console.error("[ESTATISTICAS] Falha em review_items:", err)
    }

    const last30 = new Date()
    last30.setDate(last30.getDate() - 30)
    let reviewsCompletedLast30 = 0
    try {
      const { count } = await supabase
        .from("review_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("review_date", last30.toISOString())
      reviewsCompletedLast30 = count ?? 0
    } catch {
      reviewsCompletedLast30 = 0
    }

    // 5. Plano de estudo ativo.
    let activePlan: ActivePlan | null = null
    try {
      activePlan = await fetchActivePlan(supabase, user.id)
    } catch (err) {
      console.error("[ESTATISTICAS] Falha no plano de estudo:", err)
    }

    const payload: StatisticsCenterPayload = {
      sessions,
      attempts,
      disciplines,
      userDisciplines,
      reviewItems,
      reviewsCompletedLast30,
      activePlan,
    }

    cache.set(user.id, { at: nowMs, payload })
    return { data: payload, error: null, cached: false }
  } catch (error) {
    return { data: null, error: (error as { message?: string })?.message ?? "Erro inesperado.", cached: false }
  }
}