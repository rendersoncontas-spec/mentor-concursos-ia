import type { SupabaseClient } from "@supabase/supabase-js"

import type { SimuladoRecordInput } from "@/domain/simulados/types"

import { isUuid, normalizeSimuladoRecordInput, type NormalizedSimuladoRecord } from "./simulado-record-validation"
import { computeNetScore, netAccuracyOf } from "./simulado-stats.service"

/**
 * G2.10 — persistência dos simulados EXTERNOS (registro manual), separada da
 * Server Action para poder ser testada com um banco em memória. Toda consulta
 * filtra por `user_id` (o do servidor, nunca do cliente) e por `mode` nulo
 * (registro manual); a RLS (`auth.uid() = user_id`) é a segunda barreira.
 */

type Supabase = SupabaseClient

const UNIQUE_VIOLATION = "23505"

function buildPayload(userId: string, r: NormalizedSimuladoRecord) {
  // Pontuação líquida (regra CEBRASPE): calculada no servidor como fonte de verdade.
  const netScore =
    r.scoringRule === "CEBRASPE"
      ? computeNetScore({
          totalCorrect: r.totalCorrect,
          totalWrong: r.totalWrong,
          scoringRule: r.scoringRule,
          penaltyPerWrong: r.penaltyPerWrong,
        })
      : null
  return {
    user_id: userId,
    name: r.name,
    exam_name: r.examName,
    role_name: r.roleName,
    simulado_date: r.simuladoDate,
    source: r.source,
    source_custom: r.sourceCustom,
    exam_board: r.examBoard,
    total_questions: r.totalQuestions,
    total_correct: r.totalCorrect,
    total_wrong: r.totalWrong,
    total_blank: r.totalBlank,
    score_percentage: r.accuracy,
    time_spent_seconds: r.timeSpentSeconds,
    notes: r.notes,
    scoring_rule: r.scoringRule,
    penalty_per_wrong: r.penaltyPerWrong,
    net_score: netScore,
    net_percentage: netScore !== null ? netAccuracyOf(netScore, r.totalQuestions) : null,
    penalty_score: r.penaltyScore,
    style: "Múltipla Escolha",
    status: "FINISHED",
    updated_at: new Date().toISOString(),
  }
}

function subjectRows(simuladoId: string, userId: string, r: NormalizedSimuladoRecord) {
  return r.subjects.map((s) => ({
    simulado_id: simuladoId,
    user_id: userId,
    discipline_id: s.disciplineId,
    discipline_name: s.disciplineName,
    questions_count: s.questionsCount,
    correct_count: s.correctCount,
    wrong_count: s.wrongCount,
    blank_count: s.blankCount,
    weight: 1.0,
  }))
}

/** Simulado externo (registro manual) do próprio usuário — `mode` nulo. */
async function findOwnRecord(supabase: Supabase, userId: string, simuladoId: string): Promise<boolean> {
  const { data } = await supabase
    .from("simulados")
    .select("id")
    .eq("id", simuladoId)
    .eq("user_id", userId)
    .is("mode", null)
    .maybeSingle()
  return !!data
}

/**
 * Atualiza um registro existente sem janela de perda de dados: grava as
 * matérias NOVAS primeiro, depois o cabeçalho, e só então apaga as matérias
 * antigas. Antes era "apaga as antigas → insere as novas": se o insert
 * falhasse, o simulado ficava sem nenhuma matéria.
 */
export async function updateRecord(
  supabase: Supabase,
  userId: string,
  simuladoId: string,
  r: NormalizedSimuladoRecord,
): Promise<string | null> {
  const { data: oldRows, error: oldErr } = await supabase
    .from("simulado_disciplines")
    .select("id")
    .eq("simulado_id", simuladoId)
    .eq("user_id", userId)
  if (oldErr) return "Não foi possível atualizar o simulado. Tente novamente."
  const oldIds = (oldRows ?? []).map((row) => (row as { id: string }).id)

  let newIds: string[] = []
  const rows = subjectRows(simuladoId, userId, r)
  if (rows.length > 0) {
    const { data: inserted, error: insErr } = await supabase.from("simulado_disciplines").insert(rows).select("id")
    if (insErr) return "Não foi possível salvar as matérias. Nada foi alterado."
    newIds = (inserted ?? []).map((row) => (row as { id: string }).id)
  }

  const { error: updErr } = await supabase
    .from("simulados")
    .update(buildPayload(userId, r))
    .eq("id", simuladoId)
    .eq("user_id", userId)
    .is("mode", null)
  if (updErr) {
    if (newIds.length > 0) {
      await supabase.from("simulado_disciplines").delete().in("id", newIds).eq("user_id", userId)
    }
    return "Não foi possível atualizar o simulado. Nada foi alterado."
  }

  if (oldIds.length > 0) {
    const { error: delErr } = await supabase
      .from("simulado_disciplines")
      .delete()
      .in("id", oldIds)
      .eq("user_id", userId)
    if (delErr) return "O simulado foi atualizado, mas as matérias antigas não puderam ser removidas. Tente salvar de novo."
  }
  return null
}

