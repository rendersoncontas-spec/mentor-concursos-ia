"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import {
  averageAccuracy,
  buildComparison,
  buildDistribution,
  computeByDiscipline,
  computeByTopic,
  computePersonalBests,
  computeResultTotals,
  correctAnswers,
  analyzeResult,
  difficultyLabelOf,
  isCertoErradoQuestion,
  pickQuestionPool,
  seededShuffle,
  type CorrectedQuestion,
  type QuestionPoolItem,
  type RawAnswer,
  type RawQuestion,
} from "./simulado-engine"
import type {
  PlayerQuestion,
  ScoreBand,
  SimuladoConfigData,
  SimuladoConfigInput,
  SimuladoHeader,
  SimuladoPreview,
  SimuladoResultPayload,
  SimuladoMode,
  SimuladoStatus,
  DifficultyFilter,
  SimuladoAlternative,
} from "@/domain/simulados/types"

type Supabase = Awaited<ReturnType<typeof createClient>>

const MAX_TOTAL = 200

interface SimuladoRow {
  id: string
  name: string | null
  exam_name: string | null
  role_name: string | null
  exam_board: string | null
  mode: SimuladoMode | null
  status: SimuladoStatus | null
  simulado_date: string | null
  started_at: string | null
  finished_at: string | null
  time_spent_seconds: number | null
  duration_limit_seconds: number | null
  total_questions: number | null
  total_correct: number | null
  total_wrong: number | null
  total_blank: number | null
  score: ScoreBand | null
  avg_time_per_question_seconds: number | null
  difficulty_filter: DifficultyFilter | null
}

interface EligibleStatementRow {
  id: string
  discipline_id: string | null
  topic_id: string | null
  difficulty_level: number | null
  statement: string
  correct_answer: string | null
  alternatives: SimuladoAlternative[] | null
  explanation: string | null
}

function previewMessage(itemsLength: number, inputTotal: number, minNeeded: number): string {
  if (itemsLength < inputTotal) {
    return `Apenas ${itemsLength} questão(ões) disponível(is) com esses filtros (solicitadas: ${inputTotal}). Ajuste quantidade, disciplinas ou filtros.`
  }
  if (minNeeded < inputTotal) {
    return `Distribuição suportada: ${minNeeded} questão(ões) garantidas pelas disciplinas escolhidas.`
  }
  return "Disponível para criar."
}

function modeDefaultName(mode: SimuladoConfigInput["mode"]): string {
  const names: Record<string, string> = {
    COMPLETO: "Simulado Completo",
    DISCIPLINA: "Simulado por Disciplina",
    MATERIA: "Simulado por Matéria",
    TOPICO: "Simulado por Tópico",
    REVISAO: "Simulado de Revisão",
    ERROS: "Rever meus Erros",
    PERSONALIZADO: "Simulado Personalizado",
    RAPIDO: "Simulado Rápido",
    DESAFIO: "Desafio Relâmpago",
    ADAPTATIVO: "Simulado Adaptativo",
  }
  const d = new Date()
  return `${names[mode] ?? "Simulado"} - ${d.toLocaleDateString("pt-BR")}`
}

function toHeader(row: SimuladoRow): SimuladoHeader {
  const total = Number(row.total_questions ?? 0)
  const correct = Number(row.total_correct ?? 0)
  const answered = Number(row.total_correct ?? 0) + Number(row.total_wrong ?? 0)
  return {
    id: row.id,
    name: row.name ?? "Simulado",
    examName: row.exam_name ?? null,
    roleName: row.role_name ?? null,
    examBoard: row.exam_board ?? null,
    mode: row.mode ?? "PERSONALIZADO",
    status: row.status ?? "CONFIG",
    simuladoDate: row.simulado_date ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    timeSpentSeconds: row.time_spent_seconds === null || row.time_spent_seconds === undefined ? null : Number(row.time_spent_seconds),
    durationLimitSeconds: row.duration_limit_seconds === null || row.duration_limit_seconds === undefined ? null : Number(row.duration_limit_seconds),
    totalQuestions: total,
    totalCorrect: correct,
    totalWrong: Number(row.total_wrong ?? 0),
    totalBlank: Number(row.total_blank ?? 0),
    accuracy: answered > 0 ? (correct / answered) * 100 : null,
    score: row.score ?? null,
    avgTimePerQuestionSeconds: row.avg_time_per_question_seconds === null || row.avg_time_per_question_seconds === undefined ? null : Number(row.avg_time_per_question_seconds),
    difficulty: row.difficulty_filter ?? null,
  }
}

async function requireUser(supabase: Supabase): Promise<{ user: { id: string } } | { user: null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null }
  return { user: { id: user.id } }
}

// ─── Busca elegível (pool) sem seleção ──────────────────────────────────────

