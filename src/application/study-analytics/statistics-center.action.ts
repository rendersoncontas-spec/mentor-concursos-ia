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

// Quantos dias de histórico o fetch considera (27 meses ≈ janelas do mês).
const HISTORY_DAYS = 830
// Tentativas de questões: limitamos às mais recentes para manter o payload
// enxuto; a acurácia reflete a janela carregada (documentado na coleção).
const ATTEMPTS_LIMIT = 50000

type Supabase = Awaited<ReturnType<typeof createClient>>

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

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - HISTORY_DAYS)

    // 1. Sessões de estudo (a fonte primária de dados).
    //    Colunas reais de study_history: discipline_id (FK), started_at, duration_minutes,
    //    active_minutes, paused_minutes, planned_minutes, completed, interrupted,
    //    energy_level, difficulty, focus_score, study_type, study_source, notes, metadata.
    //    Questões/páginas/foco/tópico vivem no JSON metadata (mesma fonte do Histórico).
    let sessions: SessionRecord[] = []
    const { data: historyRows, error: historyError } = await supabase
      .from("study_history")
      .select(
        `
        id, discipline_id, started_at, finished_at, duration_minutes,
        active_minutes, paused_minutes, planned_minutes,
        completed, interrupted, energy_level, difficulty, focus_score,
        study_type, study_source, notes, metadata,
        disciplines ( id, name, area )
      `
      )
      .eq("user_id", user.id)
      .gte("started_at", cutoff.toISOString())
      .order("started_at", { ascending: true })
      .limit(6000)

    if (historyError) {
      console.error("[ESTATISTICAS] Erro ao carregar study_history:", historyError)
    } else {
      sessions = (historyRows ?? [])
        .map((row) => {
          const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
          return sanitizeSession({
            id: row.id,
            discipline_id: row.discipline_id ?? null,
            discipline_name: disc?.name ?? null,
            discipline_area: disc?.area ?? null,
            started_at: row.started_at,
            finished_at: row.finished_at,
            duration_minutes: row.duration_minutes,
            active_minutes: row.active_minutes,
            paused_minutes: row.paused_minutes,
            planned_minutes: row.planned_minutes,
            completed: row.completed,
            interrupted: row.interrupted,
            energy_level: row.energy_level,
            difficulty: row.difficulty,
            focus_score: row.focus_score,
            study_type: row.study_type,
            study_source: row.study_source,
            notes: row.notes,
            metadata: row.metadata ?? {},
            pages_read: row.metadata?.pages_read,
            questions_answered: row.metadata?.questions_answered,
            questions_correct: row.metadata?.questions_correct,
            flashcards_reviewed: row.metadata?.flashcards_reviewed,
            topic_name: row.metadata?.topic_name,
            focus_percentage: row.metadata?.focus_percentage,
          })
        })
        .filter((s): s is SessionRecord => s !== null)
    }

    // 2. Tentativas de questões (disciplina vem do join com questions).
    let attempts: QuestionAttemptRecord[] = []
    try {
      const { data: rawAttempts, error: attemptsError } = await supabase
        .from("question_attempts")
        .select("id, correct, answered_at, questions ( discipline_id )")
        .eq("user_id", user.id)
        .gte("answered_at", cutoff.toISOString())
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
    let userDisciplines: UserDisciplineInput[] = []
    let disciplines: DisciplineMeta[] = []
    try {
      const { data: userDisciplineRows, error: udError } = await supabase
        .from("user_disciplines")
        .select("discipline_id, status, disciplines ( id, name, area )")
        .eq("user_id", user.id)

      if (!udError) {
        userDisciplines = (userDisciplineRows ?? [])
          .map((row) => sanitizeUserDiscipline({ discipline_id: row.discipline_id, status: row.status }))
          .filter((u): u is UserDisciplineInput => u !== null)

        disciplines = (userDisciplineRows ?? [])
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