import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  SimuladoRecord,
  SimuladoRecordSource,
  SimuladoRecordSubject,
  SimuladoScoringRule,
} from "@/domain/simulados/types"
import { countOption, fetchAllRowsPaged } from "@/lib/parallel-pagination"

import { accuracyOf } from "./simulado-stats.service"

/**
 * G2.13 — leitura dos simulados EXTERNOS registrados de um usuário, fora do
 * arquivo "use server" (assim não vira endpoint e pode ser reaproveitada pela
 * tela de Simulados, por Estudo × desempenho e pelas Estatísticas).
 *
 * Erro não é lista vazia: se as matérias não puderem ser lidas, a leitura
 * inteira falha. Antes, uma falha nas matérias devolvia simulados SEM matérias
 * — a análise por matéria sumia em silêncio e, pior, abrir a edição de um
 * simulado nesse estado e salvar gravaria o simulado sem as matérias.
 */

type Supabase = SupabaseClient

export type SimuladoRow = {
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

export type SubjectRow = {
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

export function toRecord(row: SimuladoRow, subjects: SubjectRow[]): SimuladoRecord {
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

/** Simulados por consulta `in (...)` das matérias (URL do PostgREST). */
const SIMULADO_ID_BATCH = 100

export async function readSimuladoSubjects(
  supabase: Supabase,
  userId: string,
  simuladoIds: string[],
): Promise<{ data: Map<string, SubjectRow[]>; error: string | null }> {
  const map = new Map<string, SubjectRow[]>()
  if (simuladoIds.length === 0) return { data: map, error: null }
  for (let i = 0; i < simuladoIds.length; i += SIMULADO_ID_BATCH) {
    const batch = simuladoIds.slice(i, i + SIMULADO_ID_BATCH)
    // Paginado: até 60 matérias por simulado passam do teto de 1.000 linhas.
    const { data, error } = await fetchAllRowsPaged<SubjectRow>(
      (withCount) =>
        supabase
          .from("simulado_disciplines")
          .select(
            "id, simulado_id, user_id, discipline_id, discipline_name, questions_count, correct_count, wrong_count, blank_count",
            countOption(withCount),
          )
          .eq("user_id", userId)
          .in("simulado_id", batch),
      [
        { column: "simulado_id", ascending: true },
        { column: "discipline_name", ascending: true },
        { column: "id", ascending: true },
      ],
      { maxRows: 50_000, perfLabel: "simulado_disciplines.records" },
    )
    if (error) return { data: new Map(), error: "Não foi possível carregar as matérias dos simulados." }
    for (const row of data) {
      const list = map.get(row.simulado_id) ?? []
      // Cada linha real entra uma vez (página repetida não duplica).
      if (!list.some((r) => r.id === row.id)) list.push(row)
      map.set(row.simulado_id, list)
    }
  }
  return { data: map, error: null }
}

export interface SimuladoRecordsFilters {
  days?: number | null
  examName?: string | null
  roleName?: string | null
  source?: string | null
}

/** Teto de simulados lidos por usuário (o mesmo da tela desde a G2.10). */
export const SIMULADO_RECORDS_LIMIT = 300

/**
 * Simulados externos finalizados (mode nulo), mais recente primeiro, com
 * desempate determinístico (data → criação → id).
 */
export async function readSimuladoRecords(
  supabase: Supabase,
  userId: string,
  filters?: SimuladoRecordsFilters,
): Promise<{ data: SimuladoRecord[] | null; error: string | null }> {
  let query = supabase
    .from("simulados")
    .select("*")
    .eq("user_id", userId)
    .is("mode", null)
    .eq("status", "FINISHED")
    .order("simulado_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SIMULADO_RECORDS_LIMIT)

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

  const typed = (rows ?? []) as SimuladoRow[]
  const subjects = await readSimuladoSubjects(supabase, userId, typed.map((r) => r.id))
  if (subjects.error) return { data: null, error: subjects.error }

  return { data: typed.map((r) => toRecord(r, subjects.data.get(r.id) ?? [])), error: null }
}