async function fetchLastAttemptMap(supabase: Supabase, userId: string): Promise<Map<string, boolean>> {
  const { data } = await supabase
    .from("question_attempts")
    .select("question_id, correct")
    .eq("user_id", userId)
    .order("answered_at", { ascending: false })
    .limit(50000)
  const map = new Map<string, boolean>()
  ;(data ?? []).forEach((a) => {
    if (!map.has(a.question_id)) map.set(a.question_id, a.correct === true)
  })
  return map
}

export interface EligibleQuery {
  disciplineIds: string[]
  topicIds: string[]
  difficulty: SimuladoConfigInput["difficulty"]
  onlyWrong: boolean
  wrongQuestionIds: Set<string>
}

async function fetchEligible(
  supabase: Supabase,
  userId: string,
  q: EligibleQuery
): Promise<{ items: QuestionPoolItem[]; levels: (number | null)[] }> {
  const lastAttempt = await fetchLastAttemptMap(supabase, userId)
  const wrongIds = new Set([...lastAttempt.entries()].filter(([, ok]) => !ok).map(([id]) => id))
  const effective = q.onlyWrong ? wrongIds : q.wrongQuestionIds

  let query = supabase
    .from("questions")
    .select("id, discipline_id, topic_id, difficulty_level")
    .eq("question_status", "ACTIVE")

  if (q.disciplineIds.length > 0) query = query.in("discipline_id", q.disciplineIds)
  if (q.topicIds.length > 0) query = query.in("topic_id", q.topicIds)
  if (q.difficulty === "FACIL") query = query.lte("difficulty_level", 2)
  else if (q.difficulty === "DIFICIL") query = query.gte("difficulty_level", 4)

  const { data: rows } = await query.limit(20000)
  let items: QuestionPoolItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    disciplineId: r.discipline_id ?? null,
    topicId: r.topic_id ?? null,
    difficultyLevel: r.difficulty_level === null || r.difficulty_level === undefined ? null : Number(r.difficulty_level),
  }))

  if (q.difficulty === "MEDIA") {
    items = items.filter((i) => i.difficultyLevel !== null && i.difficultyLevel >= 3 && i.difficultyLevel <= 3)
  }
  if (q.onlyWrong) items = items.filter((i) => effective.has(i.id))

  const levels = items.map((i) => i.difficultyLevel)
  return { items, levels }
}

// ─── Configurações para a tela de criação ───────────────────────────────────

