"use server"

import { revalidatePath } from "next/cache"
import type { ReviewCardReveal, ReviewDashboardData, ReviewFilters, ReviewItem, ReviewReport, ReviewSettings } from "@/domain/reviews/models"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"
import type { AnswerResult, CardDraft, ImportCardRow, SessionResult } from "./review.service"
import {
  answerReviewCard,
  buildRevealPayload,
  buildSessionReport,
  createFlashcard,
  createReviewSession,
  discardReviewSession,
  duplicateFlashcard,
  exportFlashcards,
  finalizeSession,
  generateCardDrafts,
  getActiveReviewSession,
  getOrCreateSettings,
  getReviewDashboardSummary,
  importFlashcards,
  nowIso,
  searchFlashcards,
  softDeleteFlashcard,
  toggleFlashcardFlag,
  updateFlashcard,
} from "./review.service"

type Supabase = Awaited<ReturnType<typeof createClient>>

async function requireUser(supabase: Supabase): Promise<{ user: { id: string } } | { user: null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null }
  return { user: { id: user.id } }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function getReviewDashboardAction(): Promise<{ data: ReviewDashboardData | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const data = await getReviewDashboardSummary(supabase, user.id)
    return { data, error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

// ─── Sessões ─────────────────────────────────────────────────────────────────

export async function startReviewSessionAction(filters: ReviewFilters): Promise<SessionResult> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }

    const existing = await getActiveReviewSession(supabase, user.id)
    if (existing.data) {
      return { data: null, error: "Você possui uma revisão em andamento. Finalize ou descarte antes de iniciar outra." }
    }

    const result = await createReviewSession(supabase, user.id, filters)
    revalidatePath("/dashboard/reviews")
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function getActiveReviewSessionAction(): Promise<SessionResult> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await getActiveReviewSession(supabase, user.id)
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function revealReviewCardAction(reviewItemId: string): Promise<{ data: ReviewCardReveal | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await buildRevealPayload(supabase, user.id, reviewItemId)
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function answerReviewCardAction(
  sessionId: string,
  reviewItemId: string,
  grade: 1 | 2 | 3 | 4,
  responseTimeSeconds: number
): Promise<{ data: AnswerResult | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const result = await answerReviewCard(supabase, user.id, sessionId, reviewItemId, grade, responseTimeSeconds)
    revalidatePath("/dashboard/reviews")
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function discardReviewSessionAction(sessionId: string): Promise<{ data: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: false, error: "Não autenticado." }
    await discardReviewSession(supabase, user.id, sessionId)
    revalidatePath("/dashboard/reviews")
    return { data: true, error: null }
  } catch (err: unknown) {
    return { data: false, error: errorMessage(err) }
  }
}

/** Finaliza manualmente (fim da fila / sair no meio é tratado pela própria sessão). */
export async function finalizeReviewSessionAction(sessionId: string): Promise<{ data: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: false, error: "Não autenticado." }
    const { data: sessionRow } = await supabase.from("review_sessions").select("*").eq("id", sessionId).eq("user_id", user.id).maybeSingle()
    if (!sessionRow) return { data: false, error: "Sessão não encontrada." }
    const answeredIds = sessionRow["answered_ids"] as string[] | null ?? []
    await finalizeSession(supabase, user.id, sessionId, answeredIds)
    revalidatePath("/dashboard/reviews")
    return { data: true, error: null }
  } catch (err: unknown) {
    return { data: false, error: errorMessage(err) }
  }
}

