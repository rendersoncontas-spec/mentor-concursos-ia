"use server"

import { activeReviewItemsOnly } from "@/application/review-engine/review.repository"
import { createClient } from "@/infrastructure/supabase/server"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { isMaintenanceMode } from "@/lib/maintenance"
import { fetchAllPagesInParallel, type PageResult } from "@/lib/parallel-pagination"
import {
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
import { toStudySessions } from "./study-sessions-read"

// ─── Cache em memória (TTL 5 minutos) ──────────────────────────────────────
// Invalidação explícita via invalidateStatisticsCenterCache() após mutações,
// então 5 min de TTL não serve dado obsoleto em fluxo normal.

interface CacheEntry {
  at: number
  payload: StatisticsCenterPayload
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export interface StatisticsCenterPayload {
  sessions: SessionRecord[]
  /**
   * Tentativas de questões. `null` = a leitura FALHOU (Fase I.8). Antes, erro
   * virava `[]` e a página dizia "Sem questões registradas no período" — a mesma
   * tela de quem nunca respondeu questão nenhuma.
   */
  attempts: QuestionAttemptRecord[] | null
  /**
   * Disciplinas do aluno e o status de cada uma no edital. As duas saem da mesma
   * consulta, então falham juntas: `null` = a leitura falhou (Fase I.8); `[]` =
   * o banco respondeu e o aluno não tem disciplinas cadastradas.
   */
  disciplines: DisciplineMeta[] | null
  userDisciplines: UserDisciplineInput[] | null
  /**
   * Itens de revisão ativos. `null` = a leitura FALHOU (Fase I.6, achado M3):
   * antes, erro virava lista vazia e a página dizia "Sem revisões". Lista vazia
   * agora significa só uma coisa: o aluno não tem itens.
   */
  reviewItems: ReviewItemRow[] | null
  /** Revisões respondidas nos últimos 30 dias. `null` = a leitura falhou. */
  reviewsCompletedLast30: number | null
  activePlan: ActivePlan | null
  /**
   * `true` quando a leitura do plano falhou (Fase I.8). Sem isto, `activePlan:
   * null` significava ao mesmo tempo "não tem plano ativo" e "não deu para
   * consultar o plano", e a tela afirmava a primeira das duas.
   */
  activePlanError: boolean
  /**
   * Dia em que a semana começa, por preferência do aluno. `null` = a preferência
   * não pôde ser lida (Fase I.8) — diferente de "nunca configurou", que é o
   * domingo padrão do produto.
   */
  weekStartDay?: number | null
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

export async function invalidateStatisticsCenterCache(userId?: string): Promise<void> {
  if (userId) {
    cache.delete(userId)
  } else {
    cache.clear()
  }
}

/**
 * Plano de estudo ativo.
 *
 * Fase I.8: o retorno passou a ser `{ plan } | null`, com o `null` EXTERNO
 * significando "a consulta falhou". Antes as três leituras aqui dentro
 * descartavam o `error` e qualquer falha saía como `null`, indistinguível de
 * "este aluno não tem plano ativo" — e a tela afirmava justamente isso.
 *
 * As três contam como falha: sem `study_plans` não se sabe se há plano; sem
 * `study_plan_items` não dá para montar a grade; e sem `profiles` a meta semanal
 * cairia silenciosamente na soma dos blocos, exibindo um número diferente do que
 * o aluno configurou sob o rótulo "Meta semanal".
 */
async function fetchActivePlan(
  supabase: Supabase,
  userId: string,
): Promise<{ plan: ActivePlan | null } | null> {
  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .select("id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (planError) {
    console.error("[ESTATISTICAS] Erro ao carregar o plano ativo:", planError)
    return null
  }
  if (!plan) return { plan: null }

  const { data: items, error: itemsError } = await supabase
    .from("study_plan_items")
    .select("day_of_week, duration_minutes, discipline_id")
    .eq("study_plan_id", plan.id)

  if (itemsError) {
    console.error("[ESTATISTICAS] Erro ao carregar os blocos do plano:", itemsError)
    return null
  }

  const planItems = (items ?? [])
    .map((it) => ({
      dayOfWeek: Number(it.day_of_week) || 0,
      durationMinutes: Number(it.duration_minutes) || 0,
      disciplineId: it.discipline_id ?? null,
    }))
    .filter((it) => it.durationMinutes > 0)

  // Plano sem nenhum bloco com duração é, para esta tela, o mesmo que não ter
  // plano: não há grade para comparar com o realizado.
  if (planItems.length === 0) return { plan: null }

  // Busca as metas configuradas pelo usuário no perfil
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("weekly_study_hours, weekly_questions_goal, weekly_study_days_goal")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    console.error("[ESTATISTICAS] Erro ao carregar as metas do perfil:", profileError)
    return null
  }

  // Carga semanal em HORAS:
  // Se o usuário tem weekly_study_hours no perfil (ex: 25h), usamos esse valor exato.
  // Caso contrário, calculamos pela soma dos minutos dos blocos convertida para horas (ex: 1260m / 60 = 21h).
  const totalItemMinutes = planItems.reduce((acc, it) => acc + it.durationMinutes, 0)
  const calculatedHours = totalItemMinutes > 0 ? Math.round(totalItemMinutes / 60) : null
  const weeklyHours = (profile?.weekly_study_hours && profile.weekly_study_hours > 0)
    ? profile.weekly_study_hours
    : calculatedHours

  return {
    plan: {
      weeklyHours: weeklyHours && weeklyHours > 0 ? weeklyHours : null,
      weeklyQuestions: profile?.weekly_questions_goal ?? null,
      weeklyDays: profile?.weekly_study_days_goal ?? null,
      items: planItems,
    },
  }
}

// ─── Leituras do payload (Fase F: executadas em paralelo) ───────────────────
// O corpo de cada função é o bloco que antes ficava em sequência dentro de
// getStatisticsCenterAction, com o mesmo tratamento de erro.

const SESSION_SELECT = `
        id, discipline_id, started_at, finished_at, duration_minutes,
        active_minutes, paused_minutes, planned_minutes,
        completed, interrupted, energy_level, difficulty, focus_score,
        study_type, study_source, origin_source, notes, metadata,
        disciplines ( id, name, area )
      `

// 1. Sessões de estudo (a fonte primária de dados).
//    Carregamos TODAS as sessões do usuário (sem filtro de data) para
//    permitir o período "Tudo" nas Estatísticas — o filtro acontecerá no
//    cliente. Paginamos porque o PostgREST limita ~1000 linhas por
//    requisição; Fase F: páginas em paralelo após a primeira (que traz a
//    contagem) e "id" desempatando started_at iguais entre páginas.
//
//    Fase I.7: esta leitura devolve `null` quando a consulta FALHA, e nunca uma
//    lista. O motivo é mais forte do que o padrão geral de erro-não-é-zero: a
//    paginação devolve, junto com o erro, as páginas que já tinham chegado. Com
//    o comportamento anterior, uma falha na 3ª de 12 páginas produzia um
//    histórico PARCIAL que a página tratava como completo — total de horas,
//    sequência de dias, mapa de calor e horas por disciplina todos menores do
//    que a realidade, sem nenhum aviso. Lista vazia agora significa uma coisa
//    só: o banco respondeu e o aluno não tem sessões registradas.
async function loadSessions(supabase: Supabase, userId: string): Promise<SessionRecord[] | null> {
  try {
    const { data: rows, error } = await fetchAllPagesInParallel<Record<string, unknown>>(
      (from, to, withCount) =>
        supabase
          .from("study_history")
          .select(SESSION_SELECT, withCount ? { count: "exact" } : undefined)
          .eq("user_id", userId)
          .order("started_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<Record<string, unknown>>>,
      { pageSize: 1000, maxRows: SESSIONS_LIMIT, perfLabel: "study_history.estatisticas" },
    )
    if (error) console.error("[ESTATISTICAS] Erro ao carregar study_history:", error)
    // A decisão erro-não-é-lista mora em toStudySessions (regra única, testada
    // por comportamento): erro → null, inclusive descartando páginas parciais.
    return toStudySessions({ data: rows, error })
  } catch (err) {
    console.error("[ESTATISTICAS] Falha em study_history:", err)
    return null
  }
}

/**
 * 2. Tentativas de questões (disciplina vem do join com questions).
 *
 * Fase I.8: devolve `null` quando a leitura falha. Antes, o erro era registrado
 * no console e a função devolvia `[]` — a página mostrava "Sem questões
 * registradas no período" e a acurácia sumia, exatamente como para quem nunca
 * respondeu questão. `[]` agora significa só: o banco respondeu e não há
 * tentativa registrada.
 */
async function loadAttempts(
  supabase: Supabase,
  effectiveUserId: string,
): Promise<QuestionAttemptRecord[] | null> {
  let attempts: QuestionAttemptRecord[] | null = null
  try {
    // Fase F.1: `.limit(ATTEMPTS_LIMIT)` não passava de 1.000 (corte do
    // PostgREST). Agora paginado até o teto pretendido, mais recentes primeiro.
    const { data: rawAttempts, error: attemptsError } = await fetchAllRowsPaged<{
      id: string
      correct: boolean
      answered_at: string
      questions: { discipline_id: string | null } | { discipline_id: string | null }[] | null
    }>(
      (withCount) =>
        supabase
          .from("question_attempts")
          .select("id, correct, answered_at, questions ( discipline_id )", countOption(withCount))
          .eq("user_id", effectiveUserId),
      [
        { column: "answered_at", ascending: false },
        { column: "id", ascending: false },
      ],
      { maxRows: ATTEMPTS_LIMIT },
    )

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
  return attempts
}

/**
 * 3. Registro de disciplinas + user_disciplines (status do edital).
 *
 * Fase I.8: `null` quando a leitura falha — e as duas listas falham juntas
 * porque saem da mesma consulta. Antes, o erro devolvia duas listas vazias e a
 * cobertura do edital dizia "Adicione um concurso (edital)" a quem já tem
 * edital cadastrado.
 *
 * A falha NÃO derruba a página: os nomes de disciplina exibidos nas demais
 * seções vêm do join das próprias sessões, então só a seção que é sobre o
 * edital fica indisponível.
 */
async function loadDisciplines(
  supabase: Supabase,
  effectiveUserId: string,
): Promise<{ userDisciplines: UserDisciplineInput[]; disciplines: DisciplineMeta[] } | null> {
  let userDisciplines: UserDisciplineInput[] = []
  let disciplines: DisciplineMeta[] = []
  let lida = false
  try {
    // Concurso ativo e user_disciplines são independentes: saem juntos.
    const loadActiveTargetId = async (): Promise<string | null> => {
      try {
        const { data: activeTarget } = await supabase
          .from("user_targets")
          .select("id")
          .eq("user_id", effectiveUserId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
        return activeTarget?.id ?? null
      } catch {
        return null
      }
    }

    const [activeTargetId, { data: userDisciplineRows, error: udError }] = await Promise.all([
      loadActiveTargetId(),
      supabase
        .from("user_disciplines")
        .select("discipline_id, status, target_id, disciplines ( id, name, area )")
        .eq("user_id", effectiveUserId),
    ])

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
      lida = true
    } else {
      console.error("[ESTATISTICAS] Erro ao carregar user_disciplines:", udError)
    }
  } catch (err) {
    console.error("[ESTATISTICAS] Falha em user_disciplines:", err)
  }
  return lida ? { userDisciplines, disciplines } : null
}

async function loadReviewItems(
  supabase: Supabase,
  effectiveUserId: string,
): Promise<ReviewItemRow[] | null> {
  // 4. Itens de revisão (estágio da memória) e itens concluídos em 30 dias.
  //
  // Fase I.6 (M3): `null` quando a consulta não responde. Erro aqui não pode
  // virar "nenhum item de revisão" — é a mesma regra que a Fase I.5 aplicou na
  // página de Revisões, agora neste módulo, que é independente.
  let reviewItems: ReviewItemRow[] | null = null
  try {
    // Fase F.1: paginado (antes 1 requisição cortada em 1.000 linhas).
    //
    // Fase I.3: só itens ATIVOS, pela mesma regra da fila de Revisões
    // (activeReviewItemsOnly). Antes daqui a consulta trazia tudo, então um
    // tópico suspenso ou arquivado saía da fila de Revisões mas continuava
    // contando como "revisão pendente" nas Estatísticas — dois números
    // diferentes para a mesma pergunta. A regra vive num único lugar
    // (review.repository.ts); aqui ela é aplicada, não repetida.
    const { data: reviewRows, error: reviewError } = await fetchAllRowsPaged<{
      id: string
      discipline_id: string | null
      next_review_at: string | null
    }>(
      (withCount) =>
        activeReviewItemsOnly(
          supabase
            .from("review_items")
            .select("id, discipline_id, next_review_at", countOption(withCount))
            .eq("user_id", effectiveUserId),
        ),
      [{ column: "id", ascending: true }],
    )

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
  return reviewItems
}



/**
 * Revisões respondidas nos últimos 30 dias. `null` = a contagem falhou.
 *
 * Fase I.6 (M3): esta função nem conferia o `error` do PostgREST — qualquer falha
 * saía como `0` e a página exibia "Concluídas 30d: 0", indistinguível de um aluno
 * que realmente não revisou nada.
 */
async function loadReviewsCompletedLast30(
  supabase: Supabase,
  effectiveUserId: string,
): Promise<number | null> {
  const last30 = new Date()
  last30.setDate(last30.getDate() - 30)
  try {
    const { count, error } = await supabase
      .from("review_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", effectiveUserId)
      .gte("review_date", last30.toISOString())
    if (error) {
      console.error("[ESTATISTICAS] Erro ao contar revisões dos últimos 30 dias:", error)
      return null
    }
    return count ?? 0
  } catch (err) {
    console.error("[ESTATISTICAS] Falha ao contar revisões dos últimos 30 dias:", err)
    return null
  }
}

async function loadActivePlan(
  supabase: Supabase,
  effectiveUserId: string,
): Promise<{ plan: ActivePlan | null } | null> {
  // 5. Plano de estudo ativo. `null` externo = não foi possível consultar.
  try {
    return await fetchActivePlan(supabase, effectiveUserId)
  } catch (err) {
    console.error("[ESTATISTICAS] Falha no plano de estudo:", err)
    return null
  }
}

/**
 * Dia em que a semana começa, por preferência do aluno.
 *
 * Fase I.8: `null` quando a preferência não pôde ser CONSULTADA. A regra da
 * semana do produto não mudou — quem nunca configurou continua começando no
 * domingo (0). O que mudou é que esse mesmo 0 deixou de ser usado para
 * representar "a consulta falhou": são coisas diferentes, e a tela avisa quando
 * está exibindo o padrão por falta de leitura, não por escolha do aluno.
 */
async function loadWeekStartDay(
  supabase: Supabase,
  effectiveUserId: string,
): Promise<number | null> {
  let weekStartDay = 0
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("week_start_day, preferences")
      .eq("id", effectiveUserId)
      .maybeSingle()

    if (error) {
      console.error("[ESTATISTICAS] Erro ao carregar a preferência de início de semana:", error)
      return null
    }

    const prefs = profile?.preferences as Record<string, unknown> | null
    const firstDayPref = (prefs?.["firstDayOfWeek"] ?? prefs?.["primeiroDia"]) as string | undefined

    if (firstDayPref === "Segunda-feira") {
      weekStartDay = 1
    } else if (firstDayPref === "Domingo") {
      weekStartDay = 0
    } else if (typeof profile?.["week_start_day"] === "number") {
      weekStartDay = profile["week_start_day"]
    } else {
      weekStartDay = 0
    }
  } catch (err) {
    console.error("[ESTATISTICAS] Falha ao carregar perfil:", err)
    return null
  }
  return weekStartDay
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
    const effectiveUserId = await getEffectiveUserId(supabase)

    if (!effectiveUserId) {
      return { data: null, error: "Usuário não autenticado.", cached: false }
    }

    const cached = cache.get(effectiveUserId)
    const nowMs = Date.now()
    if (cached && nowMs - cached.at < TTL_MS) {
      return { data: cached.payload, error: null, cached: true }
    }

    // Fase F (performance): as 5 leituras abaixo são independentes entre si e
    // rodavam uma depois da outra (≈11 idas e voltas ao banco em fila: 3
    // páginas de sessões → tentativas → concurso ativo → disciplinas →
    // revisões → contagem de revisões → plano (2–3) → perfil). Agora saem
    // todas juntas. Cada bloco mantém exatamente o mesmo tratamento de erro de
    // antes (registra e segue com o valor padrão), então o payload é o mesmo.
    const [sessions, attempts, disciplineData, reviewItems, reviewsCompletedLast30, activePlan, weekStartDay] =
      await Promise.all([
        loadSessions(supabase, effectiveUserId),
        loadAttempts(supabase, effectiveUserId),
        loadDisciplines(supabase, effectiveUserId),
        loadReviewItems(supabase, effectiveUserId),
        loadReviewsCompletedLast30(supabase, effectiveUserId),
        loadActivePlan(supabase, effectiveUserId),
        loadWeekStartDay(supabase, effectiveUserId),
      ])
    // Fase I.8: as duas listas de disciplina saem da mesma consulta; `null`
    // externo é falha de leitura, e nesse caso as duas ficam indisponíveis.
    const userDisciplines = disciplineData?.userDisciplines ?? null
    const disciplines = disciplineData?.disciplines ?? null

    // Fase I.7: as sessões de estudo são a fonte primária da página inteira —
    // horas, sequência, disciplinas, evolução e prioridades saem daí. Se essa
    // leitura falhou, não existe página de estatísticas verdadeira para montar:
    // devolvemos erro (a tela já tem o estado "Não foi possível carregar suas
    // estatísticas" com botão de tentar novamente) em vez de uma página cheia de
    // números menores do que a realidade. E, principalmente, NÃO gravamos no
    // cache: um payload de falha ficaria servido por 5 minutos.
    if (sessions === null) {
      return {
        data: null,
        error: "Não foi possível carregar seu histórico de estudos. Tente novamente.",
        cached: false,
      }
    }

    const payload: StatisticsCenterPayload = {
      sessions,
      attempts,
      disciplines,
      userDisciplines,
      reviewItems,
      reviewsCompletedLast30,
      activePlan: activePlan?.plan ?? null,
      activePlanError: activePlan === null,
      weekStartDay,
    }

    // Fase I.8: o cache guarda snapshot ÍNTEGRO, nunca degradado. Um payload em
    // que alguma leitura falhou é entregue ao aluno com os estados de erro
    // corretos, mas não é gravado: se ficasse no cache, o "Tentar novamente"
    // devolveria a mesma falha por 5 minutos, mesmo com o banco já respondendo.
    const integro =
      payload.attempts !== null &&
      payload.disciplines !== null &&
      payload.userDisciplines !== null &&
      payload.reviewItems !== null &&
      payload.reviewsCompletedLast30 !== null &&
      !payload.activePlanError &&
      payload.weekStartDay !== null

    if (integro) cache.set(effectiveUserId, { at: nowMs, payload })
    return { data: payload, error: null, cached: false }
  } catch (error) {
    return { data: null, error: (error as { message?: string })?.message ?? "Erro inesperado.", cached: false }
  }
}