export async function getSimuladorConfigAction(): Promise<{
  data: SimuladoConfigData | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Usuário não autenticado." }

    const [{ data: targets }, { data: userDiscs }, { data: topics }, { data: allQuestions }] =
      await Promise.all([
        supabase.from("user_targets").select("id, target_exam, target_role, is_active").eq("user_id", user.id).order("is_active", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("user_disciplines").select("discipline_id, disciplines ( id, name, area )").eq("user_id", user.id),
        supabase.from("question_topics").select("id, discipline_id, name").order("name"),
        supabase.from("questions").select("discipline_id, difficulty_level").eq("question_status", "ACTIVE"),
      ])

    const countByDiscipline = new Map<string, number>()
    const levels: (number | null)[] = []
    ;(allQuestions ?? []).forEach((q) => {
      if (q.discipline_id) countByDiscipline.set(q.discipline_id, (countByDiscipline.get(q.discipline_id) ?? 0) + 1)
      levels.push(q.difficulty_level === null || q.difficulty_level === undefined ? null : Number(q.difficulty_level))
    })

    const disciplines = (userDiscs ?? []).map((r) => {
      const disc = Array.isArray(r.disciplines) ? r.disciplines[0] : r.disciplines
      return {
        id: disc?.id ?? r.discipline_id,
        name: disc?.name ?? "Disciplina",
        area: disc?.area ?? null,
        availableCount: countByDiscipline.get(disc?.id ?? r.discipline_id) ?? 0,
        studied: true,
      }
    })
    disciplines.sort((a, b) => a.name.localeCompare(b.name))

    const { data: attempts } = await supabase
      .from("question_attempts")
      .select("question_id, correct")
      .eq("user_id", user.id)
      .limit(50000)
    const lastMap = new Map<string, boolean>()
    ;(attempts ?? []).forEach((a) => {
      if (!lastMap.has(a.question_id)) lastMap.set(a.question_id, a.correct === true)
    })
    const wrongCount = [...lastMap.values()].filter((ok) => !ok).length

    return {
      data: {
        hasQuestions: (allQuestions ?? []).length > 0,
        concursos: (targets ?? []).map((t) => ({
          id: t.id,
          targetExam: t.target_exam ?? "Concurso",
          targetRole: t.target_role ?? null,
          isActive: t.is_active === true,
        })),
        disciplines,
        topics: (topics ?? []).map((t) => ({ id: t.id, disciplineId: t.discipline_id ?? "", name: t.name ?? "" })),
        wrongQuestionCount: wrongCount,
        hasDifficultyData: levels.filter((l) => l !== null).length >= 10 && new Set(levels.filter((l) => l !== null)).size >= 2,
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar configuração." }
  }
}

// ─── Preview de disponibilidade (valida antes de criar) ─────────────────────

export async function previewSimuladoAction(
  input: SimuladoConfigInput
): Promise<{ data: SimuladoPreview | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Usuário não autenticado." }

    const distribution = buildDistribution(input.total, input.disciplineIds, input.distribution)
    if (!distribution.ok) return { data: null, error: distribution.error }

    const { items } = await fetchEligible(supabase, user.id, {
      disciplineIds: input.disciplineIds,
      topicIds: input.topicIds,
      difficulty: input.difficulty,
      onlyWrong: input.onlyWrong,
      wrongQuestionIds: new Set(),
    })

    const byDiscipline: Record<string, number> = {}
    items.forEach((i) => {
      const key = i.disciplineId ?? "SEM_DISCIPLINA"
      byDiscipline[key] = (byDiscipline[key] ?? 0) + 1
    })

    const totalDisciplinas = Object.keys(distribution.counts).length
    const minNeeded = totalDisciplinas > 0 ? Object.entries(distribution.counts).reduce((acc, [d, n]) => acc + Math.min(n, byDiscipline[d] ?? 0), 0) : 0

    return {
      data: {
        ok: items.length >= input.total,
        available: items.length,
        byDiscipline,
        wrongOnlyAvailable: -1,
        hasDifficultyData: true,
        message: previewMessage(items.length, input.total, minNeeded),
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao verificar disponibilidade." }
  }
}

// ─── Criar e iniciar ────────────────────────────────────────────────────────

export async function createSimuladoAction(input: SimuladoConfigInput): Promise<{
  data: { simuladoId: string; questions: PlayerQuestion[]; hasDifficultyData: boolean } | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Usuário não autenticado." }

    const total = Math.max(1, Math.min(MAX_TOTAL, Math.floor(Number(input.total) || 0)))
    const distribution = buildDistribution(total, input.disciplineIds, input.distribution)
    if (!distribution.ok) return { data: null, error: distribution.error }

    const lastAttempt = await fetchLastAttemptMap(supabase, user.id)
    const wrongIds = new Set([...lastAttempt.entries()].filter(([, ok]) => !ok).map(([id]) => id))

    const { rows: questionRows, levels } = await fetchEligibleWithStatements(supabase, user.id, {
      disciplineIds: input.disciplineIds,
      topicIds: input.topicIds,
      difficulty: input.difficulty,
      onlyWrong: input.onlyWrong,
      wrongQuestionIds: input.prioritizeWrong ? wrongIds : new Set(),
    })

    const pool: QuestionPoolItem[] = questionRows.map((r) => ({
      id: r.id,
      disciplineId: r.discipline_id ?? null,
      topicId: r.topic_id ?? null,
      difficultyLevel: r.difficulty_level === null || r.difficulty_level === undefined ? null : Number(r.difficulty_level),
    }))

    const picked = pickQuestionPool(pool, {
      counts: distribution.counts,
      topicIds: input.topicIds,
      difficulty: input.difficulty,
      wrongQuestionIds: wrongIds,
      onlyWrong: input.onlyWrong,
      prioritizeWrong: input.prioritizeWrong,
      seed: Date.now() >>> 0,
    })

    if (picked.error) return { data: null, error: picked.error }
    const pickedMap = new Map(picked.picked.map((p) => [p.id, p]))

    const { discNames } = await loadDisciplineNames(supabase)
    const statementRows = questionRows.filter((q) => pickedMap.has(q.id))
    const ordered = seededShuffle(statementRows, (Date.now() + 7) >>> 0)

    const { data: created, error: createError } = await supabase
      .from("simulados")
      .insert({
        user_id: user.id,
        name: input.name?.trim() || modeDefaultName(input.mode),
        exam_board: input.examName?.split(" - ")[1] ?? null,
        exam_name: input.examName ?? null,
        role_name: input.roleName ?? null,
        style: "Múltipla Escolha",
        status: "IN_PROGRESS",
        mode: input.mode,
        difficulty_filter: input.difficulty,
        duration_limit_seconds: input.durationLimitSeconds && input.durationLimitSeconds > 0 ? input.durationLimitSeconds : null,
        total_questions: ordered.length,
        simulado_date: new Date().toISOString().slice(0, 10),
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (createError || !created) {
      return { data: null, error: `Erro ao criar o simulado: ${createError?.message ?? "desconhecido"}` }
    }

    const items = ordered.map((q, i) => ({
      simulado_id: created.id,
      user_id: user.id,
      question_id: q.id,
      order_index: i,
    }))
    const { error: itemsError } = await supabase.from("simulado_questions").insert(items)
    if (itemsError) {
      await supabase.from("simulados").delete().eq("id", created.id)
      return { data: null, error: `Erro ao montar o simulado: ${itemsError.message}` }
    }

    const questions: PlayerQuestion[] = ordered.map((q, i) => ({
      id: q.id,
      orderIndex: i,
      statement: q.statement ?? "",
      alternatives: q.alternatives ?? null,
      isCertoErrado: isCertoErradoQuestion(q.correct_answer),
      disciplineId: q.discipline_id ?? "UNKNOWN",
      disciplineName: discNames.get(q.discipline_id ?? "") ?? "Sem disciplina",
      topicName: null,
      difficultyLabel: difficultyLabelOf(q.difficulty_level === null || q.difficulty_level === undefined ? null : Number(q.difficulty_level)),
    }))

    return { data: { simuladoId: created.id, questions, hasDifficultyData: hasDiffData(levels) }, error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro inesperado ao criar simulado." }
  }
}

function hasDiffData(levels: (number | null)[]): boolean {
  const known = levels.filter((l): l is number => l !== null && l !== undefined)
  return known.length >= 10 && new Set(known).size >= 2
}

async function loadDisciplineNames(supabase: Supabase): Promise<{ discNames: Map<string, string> }> {
  const { data } = await supabase.from("disciplines").select("id, name")
  const map = new Map<string, string>()
  ;(data ?? []).forEach((d) => map.set(d.id, d.name))
  return { discNames: map }
}

async function fetchEligibleWithStatements(
  supabase: Supabase,
  userId: string,
  q: EligibleQuery
): Promise<{ rows: EligibleStatementRow[]; levels: (number | null)[] }> {
  const lastAttempt = await fetchLastAttemptMap(supabase, userId)
  const wrongIds = new Set([...lastAttempt.entries()].filter(([, ok]) => !ok).map(([id]) => id))

  let query = supabase
    .from("questions")
    .select("id, discipline_id, topic_id, difficulty_level, statement, correct_answer, alternatives, explanation")
    .eq("question_status", "ACTIVE")

  if (q.disciplineIds.length > 0) query = query.in("discipline_id", q.disciplineIds)
  if (q.topicIds.length > 0) query = query.in("topic_id", q.topicIds)
  if (q.difficulty === "FACIL") query = query.lte("difficulty_level", 2)
  else if (q.difficulty === "DIFICIL") query = query.gte("difficulty_level", 4)

  const { data: rows } = await query.limit(20000)
  let list = (rows ?? []).filter((r) => r.statement && r.correct_answer)
  if (q.difficulty === "MEDIA") {
    list = list.filter((r) => r.difficulty_level !== null && Number(r.difficulty_level) === 3)
  }

  const wrongEff = q.onlyWrong ? wrongIds : q.wrongQuestionIds
  if (q.onlyWrong) list = list.filter((r) => wrongEff.has(r.id))

  const levels = list.map((r) => (r.difficulty_level === null || r.difficulty_level === undefined ? null : Number(r.difficulty_level)))
  return { rows: list, levels }
}

// ─── Continuar simulado em andamento ────────────────────────────────────────

export async function getInProgressSimuladoAction(): Promise<{
  data: { simuladoId: string; questions: PlayerQuestion[]; answers: Record<string, { selected: string | null; marked: boolean }>; startedAt: string; durationLimitSeconds: number | null; name: string } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Usuário não autenticado." }
    return await buildInProgressPayload(supabase, user.id)
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao recuperar simulado." }
  }
}

async function buildInProgressPayload(supabase: Supabase, userId: string) {
  const { data: simulado } = await supabase
    .from("simulados")
    .select("id, name, started_at, duration_limit_seconds")
    .eq("user_id", userId)
    .eq("status", "IN_PROGRESS")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!simulado) return { data: null, error: null }

  const { data: rows } = await supabase
    .from("simulado_questions")
    .select(`
      order_index, selected_answer, is_marked, question_id,
      questions ( id, statement, alternatives, correct_answer, difficulty_level, discipline_id, question_topics ( name ) )
    `)
    .eq("simulado_id", simulado.id)
    .eq("user_id", userId)
    .order("order_index", { ascending: true })

  const { data: discRows } = await supabase.from("disciplines").select("id, name")
  const discNames = new Map<string, string>((discRows ?? []).map((d) => [d.id, d.name]))

  const questions: PlayerQuestion[] = (rows ?? []).map((r, i) => {
    const q = Array.isArray(r.questions) ? r.questions[0] : r.questions
    let topicName: string | null = null
    if (q) {
      const raw = q.question_topics
      const node = Array.isArray(raw) ? raw[0] : raw
      topicName = node?.name ?? null
    }
    return {
      id: r.question_id,
      orderIndex: i,
      statement: q?.statement ?? "",
      alternatives: q?.alternatives ?? null,
      isCertoErrado: isCertoErradoQuestion(q?.correct_answer),
      disciplineId: q?.discipline_id ?? "UNKNOWN",
      disciplineName: discNames.get(q?.discipline_id ?? "") ?? "Sem disciplina",
      topicName,
      difficultyLabel: difficultyLabelOf(q?.difficulty_level === null || q?.difficulty_level === undefined ? null : Number(q?.difficulty_level)),
    }
  })

  const answers: Record<string, { selected: string | null; marked: boolean }> = {}
  ;(rows ?? []).forEach((r) => {
    answers[r.question_id] = { selected: r.selected_answer ?? null, marked: r.is_marked === true }
  })

  return {
    data: {
      simuladoId: simulado.id,
      questions,
      answers,
      startedAt: simulado.started_at ?? new Date().toISOString(),
      durationLimitSeconds: simulado.duration_limit_seconds === null || simulado.duration_limit_seconds === undefined ? null : Number(simulado.duration_limit_seconds),
      name: simulado.name ?? "Simulado",
    },
    error: null,
  }
}

// ─── Salvamento automático (resposta/marcação/tempo) ────────────────────────

export interface AnswerSaveBatchItem {
  orderIndex: number
  questionId: string
  selected: string | null
  marked: boolean
  responseTimeSeconds: number | null
}

export async function saveSimuladoAnswersAction(
  simuladoId: string,
  batch: AnswerSaveBatchItem[]
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { ok: false, error: "Não autenticado." }

    const { data: owner } = await supabase
      .from("simulados")
      .select("id")
      .eq("id", simuladoId)
      .eq("user_id", user.id)
      .eq("status", "IN_PROGRESS")
      .single()
    if (!owner) return { ok: false, error: "Simulado não encontrado ou já finalizado." }

    if (batch.length > 0) {
      const rows = batch.map((b) => ({
        simulado_id: simuladoId,
        user_id: user.id,
        question_id: b.questionId,
        order_index: b.orderIndex,
        selected_answer: b.selected ?? null,
        is_marked: b.marked,
        answered: b.selected !== null,
        response_time_seconds: b.responseTimeSeconds ?? null,
      }))
      const { error } = await supabase
        .from("simulado_questions")
        .upsert(rows, { onConflict: "simulado_id, order_index" })
      if (error) return { ok: false, error: error.message }
    }

    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: (e as { message?: string })?.message ?? "Erro ao salvar." }
  }
}

// ─── Finalizar / corrigir / persistir ───────────────────────────────────────

export async function finishSimuladoAction(
  simuladoId: string,
  opts?: { autoTimeout?: boolean }
): Promise<{ data: SimuladoResultPayload | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Usuário não autenticado." }

    const payload = await buildResultPayload(supabase, user.id, simuladoId, opts?.autoTimeout === true)
    if (payload.error) return { data: null, error: payload.error }
    if (!payload.data) return { data: null, error: "Simulado não encontrado." }

    await supabase.from("simulados").update({ finished_at: new Date().toISOString() }).eq("id", simuladoId).eq("user_id", user.id)
    revalidatePath("/simulados")
    return { data: payload.data, error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao finalizar simulado." }
  }
}

export async function getSimuladoResultAction(simuladoId: string): Promise<{
  data: SimuladoResultPayload | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Usuário não autenticado." }
    const payload = await buildResultPayload(supabase, user.id, simuladoId, false)
    if (payload.error) return { data: null, error: payload.error }
    return { data: payload.data ?? null, error: payload.error }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar resultado." }
  }
}

