"use server"

import { revalidatePath } from "next/cache"

import {
  accuracyOf,
  computeNetScore,
  computeSubjects,
  netAccuracyOf,
  wrongsOf,
} from "@/application/simulados/simulado-stats.service"
import { getEffectiveUserId } from "@/application/admin/auth-guard"
import type {
  SimuladoRecord,
  SimuladoRecordInput,
  SimuladoRecordSource,
  SimuladoScoringRule,
  SimuladoRecordSubject,
} from "@/domain/simulados/types"
import { createClient } from "@/infrastructure/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

type SimuladoRow = {
  id: string
  user_id: string
  name: string
  exam_name: string | null
  role_name: string | null
  simulado_date: string
  source: string | null
  source_custom: string | null
  exam_board: string | null
  exam_board_custom: string | null
  total_questions: number | null
  total_correct: number | null
  total_wrong: number | null
  total_blank: number | null
  score_percentage: number | null
  time_spent_seconds: number | null
  notes: string | null
  scoring_rule: string | null
  penalty_score: number | null
  penalty_per_wrong: number | null
  net_score: number | null
  net_percentage: number | null
  created_at: string
  updated_at: string
}

type SubjectRow = {
  id: string
  simulado_id: string
  user_id: string
  discipline_id: string | null
  discipline_name: string | null
  questions_count: number | null
  correct_count: number | null
  wrong_count: number | null
  blank_count: number | null
}

async function requireUser(supabase: Supabase) {
  return await getEffectiveUserId(supabase)
}

function toSource(value: string | null): SimuladoRecordSource {
  const valid: SimuladoRecordSource[] = [
    "TEC",
    "GRAN",
    "ESTRATEGIA",
    "QCONCURSOS",
    "PDF",
    "PROVA_ANTERIOR",
    "OUTRO",
  ]
  return valid.includes(value as SimuladoRecordSource) ? (value as SimuladoRecordSource) : "OUTRO"
}

function toScoringRule(value: string | null): SimuladoScoringRule {
  const valid: SimuladoScoringRule[] = ["PERCENTUAL", "CEBRASPE", "PENALIZACAO", "PERSONALIZADO"]
  return valid.includes(value as SimuladoScoringRule) ? (value as SimuladoScoringRule) : "PERCENTUAL"
}

function toRecord(row: SimuladoRow, subjects: SubjectRow[]): SimuladoRecord {
  const totalQuestions = Number(row.total_questions ?? 0)
  const totalCorrect = Number(row.total_correct ?? 0)
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name ?? "Simulado",
    examName: row.exam_name ?? "",
    roleName: row.role_name ?? "",
    simuladoDate: row.simulado_date ?? "",
    source: toSource(row.source),
    sourceCustom: row.source_custom ?? null,
    exam_board: row.exam_board ?? null,
    exam_board_custom: row.exam_board_custom ?? null,
    totalQuestions,
    totalCorrect,
    totalWrong: Number(row.total_wrong ?? 0),
    totalBlank: Number(row.total_blank ?? 0),
    accuracy: row.score_percentage !== null && row.score_percentage !== undefined
      ? Number(row.score_percentage)
      : accuracyOf(totalCorrect, totalQuestions),
    timeSpentSeconds:
      row.time_spent_seconds === null || row.time_spent_seconds === undefined
        ? null
        : Number(row.time_spent_seconds),
    notes: row.notes ?? null,
    scoringRule: toScoringRule(row.scoring_rule),
    penaltyPerWrong:
      row.penalty_per_wrong === null || row.penalty_per_wrong === undefined
        ? null
        : Number(row.penalty_per_wrong),
    netScore:
      row.net_score === null || row.net_score === undefined ? null : Number(row.net_score),
    netAccuracy:
      row.net_percentage === null || row.net_percentage === undefined
        ? null
        : Number(row.net_percentage),
    penaltyScore:
      row.penalty_score === null || row.penalty_score === undefined
        ? null
        : Number(row.penalty_score),
    subjects: subjects.map((s): SimuladoRecordSubject => {
      const questions = Number(s.questions_count ?? 0)
      const correct = Number(s.correct_count ?? 0)
      return {
        disciplineId: s.discipline_id ?? null,
        disciplineName: s.discipline_name ?? "Matéria",
        questionsCount: questions,
        correctCount: correct,
        wrongCount: Number(s.wrong_count ?? 0),
        blankCount: Number(s.blank_count ?? 0),
        accuracy: accuracyOf(correct, questions),
      }
    }),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }
}

