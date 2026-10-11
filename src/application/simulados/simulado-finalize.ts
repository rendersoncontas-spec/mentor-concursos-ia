import type { SupabaseClient } from "@supabase/supabase-js"

import type { CorrectedQuestion } from "./simulado-engine"

/**
 * G2.9 — persistência da finalização de um simulado do simulador interno.
 *
 * Este é o ÚNICO caminho do código que grava em `question_attempts`
 * (attempt_source = SIMULADO). Antes, `buildResultPayload(finalizing=true)`
 * gravava sem conferir o estado do simulado:
 *
 *   - finalizar duas vezes (duplo clique, o tempo esgotando junto com o clique
 *     manual, um retry depois de a primeira requisição ter dado certo, duas
 *     abas) inseria as tentativas DE NOVO — `question_attempts` não tem
 *     chave única, então cada questão virava 2+ linhas e todas as
 *     estatísticas que somam acertos/erros contavam em dobro;
 *   - "finalizar" um simulado já CANCELED sobrescrevia o status para FINISHED
 *     e também gravava tentativas;
 *   - se a gravação das tentativas falhasse, o simulado já tinha sido marcado
 *     FINISHED antes, o erro só ia para o console e não havia como tentar de
 *     novo (o simulado não estava mais IN_PROGRESS): as respostas se perdiam.
 *
 * Agora a finalização é uma transição condicional (compare-and-set) no
 * próprio banco: `UPDATE ... WHERE status = 'IN_PROGRESS'`. Só a requisição
 * que efetivamente muda a linha de IN_PROGRESS para FINISHED grava as
 * tentativas; qualquer outra (concorrente, repetida, ou sobre um simulado já
 * encerrado/cancelado) não grava nada e apenas devolve o resultado. Se a
 * gravação das tentativas falhar, o status volta para IN_PROGRESS e o erro é
 * devolvido a quem chamou, para que a finalização possa ser repetida. O
 * insert de várias linhas do PostgREST é uma única instrução — ou entram
 * todas as tentativas, ou nenhuma —, então voltar o status é seguro.
 *
 * Sem migration: a garantia vem da condição do UPDATE, não de uma constraint
 * nova.
 */

export interface SimuladoAttemptRow {
  user_id: string
  question_id: string
  selected_answer: string
  correct: boolean
  response_time_seconds: number
  confidence_level: number
  review_required: boolean
  mistake_type: null
  attempt_source: "SIMULADO"
}

/**
 * Uma linha por questão RESPONDIDA. Em branco não é tentativa (não é acerto
 * nem erro). `user_id` vem sempre do servidor, nunca do cliente.
 */
export function buildSimuladoAttemptRows(
  corrected: Pick<CorrectedQuestion, "questionId" | "answered" | "isCorrect" | "selectedAnswer" | "responseTimeSeconds">[],
  userId: string,
): SimuladoAttemptRow[] {
  return corrected
    .filter((c) => c.answered)
    .map((c) => ({
      user_id: userId,
      question_id: c.questionId,
      selected_answer: c.selectedAnswer ?? "",
      correct: c.isCorrect === true,
      response_time_seconds: Math.max(0, Math.round(c.responseTimeSeconds ?? 0)),
      confidence_level: 3,
      review_required: c.isCorrect !== true,
      mistake_type: null,
      attempt_source: "SIMULADO",
    }))
}

export interface FinalizeSimuladoInput {
  userId: string
  simuladoId: string
  /** Status lido no início da requisição. */
  headerStatus: string | null | undefined
  /** Colunas de resultado gravadas junto com status = FINISHED. */
  finishedUpdate: Record<string, unknown> & { status: "FINISHED" }
  disciplineRows: Record<string, unknown>[]
  attempts: SimuladoAttemptRow[]
}

export type FinalizeSimuladoOutcome =
  /** Esta requisição finalizou e gravou as tentativas. */
  | { status: "FINALIZED"; error: null }
  /** Outra requisição já finalizou, ou o simulado não estava em andamento: nada gravado. */
  | { status: "ALREADY_CLOSED"; error: null }
  /** A gravação falhou; o simulado voltou para IN_PROGRESS e pode ser finalizado de novo. */
  | { status: "FAILED"; error: string }

export async function persistSimuladoFinalization(
  supabase: SupabaseClient,
  input: FinalizeSimuladoInput,
): Promise<FinalizeSimuladoOutcome> {
  const { userId, simuladoId } = input

  // Já encerrado (FINISHED/CANCELED) ou nunca iniciado: leitura pura.
  if (input.headerStatus !== "IN_PROGRESS") return { status: "ALREADY_CLOSED", error: null }

  const { data: claimed, error: claimError } = await supabase
    .from("simulados")
    .update(input.finishedUpdate)
    .eq("id", simuladoId)
    .eq("user_id", userId)
    .eq("status", "IN_PROGRESS")
    .select("id")

  if (claimError) {
    return { status: "FAILED", error: "Não foi possível finalizar o simulado. Tente novamente." }
  }
  // Zero linhas: outra requisição chegou antes (ou a RLS não deixou mudar).
  if (!Array.isArray(claimed) || claimed.length === 0) return { status: "ALREADY_CLOSED", error: null }

  // Agregação por disciplina — delete + insert, reexecutável.
  await supabase.from("simulado_disciplines").delete().eq("simulado_id", simuladoId).eq("user_id", userId)
  if (input.disciplineRows.length > 0) {
    await supabase.from("simulado_disciplines").insert(input.disciplineRows)
  }

  if (input.attempts.length > 0) {
    const { error: attemptsError } = await supabase.from("question_attempts").insert(input.attempts)
    if (attemptsError) {
      console.error("[SIMULADO] Erro ao registrar tentativas:", attemptsError)
      // Devolve o simulado ao estado anterior para que a finalização possa
      // ser repetida sem perder as respostas (que continuam em simulado_questions).
      await supabase
        .from("simulados")
        .update({ status: "IN_PROGRESS", finished_at: null })
        .eq("id", simuladoId)
        .eq("user_id", userId)
        .eq("status", "FINISHED")
      return {
        status: "FAILED",
        error: "Não foi possível registrar as respostas do simulado. Tente finalizar novamente.",
      }
    }
  }

  return { status: "FINALIZED", error: null }
}