async function buildResultPayload(
  supabase: Supabase,
  userId: string,
  simuladoId: string,
  finalizing: boolean
): Promise<{ data: SimuladoResultPayload | null; error: string | null }> {
  const { data: header, error: headerError } = await supabase
    .from("simulados")
    .select("*")
    .eq("id", simuladoId)
    .eq("user_id", userId)
    .single()

  if (headerError || !header) return { data: null, error: "Simulado não encontrado." }

  const { data: rows } = await supabase
    .from("simulado_questions")
    .select(`
      order_index, selected_answer, is_marked, response_time_seconds, question_id,
      questions (
        id, statement, alternatives, correct_answer, explanation, difficulty_level,
        discipline_id, topic_id, question_topics ( id, name, discipline_id )
      )
    `)
    .eq("simulado_id", simuladoId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true })

  const { data: discRows } = await supabase.from("disciplines").select("id, name")
  const discNames = new Map<string, string>((discRows ?? []).map((d) => [d.id, d.name]))

  const rawQuestions: RawQuestion[] = []
  const rawAnswers: RawAnswer[] = []
  ;(rows ?? []).forEach((r) => {
    const q = Array.isArray(r.questions) ? r.questions[0] : r.questions
    if (!q) return
    const topic = Array.isArray(q.question_topics) ? q.question_topics[0] : q.question_topics
    rawQuestions.push({
      id: q.id,
      disciplineId: q.discipline_id ?? null,
      disciplineName: discNames.get(q.discipline_id ?? "") ?? "Sem disciplina",
      topicId: topic?.id ?? q.topic_id ?? null,
      topicName: topic?.name ?? null,
      correctAnswer: q.correct_answer ?? "",
      statement: q.statement ?? "",
      alternatives: q.alternatives ?? null,
      isCertoErrado: isCertoErradoQuestion(q.correct_answer),
      explanation: q.explanation ?? null,
      difficultyLevel: q.difficulty_level === null || q.difficulty_level === undefined ? null : Number(q.difficulty_level),
    })
    rawAnswers.push({
      questionId: q.id,
      orderIndex: Number(r.order_index ?? 0),
      selectedAnswer: r.selected_answer ?? null,
      isMarked: r.is_marked === true,
      responseTimeSeconds: r.response_time_seconds === null || r.response_time_seconds === undefined ? null : Number(r.response_time_seconds),
    })
  })

  const corrected = correctAnswers(rawQuestions, rawAnswers) as CorrectedQuestion[]
  const currentSeconds = Date.now()
  const startedAtMs = header.started_at ? new Date(header.started_at).getTime() : null
  let spent: number | null
  if (header.time_spent_seconds !== null && header.time_spent_seconds !== undefined) {
    spent = Number(header.time_spent_seconds)
  } else if (startedAtMs && !isNaN(startedAtMs)) {
    spent = Math.max(0, Math.round((currentSeconds - startedAtMs) / 1000))
  } else {
    spent = null
  }

  const totals = computeResultTotals(corrected, spent)
  const byDiscipline = computeByDiscipline(corrected)
  const byTopic = computeByTopic(corrected)

  const update: {
    status: string
    finished_at: string
    total_questions: number
    total_correct: number
    total_wrong: number
    total_blank: number
    score_percentage: number
    score: ScoreBand
    avg_time_per_question_seconds: number | null
    time_spent_seconds?: number
  } = {
    status: "FINISHED",
    finished_at: new Date().toISOString(),
    total_questions: totals.total,
    total_correct: totals.correct,
    total_wrong: totals.wrong,
    total_blank: totals.blank,
    score_percentage: totals.accuracy === null ? 0 : Math.round(totals.accuracy * 100) / 100,
    score: totals.score,
    avg_time_per_question_seconds: totals.timeStats.avgPerQuestionSeconds,
  }
  if (spent !== null) update.time_spent_seconds = spent
  if (finalizing) await supabase.from("simulados").update(update).eq("id", simuladoId).eq("user_id", userId)

  if (finalizing) {
    // Agregação por disciplina (tabela existente simulados_disciplines)
    await supabase.from("simulado_disciplines").delete().eq("simulado_id", simuladoId).eq("user_id", userId)
    const discRowsIns = byDiscipline.map((d) => ({
      simulado_id: simuladoId,
      user_id: userId,
      discipline_name: d.disciplineName,
      discipline_id: d.disciplineId ?? null,
      weight: 1.0,
      questions_count: d.questions,
      correct_count: d.correct,
      wrong_count: d.wrong,
      blank_count: d.blank,
    }))
    if (discRowsIns.length > 0) await supabase.from("simulado_disciplines").insert(discRowsIns)

    // Fonte oficial de desempenho: question_attempts (attempt_source = SIMULADO)
    const answered = corrected.filter((c) => c.answered)
    const attempts = answered.map((c) => ({
      user_id: userId,
      question_id: c.questionId,
      selected_answer: c.selectedAnswer ?? "",
      correct: c.isCorrect === true,
      response_time_seconds: c.responseTimeSeconds ?? 0,
      confidence_level: 3,
      review_required: c.isCorrect !== true,
      mistake_type: null,
      attempt_source: "SIMULADO",
    }))
    if (attempts.length > 0) {
      const { error: attErr } = await supabase.from("question_attempts").insert(attempts)
      if (attErr) console.error("[SIMULADO] Erro ao registrar tentativas:", attErr)
    }

    // Erros → revisões (review_items / motor FSRS existente)
    const wrong = corrected.filter((c) => c.isCorrect === false)
    if (wrong.length > 0) {
      const reviewRows = wrong.map((c) => ({
        user_id: userId,
        discipline_id: c.disciplineId,
        topic_id: c.topicId,
        source_type: "QUESTION",
        source_id: c.questionId,
        review_stage: "LEARNING",
        next_review_at: new Date().toISOString(),
        base_priority: 2.0,
      }))
      const { error: revErr } = await supabase
        .from("review_items")
        .upsert(reviewRows, { onConflict: "user_id, source_type, source_id" })
      if (revErr) console.error("[SIMULADO] Erro ao criar revisões:", revErr)
    }
  }

  // Histórico e comparação
  const { data: previousRows } = await supabase
    .from("simulados")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "FINISHED")
    .neq("id", simuladoId)
    .order("simulado_date", { ascending: true })
    .limit(30)

  const previous = (previousRows ?? []).map((r) => toHeader(r))
  const previousAvgAccuracy = averageAccuracy(previous)
  const { comparison, trend } = buildComparison(
    { accuracy: totals.accuracy, correct: totals.correct, wrong: totals.wrong, total: totals.total, timeSpentSeconds: spent },
    previous
  )
  const bests = computePersonalBests(previous)
  const insights = analyzeResult(totals, byDiscipline, previousAvgAccuracy)

  const questions: SimuladoResultPayload["questions"] = corrected.map((c) => ({
    questionId: c.questionId,
    orderIndex: c.orderIndex,
    statement: c.statement,
    alternatives: c.alternatives,
    isCertoErrado: c.isCertoErrado,
    disciplineId: c.disciplineId,
    disciplineName: c.disciplineName || "Sem disciplina",
    topicId: c.topicId,
    topicName: c.topicName,
    selectedAnswer: c.selectedAnswer,
    correctAnswer: c.correctAnswer,
    explanation: c.explanation,
    isCorrect: c.isCorrect,
    isMarked: c.isMarked,
    answered: c.answered,
    responseTimeSeconds: c.responseTimeSeconds,
    difficultyLabel: difficultyLabelOf(c.difficultyLevel),
  }))

  return {
    data: {
      header: { ...toHeader(header), status: "FINISHED", accuracy: totals.accuracy, score: totals.score, timeSpentSeconds: spent, avgTimePerQuestionSeconds: totals.timeStats.avgPerQuestionSeconds, totalCorrect: totals.correct, totalWrong: totals.wrong, totalBlank: totals.blank, totalQuestions: totals.total },
      byDiscipline,
      byTopic,
      questions,
      timeStats: totals.timeStats,
      markedCount: corrected.filter((c) => c.isMarked).length,
      insights,
      comparison,
      trend,
      bests: {
        bestAccuracy: bests.bestAccuracy
          ? { value: bests.bestAccuracy.accuracy ?? 0, simuladoId: bests.bestAccuracy.id, name: bests.bestAccuracy.name }
          : null,
        bestCorrect: bests.bestCorrect
          ? { value: bests.bestCorrect.totalCorrect, simuladoId: bests.bestCorrect.id, name: bests.bestCorrect.name }
          : null,
        fastestTime: bests.fastestTime
          ? { value: bests.fastestTime.timeSpentSeconds ?? 0, simuladoId: bests.fastestTime.id, name: bests.fastestTime.name }
          : null,
        bestByDiscipline: null,
      },
      previousAvgAccuracy,
    },
    error: null,
  }
}