async function fetchSubjects(supabase: Supabase, userId: string, simuladoIds: string[]) {
  if (simuladoIds.length === 0) return new Map<string, SubjectRow[]>()
  const { data, error } = await supabase
    .from("simulado_disciplines")
    .select("id, simulado_id, user_id, discipline_id, discipline_name, questions_count, correct_count, wrong_count, blank_count")
    .eq("user_id", userId)
    .in("simulado_id", simuladoIds)
    .order("discipline_name", { ascending: true })
  if (error || !data) return new Map<string, SubjectRow[]>()
  const map = new Map<string, SubjectRow[]>()
  for (const row of data as SubjectRow[]) {
    const list = map.get(row.simulado_id) ?? []
    list.push(row)
    map.set(row.simulado_id, list)
  }
  return map
}

function normalizeInput(input: SimuladoRecordInput) {
  const totalQuestions = Math.max(1, Math.floor(Number(input.totalQuestions) || 0))
  const totalCorrect = Math.max(0, Math.floor(Number(input.totalCorrect) || 0))
  const totalBlank = Math.max(0, Math.floor(Number(input.totalBlank) || 0))
  const totalWrong = Math.max(0, wrongsOf(totalQuestions, totalCorrect, totalBlank))
  return { totalQuestions, totalCorrect, totalBlank, totalWrong }
}

/**
 * Registra (ou atualiza, quando input.id presente) um simulado feito fora do sistema.
 * NÃO toca em ciclo, planejamento, histórico de estudo ou questões.
 */
export async function saveSimuladoRecordAction(input: SimuladoRecordInput): Promise<{
  data: { id: string } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    if (!input.name?.trim()) return { data: null, error: "Informe o nome do simulado." }
    if (!input.simuladoDate) return { data: null, error: "Informe a data do simulado." }
    if (!input.exam_board) return { data: null, error: "Informe a banca do simulado." }

    const { totalQuestions, totalCorrect, totalBlank, totalWrong } = normalizeInput(input)
    if (totalCorrect + totalWrong + totalBlank !== totalQuestions) {
      return { data: null, error: "Acertos + erros + brancos deve ser igual ao total de questões." }
    }

    const accuracy = accuracyOf(totalCorrect, totalQuestions)

    // Pontuação líquida (regra CEBRASPE): calculada no servidor como fonte de verdade
    const scoringRule = input.scoringRule ?? "PERCENTUAL"
    const penaltyPerWrong =
      scoringRule === "CEBRASPE" && input.penaltyPerWrong !== null && input.penaltyPerWrong !== undefined
        ? Math.max(0, Number(input.penaltyPerWrong) || 1)
        : null
    const netScore =
      scoringRule === "CEBRASPE"
        ? computeNetScore({ totalCorrect, totalWrong, scoringRule, penaltyPerWrong })
        : null
    const netAccuracy = netScore !== null ? netAccuracyOf(netScore, totalQuestions) : null

    const subjects = computeSubjects(input.subjects ?? [], {
      scoringRule,
      penaltyPerWrong,
    })

    const payload = {
      user_id: userId,
      name: input.name.trim(),
      exam_name: input.examName?.trim() || null,
      role_name: input.roleName?.trim() || null,
      simulado_date: input.simuladoDate,
      source: input.source,
      source_custom: input.source === "OUTRO" ? input.sourceCustom?.trim() || null : null,
      exam_board: input.exam_board,
      total_questions: totalQuestions,
      total_correct: totalCorrect,
      total_wrong: totalWrong,
      total_blank: totalBlank,
      score_percentage: accuracy,
      time_spent_seconds:
        input.timeSpentSeconds !== null && input.timeSpentSeconds !== undefined
          ? Math.max(0, Math.floor(Number(input.timeSpentSeconds)))
          : null,
      notes: input.notes?.trim() || null,
      scoring_rule: scoringRule,
      penalty_per_wrong: penaltyPerWrong,
      net_score: netScore,
      net_percentage: netAccuracy,
      penalty_score:
        input.penaltyScore !== null && input.penaltyScore !== undefined
          ? Math.max(0, Math.min(100, Number(input.penaltyScore)))
          : null,
      style: "Múltipla Escolha",
      status: "FINISHED",
    }

    let simuladoId = input.id ?? null

    if (simuladoId) {
      // EDITAR: garante posse e preserva created_at
      const { data: existing, error: checkErr } = await supabase
        .from("simulados")
        .select("id")
        .eq("id", simuladoId)
        .eq("user_id", userId)
        .maybeSingle()
      if (checkErr || !existing) {
        return { data: null, error: "Simulado não encontrado." }
      }
      const { error: updateErr } = await supabase
        .from("simulados")
        .update(payload)
        .eq("id", simuladoId)
        .eq("user_id", userId)
      if (updateErr) return { data: null, error: updateErr.message }

      // Recria resultados por matéria
      await supabase
        .from("simulado_disciplines")
        .delete()
        .eq("simulado_id", simuladoId)
        .eq("user_id", userId)
    } else {
      const { data: created, error: createErr } = await supabase
        .from("simulados")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select("id")
        .single()
      if (createErr || !created) {
        return { data: null, error: `Erro ao registrar simulado: ${createErr?.message ?? "desconhecido"}` }
      }
      simuladoId = created.id
    }

    if (subjects.length > 0) {
      const rows = subjects.map((s) => ({
        simulado_id: simuladoId,
        user_id: userId,
        discipline_id: s.disciplineId ?? null,
        discipline_name: s.disciplineName,
        questions_count: s.questionsCount,
        correct_count: s.correctCount,
        wrong_count: s.wrongCount,
        blank_count: s.blankCount,
        weight: 1.0,
      }))
      const { error: subjectsErr } = await supabase.from("simulado_disciplines").insert(rows)
      if (subjectsErr) {
        return { data: null, error: `Erro ao salvar matérias: ${subjectsErr.message}` }
      }
    }

    revalidatePath("/simulados")
    if (!simuladoId) {
      return { data: null, error: "Erro ao salvar simulado: ID não gerado." }
    }
    return { data: { id: simuladoId }, error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao salvar simulado." }
  }
}