export async function getSessionReportAction(sessionId: string): Promise<{ data: ReviewReport | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return { data: await buildSessionReport(supabase, user.id, sessionId), error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

// ─── Settings / presets ──────────────────────────────────────────────────────

export async function getReviewSettingsAction(): Promise<{ data: ReviewSettings | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return { data: await getOrCreateSettings(supabase, user.id), error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function updateReviewSettingsAction(input: Partial<ReviewSettings>): Promise<{ data: ReviewSettings | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }

    const current = await getOrCreateSettings(supabase, user.id)
    const merged: ReviewSettings = { ...current, ...input, user_id: user.id }

    const retention = Math.min(0.95, Math.max(0.8, merged.desired_retention))
    const newPerDay = Math.min(100, Math.max(1, Math.round(merged.new_cards_per_day)))
    const maxReviews = Math.min(1000, Math.max(1, Math.round(merged.max_reviews_per_day)))
    const maxMinutes = merged.max_daily_minutes === null ? null : Math.min(600, Math.max(5, Math.round(merged.max_daily_minutes)))

    const update = {
      new_cards_per_day: newPerDay,
      max_reviews_per_day: maxReviews,
      desired_retention: Math.round(retention * 1000) / 1000,
      max_daily_minutes: maxMinutes,
      review_profile: merged.review_profile,
      exam_date: merged.exam_date || null,
      reta_final: merged.reta_final === true,
      auto_add_errors: merged.auto_add_errors !== false,
      updated_at: nowIso(),
    }

    const { error } = await supabase.from("review_settings").update(update).eq("user_id", user.id)
    if (error) return { data: null, error: error.message ?? "Erro ao salvar configurações." }

    const persisted = await getOrCreateSettings(supabase, user.id)
    revalidatePath("/dashboard/reviews")
    return { data: persisted, error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

// ─── Flashcards / biblioteca ─────────────────────────────────────────────────

export interface FlashcardCreateInput {
  disciplineId: string
  topicId?: string | null
  cardType?: ReviewItem["card_type"]
  front: string
  back: string
  tags?: string[]
}

export async function createFlashcardAction(input: FlashcardCreateInput): Promise<{ data: ReviewItem | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const result = await createFlashcard(supabase, user.id, input)
    revalidatePath("/dashboard/reviews")
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function updateFlashcardAction(
  id: string,
  patch: { disciplineId?: string; topicId?: string | null; cardType?: ReviewItem["card_type"]; front?: string; back?: string; tags?: string[] }
): Promise<{ data: ReviewItem | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const result = await updateFlashcard(supabase, user.id, id, patch)
    revalidatePath("/dashboard/reviews")
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function deleteFlashcardAction(id: string): Promise<{ data: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: false, error: "Não autenticado." }
    const { error } = await softDeleteFlashcard(supabase, user.id, id)
    revalidatePath("/dashboard/reviews")
    return { data: !error, error }
  } catch (err: unknown) {
    return { data: false, error: errorMessage(err) }
  }
}

export async function setFlashcardFlagAction(id: string, field: "is_favorite" | "is_suspended", value: boolean): Promise<{ data: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: false, error: "Não autenticado." }
    const { error } = await toggleFlashcardFlag(supabase, user.id, id, field, value)
    revalidatePath("/dashboard/reviews")
    return { data: !error, error }
  } catch (err: unknown) {
    return { data: false, error: errorMessage(err) }
  }
}

export async function duplicateFlashcardAction(id: string): Promise<{ data: ReviewItem | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const result = await duplicateFlashcard(supabase, user.id, id)
    revalidatePath("/dashboard/reviews")
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export interface FlashcardSearchInput {
  q?: string | null
  disciplineId?: string | null
  topicId?: string | null
  stage?: ReviewItem["review_stage"] | "SUSPENDED" | "ALL" | null
  tag?: string | null
  page?: number
  pageSize?: number
}

export async function searchFlashcardsAction(search: FlashcardSearchInput): Promise<{ data: { cards: ReviewItem[]; total: number } | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await searchFlashcards(supabase, user.id, search)
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

// ─── IA / importar / exportar ────────────────────────────────────────────────

export async function generateFlashcardDraftsAction(disciplineId: string, topicId: string | null, count = 5): Promise<{ data: CardDraft[] | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await generateCardDrafts(supabase, user.id, disciplineId, topicId, count)
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function importFlashcardsAction(rows: ImportCardRow[]): Promise<{ data: { imported: number; skipped: number; total: number; message?: string } | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const result = await importFlashcards(supabase, user.id, rows)
    revalidatePath("/dashboard/reviews")
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function exportFlashcardsAction(): Promise<{ data: ImportCardRow[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await exportFlashcards(supabase, user.id)
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

/** Disciplinas + tópicos para formulários (criação/filtros) — fonte real user_disciplines. */
export async function getReviewFormOptionsAction(): Promise<{
  data: { disciplines: { id: string; name: string; area: string | null }[]; topics: { id: string; disciplineId: string; name: string }[] } | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { user } = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }

    const [userDiscs, allTopics] = await Promise.all([
      supabase.from("user_disciplines").select("discipline_id, disciplines ( id, name, area )").eq("user_id", user.id),
      supabase.from("question_topics").select("id, discipline_id, name").order("name").limit(10000),
    ])
    const discIds = new Set<string>()
    const disciplines: { id: string; name: string; area: string | null }[] = []
    ;(userDiscs.data ?? []).forEach((r) => {
      const disc = r["disciplines"]
      const row = disc && typeof disc === "object" && !Array.isArray(disc) ? (disc as unknown as Record<string, unknown>) : null
      let id = ""
      if (row) id = String(row["id"])
      else if (r["discipline_id"] !== null && r["discipline_id"] !== undefined) id = String(r["discipline_id"])
      const name = row ? String(row["name"] ?? "Disciplina") : "Disciplina"
      const area = row && row["area"] !== null && row["area"] !== undefined ? String(row["area"]) : null
      if (!id) return
      discIds.add(id)
      disciplines.push({ id, name, area })
    })
    disciplines.sort((a, b) => a.name.localeCompare(b.name))

    const topics: { id: string; disciplineId: string; name: string }[] = (allTopics.data ?? [])
      .filter((t) => discIds.has(String(t["discipline_id"])))
      .map((t) => ({ id: String(t["id"]), disciplineId: String(t["discipline_id"]), name: String(t["name"] ?? "") }))

    return { data: { disciplines, topics }, error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro inesperado."
}