// ─── Histórico ──────────────────────────────────────────────────────────────

export interface HistoryFilters {
  days?: number | null
  examName?: string | null
  roleName?: string | null
  disciplineId?: string | null
  score?: ScoreBand | "TODOS" | null
}

export async function getSimuladosHistoryAction(filters?: HistoryFilters): Promise<{
  data: { simulados: SimuladoHeader[]; personalBests: { accuracy: number | null; simuladoId: string; name: string; correct: number; wrong: number; score: ScoreBand | null; date: string | null } | null }
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: { simulados: [], personalBests: null }, error: "Usuário não autenticado." }

    let query = supabase
      .from("simulados")
      .select("*")
      .eq("user_id", user.id)
      .order("simulado_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)

    const f = filters ?? {}
    if (f.days && f.days > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - f.days)
      query = query.gte("created_at", cutoff.toISOString())
    }
    if (f.examName) query = query.eq("exam_name", f.examName)
    if (f.roleName) query = query.eq("role_name", f.roleName)
    if (f.score && f.score !== "TODOS") query = query.eq("score", f.score)

    const { data: rows, error } = await query
    if (error) return { data: null as never, error: error.message }

    let headers = (rows ?? []).map((r) => toHeader(r))

    if (f.disciplineId) {
      const { data: discRows } = await supabase
        .from("simulado_disciplines")
        .select("simulado_id")
        .eq("user_id", user.id)
        .eq("discipline_id", f.disciplineId)
      const ids = new Set((discRows ?? []).map((d) => d.simulado_id))
      headers = headers.filter((h) => ids.has(h.id))
    }

    const finished = headers.filter((h) => h.status === "FINISHED")
    const best = finished
      .filter((h) => h.accuracy !== null)
      .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))[0] ?? null

    return {
      data: {
        simulados: headers,
        personalBests: best
          ? {
              accuracy: best.accuracy,
              simuladoId: best.id,
              name: best.name,
              correct: best.totalCorrect,
              wrong: best.totalWrong,
              score: best.score,
              date: best.simuladoDate,
            }
          : null,
      },
      error: null,
    }
  } catch (e) {
    return { data: null as never, error: (e as { message?: string })?.message ?? "Erro ao carregar simulados." }
  }
}

