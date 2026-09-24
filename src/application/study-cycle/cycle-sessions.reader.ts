import type { SupabaseClient } from "@supabase/supabase-js"

import { fetchAllPagesInParallel, type PageResult } from "@/lib/parallel-pagination"

/**
 * Fase F.1 — leitura COMPLETA de `study_cycle_sessions`.
 *
 * Antes, as leituras de sessões do ciclo eram uma única requisição sem
 * paginação. O PostgREST devolve no máximo 1.000 linhas por requisição (e esse
 * limite deve continuar existindo como proteção — NÃO aumentar o limite
 * global). O ciclo ativo do usuário principal já tinha 933 sessões: ao passar
 * de 1.000, as linhas excedentes seriam descartadas em silêncio e o progresso,
 * o tempo estudado e as marcações de skip da volta atual ficariam errados.
 *
 * Aqui a leitura é paginada com ordenação determinística por `id` (chave
 * primária, única): nenhuma linha se repete nem se perde entre páginas. A
 * matemática do ciclo (buildCycleOverview) não muda — ela recebe exatamente
 * o mesmo conjunto de sessões, só que agora completo.
 *
 * Semântica de erro preservada: antes, se a leitura falhasse, `data` vinha
 * `null` e o chamador usava `[]`. Aqui, qualquer página com erro devolve
 * `data: []` + `error` (nunca um conjunto parcial, que produziria números
 * errados de forma silenciosa).
 */

export const CYCLE_SESSIONS_PAGE_SIZE = 1000

export type CycleSessionsScope = { cycleId: string } | { cycleIds: readonly string[] }

export async function fetchAllCycleSessions<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  scope: CycleSessionsScope,
  select = "*",
): Promise<{ data: T[]; error: { message: string } | null }> {
  if ("cycleIds" in scope && scope.cycleIds.length === 0) return { data: [], error: null }

  const { data, error } = await fetchAllPagesInParallel<T>(
    (from, to, withCount) => {
      const base = supabase
        .from("study_cycle_sessions")
        .select(select, withCount ? { count: "exact" } : undefined)
      const filtered = "cycleId" in scope ? base.eq("cycle_id", scope.cycleId) : base.in("cycle_id", [...scope.cycleIds])
      return filtered.order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<PageResult<T>>
    },
    { pageSize: CYCLE_SESSIONS_PAGE_SIZE, perfLabel: "study_cycle_sessions" },
  )

  if (error) {
    console.error("[study_cycle_sessions] Erro na leitura paginada:", error.message)
    return { data: [], error }
  }
  return { data, error: null }
}
