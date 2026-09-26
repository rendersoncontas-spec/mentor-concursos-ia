// ============================================================================
// Regra de leitura das sessões de estudo do Centro de Estatísticas (Fase I.7).
//
// As sessões de `study_history` são a fonte primária da página inteira: total de
// horas, sequência de dias, mapa de calor, horas por disciplina, evolução,
// produtividade e prioridades saem todas daí.
//
// O problema que isto resolve: a leitura é paginada, e o paginador devolve, JUNTO
// com o erro, as páginas que já tinham chegado. O consumidor anterior ignorava o
// `error` e seguia com esse conteúdo parcial. Uma falha na 3ª de 12 páginas
// produzia, então, uma página de estatísticas inteira menor do que a realidade —
// e sem nenhum aviso, o que é pior do que não mostrar nada: o aluno tomaria
// decisão de estudo sobre números errados achando que estavam certos.
//
// A regra, portanto: consulta que falha não devolve linha nenhuma, nem mesmo as
// que chegaram. `[]` passa a significar só uma coisa — o banco respondeu e não
// existe sessão registrada.
//
// Este módulo é puro de propósito (nenhum acesso a banco, nenhum contexto de
// requisição do Next), para que a decisão possa ser testada por comportamento.
// ============================================================================

import { sanitizeSession, type SessionRecord } from "./engine/stats-engine"

/** O que o paginador (`fetchAllPagesInParallel`) devolve. */
export interface PagedReadResult {
  data: Record<string, unknown>[]
  error: { message: string } | null
}

/** Uma linha de `study_history` (com o join de disciplina) → `SessionRecord`. */
export function mapSessionRow(row: Record<string, unknown>): SessionRecord | null {
  const disc = Array.isArray(row["disciplines"]) ? row["disciplines"][0] : row["disciplines"]
  const meta = (row["metadata"] as Record<string, unknown> | null) ?? null
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
    pages_read: meta?.["pages_read"],
    questions_answered: meta?.["questions_answered"],
    questions_correct: meta?.["questions_correct"],
    flashcards_reviewed: meta?.["flashcards_reviewed"],
    topic_name: meta?.["topic_name"],
    focus_percentage: meta?.["focus_percentage"],
  }, !!row["origin_source"])
}

/**
 * Converte o resultado da leitura paginada em sessões.
 *
 * - consulta falhou (mesmo com páginas já lidas) → `null`, o estado de erro;
 * - consulta respondeu → as sessões válidas, e `[]` quando não há nenhuma.
 *
 * Linhas inválidas (sem `started_at` utilizável) continuam sendo descartadas
 * individualmente: isso é higiene de dado, não falha de leitura.
 */
export function toStudySessions(result: PagedReadResult): SessionRecord[] | null {
  if (result.error) return null
  return result.data.map(mapSessionRow).filter((s): s is SessionRecord => s !== null)
}