export async function deleteSimuladoAction(simuladoId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { error: "Usuário não autenticado." }

    const { error } = await supabase.from("simulados").delete().eq("id", simuladoId).eq("user_id", user.id)
    if (error) return { error: error.message }
    revalidatePath("/simulados")
    return { error: null }
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao excluir." }
  }
}

export async function cancelSimuladoAction(simuladoId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { error: "Não autenticado." }
    const { error } = await supabase.from("simulados").update({ status: "CANCELED" }).eq("id", simuladoId).eq("user_id", user.id)
    if (error) return { error: error.message }
    return { error: null }
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao descartar." }
  }
}

// ─── Integrações: revisões, flashcards, lista de estudos ────────────────────

async function assertOwnsQuestion(supabase: Supabase, userId: string, simuladoId: string, questionId: string) {
  const { data } = await supabase
    .from("simulado_questions")
    .select("question_id")
    .eq("simulado_id", simuladoId)
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .single()
  return !!data
}

async function fetchQuestionForIntegration(supabase: Supabase, questionId: string) {
  const { data } = await supabase
    .from("questions")
    .select("id, discipline_id, topic_id, statement, correct_answer, explanation")
    .eq("id", questionId)
    .single()
  return data
}

export async function sendQuestionToReviewAction(simuladoId: string, questionId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { error: "Não autenticado." }
    if (!(await assertOwnsQuestion(supabase, user.id, simuladoId, questionId))) return { error: "Questão não pertence ao seu simulado." }

    const q = await fetchQuestionForIntegration(supabase, questionId)
    if (!q) return { error: "Questão não encontrada." }

    const { error } = await supabase.from("review_items").upsert(
      {
        user_id: user.id,
        discipline_id: q.discipline_id,
        topic_id: q.topic_id ?? null,
        source_type: "QUESTION",
        source_id: q.id,
        review_stage: "LEARNING",
        next_review_at: new Date().toISOString(),
        base_priority: 2.0,
      },
      { onConflict: "user_id, source_type, source_id" }
    )
    return { error: error ? `Erro ao enviar para revisão: ${error.message}` : null }
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao enviar para revisão." }
  }
}