export async function saveSimuladoRecord(
  supabase: Supabase,
  userId: string,
  input: SimuladoRecordInput,
  todayKey: string,
): Promise<{ data: { id: string } | null; error: string | null }> {
  const normalized = normalizeSimuladoRecordInput(input, todayKey)
  if (!normalized.ok) return { data: null, error: normalized.error }
  const record = normalized.value

  // Matérias com id precisam existir no catálogo visível ao usuário (RLS de
  // `disciplines`); o nome gravado é o do catálogo, não o digitado.
  const ids = record.subjects.map((s) => s.disciplineId).filter((id): id is string => id !== null)
  if (ids.length > 0) {
    const { data: found, error: discErr } = await supabase.from("disciplines").select("id, name").in("id", ids)
    if (discErr) return { data: null, error: "Não foi possível conferir as matérias. Tente novamente." }
    const names = new Map((found ?? []).map((d) => [d.id as string, d.name as string]))
    const missing = record.subjects.find((s) => s.disciplineId !== null && !names.has(s.disciplineId))
    if (missing) return { data: null, error: `A matéria "${missing.disciplineName}" não foi encontrada no catálogo.` }
    record.subjects = record.subjects.map((s) =>
      s.disciplineId !== null ? { ...s, disciplineName: names.get(s.disciplineId) ?? s.disciplineName } : s,
    )
  }

  // ── EDITAR ───────────────────────────────────────────────────────────
  if (input.id) {
    if (!isUuid(input.id) || !(await findOwnRecord(supabase, userId, input.id))) {
      return { data: null, error: "Simulado não encontrado." }
    }
    const err = await updateRecord(supabase, userId, input.id, record)
    if (err) return { data: null, error: err }
    return { data: { id: input.id }, error: null }
  }

  // ── CRIAR (idempotente por requestId) ────────────────────────────────
  const requestId = isUuid(input.requestId) ? input.requestId : null
  if (requestId && (await findOwnRecord(supabase, userId, requestId))) {
    // Reenvio do mesmo formulário: atualiza com os valores mais recentes.
    const err = await updateRecord(supabase, userId, requestId, record)
    if (err) return { data: null, error: err }
    return { data: { id: requestId }, error: null }
  }

  const { data: created, error: createErr } = await supabase
    .from("simulados")
    .insert({ ...buildPayload(userId, record), ...(requestId ? { id: requestId } : {}), created_at: new Date().toISOString() })
    .select("id")
    .single()
  if (createErr || !created) {
    // Corrida com um reenvio simultâneo do mesmo formulário: o outro venceu.
    if (requestId && (createErr as { code?: string } | null)?.code === UNIQUE_VIOLATION && (await findOwnRecord(supabase, userId, requestId))) {
      return { data: { id: requestId }, error: null }
    }
    return { data: null, error: "Erro ao registrar simulado. Tente novamente." }
  }
  const simuladoId = created.id as string

  const rows = subjectRows(simuladoId, userId, record)
  if (rows.length > 0) {
    const { error: subjectsErr } = await supabase.from("simulado_disciplines").insert(rows)
    if (subjectsErr) {
      // Desfaz o cabeçalho: um registro sem as matérias informadas não é salvo
      // pela metade, e o reenvio (mesmo requestId) cria tudo de novo.
      await supabase.from("simulados").delete().eq("id", simuladoId).eq("user_id", userId)
      return { data: null, error: "Erro ao salvar as matérias. O simulado não foi registrado; tente novamente." }
    }
  }

  return { data: { id: simuladoId }, error: null }
}

/** Exclui só o próprio registro manual. Nada removido = "não encontrado". */
export async function deleteSimuladoRecord(
  supabase: Supabase,
  userId: string,
  simuladoId: string,
): Promise<{ error: string | null }> {
  if (!isUuid(simuladoId)) return { error: "Simulado não encontrado." }
  const { data: removed, error } = await supabase
    .from("simulados")
    .delete()
    .eq("id", simuladoId)
    .eq("user_id", userId)
    .is("mode", null)
    .select("id")
  if (error) return { error: "Não foi possível excluir o simulado." }
  if (!Array.isArray(removed) || removed.length === 0) return { error: "Simulado não encontrado." }
  return { error: null }
}
