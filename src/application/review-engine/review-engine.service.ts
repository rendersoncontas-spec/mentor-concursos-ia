// ============================================================================
// Resumo de pendências para o Dashboard principal (/dashboard).
// Mantido como ponto único de integração do KPI "Revisões pendentes" —
// revisado no Sprint 14 para usar dados reais de review_items (FSRS),
// sem dependência da fila review_queue (nunca populada).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js"

export interface PendingReviewsSummary {
  count: number
  overdue: number
  today: number
  highPriority: number
  nextReview: string | null
}

export async function getPendingReviewsSummary(supabase: SupabaseClient, userId: string): Promise<PendingReviewsSummary> {
  const nowStr = new Date().toISOString()
  const todayStr = nowStr.slice(0, 10)

  const { data: rows } = await supabase
    .from("review_items")
    .select("next_review_at, lapses_count, difficulty")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("is_suspended", false)

  let count = 0
  let overdue = 0
  let today = 0
  let highPriority = 0
  let nextReview: string | null = null

  ;(rows ?? []).forEach((r) => {
    if (!r.next_review_at) return
    const due = new Date(String(r.next_review_at))
    if (due.getTime() > Date.now()) {
      if (!nextReview || due < new Date(nextReview)) nextReview = String(r.next_review_at)
      return
    }
    count++
    if (due.toISOString().slice(0, 10) === todayStr) today++
    else overdue++
    const difficulty = Number(r.difficulty ?? 4.93)
    const lapses = Number(r.lapses_count ?? 0)
    if (difficulty >= 7.5 || lapses >= 3) highPriority++
  })

  return { count, overdue, today, highPriority, nextReview }
}