export async function createFlashcardFromQuestionAction(simuladoId: string, questionId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { error: "Não autenticado." }
    if (!(await assertOwnsQuestion(supabase, user.id, simuladoId, questionId))) return { error: "Questão não pertence ao seu simulado." }

    const q = await fetchQuestionForIntegration(supabase, questionId)
    if (!q) return { error: "Questão não encontrada." }
    if (!q.explanation) {
      return { error: "Esta questão não possui explicação cadastrada — o flashcard seria vazio. Envie para revisão ou adicione aos estudos." }
    }

    const { error } = await supabase.from("review_items").upsert(
      {
        user_id: user.id,
        discipline_id: q.discipline_id,
        topic_id: q.topic_id ?? null,
        source_type: "FLASHCARD",
        source_id: q.id,
        review_stage: "NEW",
        next_review_at: new Date().toISOString(),
      },
      { onConflict: "user_id, source_type, source_id" }
    )
    return { error: error ? `Erro ao criar flashcard: ${error.message}` : null }
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao criar flashcard." }
  }
}

export async function addQuestionToStudyListAction(simuladoId: string, questionId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { error: "Não autenticado." }
    if (!(await assertOwnsQuestion(supabase, user.id, simuladoId, questionId))) return { error: "Questão não pertence ao seu simulado." }

    const listName = "Para estudar (Simulados)"
    const { data: existing } = await supabase.from("question_lists").select("id").eq("user_id", user.id).eq("name", listName).maybeSingle()
    let listId = existing?.id ?? null
    if (!listId) {
      const { data: created, error: listError } = await supabase
        .from("question_lists")
        .insert({ user_id: user.id, name: listName, description: "Questões marcadas a partir de simulados." })
        .select("id")
        .single()
      if (listError) return { error: `Erro ao criar lista: ${listError.message}` }
      listId = created.id
    }

    const { error } = await supabase
      .from("question_list_items")
      .upsert({ list_id: listId, question_id: questionId }, { onConflict: "list_id, question_id" })
    return { error: error ? `Erro ao adicionar à lista: ${error.message}` : null }
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao adicionar aos estudos." }
  }
}