/**
 * Lista os simulados registrados do usuário (novos registros + antigos finalizados),
 * ordenados do mais recente para o mais antigo.
 */
export async function getSimuladoRecordsAction(filters?: {
  days?: number | null
  examName?: string | null
  roleName?: string | null
  source?: string | null
}): Promise<{ data: SimuladoRecord[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    let query = supabase
      .from("simulados")
      .select("*")
      .eq("user_id", userId)
      .order("simulado_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300)

    if (filters?.days && filters.days > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - filters.days)
      query = query.gte("simulado_date", cutoff.toISOString().slice(0, 10))
    }
    if (filters?.examName) query = query.eq("exam_name", filters.examName)
    if (filters?.roleName) query = query.eq("role_name", filters.roleName)
    if (filters?.source) query = query.eq("source", filters.source)

    const { data: rows, error } = await query
    if (error) return { data: null, error: error.message }

    const ids = (rows ?? []).map((r) => (r as SimuladoRow).id)
    const subjectsMap = await fetchSubjects(supabase, userId, ids)

    const records = (rows ?? []).map((r) =>
      toRecord(r as SimuladoRow, subjectsMap.get((r as SimuladoRow).id) ?? [])
    )

    return { data: records, error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar simulados." }
  }
}

/**
 * Busca um simulado registrado por ID (isolado por usuário).
 */
export async function getSimuladoRecordAction(
  simuladoId: string
): Promise<{ data: SimuladoRecord | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: null, error: "Usuário não autenticado." }

    const { data: row, error } = await supabase
      .from("simulados")
      .select("*")
      .eq("id", simuladoId)
      .eq("user_id", userId)
      .maybeSingle()
    if (error || !row) return { data: null, error: "Simulado não encontrado." }

    const subjectsMap = await fetchSubjects(supabase, userId, [simuladoId])
    return { data: toRecord(row as SimuladoRow, subjectsMap.get(simuladoId) ?? []), error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar simulado." }
  }
}

/**
 * Exclui um simulado registrado (isolado por usuário).
 */
export async function deleteSimuladoRecordAction(
  simuladoId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { error: "Usuário não autenticado." }

    const { error } = await supabase
      .from("simulados")
      .delete()
      .eq("id", simuladoId)
      .eq("user_id", userId)
    if (error) return { error: error.message }

    revalidatePath("/simulados")
    return { error: null }
  } catch (e) {
    return { error: (e as { message?: string })?.message ?? "Erro ao excluir simulado." }
  }
}

/**
 * Lista matérias (disciplinas) para o formulário de registro.
 */
export async function getSimuladoFormDisciplinesAction(): Promise<{
  data: { id: string; name: string; area: string | null }[] | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const userId = await requireUser(supabase)
    if (!userId) return { data: [], error: null }

    const { data, error } = await supabase
      .from("disciplines")
      .select("id, name, area")
      .order("name", { ascending: true })
      .limit(300)
    if (error) return { data: null, error: error.message }
    return { data: data ?? [], error: null }
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message ?? "Erro ao carregar matérias." }
  }
}
