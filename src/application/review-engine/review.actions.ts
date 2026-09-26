"use server"

// ============================================================================
// Server Actions de Revisões. Nenhuma action aceita userId do cliente: o dono é
// sempre derivado no servidor (getEffectiveUserId), e a RLS é a segunda barreira.
// ============================================================================

import { revalidatePath } from "next/cache"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { invalidateStatisticsCenterCache } from "@/application/study-analytics/statistics-center.action"
import { HISTORY_PATHS } from "@/application/study-history/study-history.constants"
import { isReviewGrade, isReviewSourceType } from "@/domain/reviews/models"
import type {
  ReviewItemView,
  ReviewSessionReport,
  ReviewSessionState,
  ReviewsOverview,
} from "@/domain/reviews/models"
import { createClient } from "@/infrastructure/supabase/server"
import { isMaintenanceMode } from "@/lib/maintenance"

import {
  addEditalContentToReview,
  answerReviewCard,
  discardReviewSession,
  finishReviewSession,
  getActiveReviewSession,
  getReviewCatalog,
  getReviewsOverview,
  setReviewItemFlag,
  startReviewSession,
  type ReviewCatalogTopic,
  type ReviewItemFlagAction,
} from "./review.service"

const REVIEWS_PATH = "/dashboard/reviews"

type Supabase = Awaited<ReturnType<typeof createClient>>

async function requireUser(supabase: Supabase): Promise<{ id: string } | null> {
  const effectiveUserId = await getEffectiveUserId(supabase)
  return effectiveUserId ? { id: effectiveUserId } : null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erro inesperado."
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export async function getReviewsOverviewAction(): Promise<{
  data: ReviewsOverview | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const data = await getReviewsOverview(supabase, user.id, new Date().toISOString())
    return { data, error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function getReviewCatalogAction(disciplineId?: string | null): Promise<{
  data: {
    disciplines: { id: string; name: string }[]
    disciplineId: string | null
    topics: ReviewCatalogTopic[]
    /** Fase I.6: a leitura do catálogo falhou — não é "sem disciplinas". */
    loadError: boolean
  } | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    const data = await getReviewCatalog(supabase, user.id, disciplineId ?? null)
    return { data, error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

// ─── Adicionar à revisão ─────────────────────────────────────────────────────

export async function addTopicToReviewAction(input: {
  sourceType: string
  sourceId: string
}): Promise<{ data: { item: ReviewItemView | null; alreadyExisted: boolean } | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    if (!isReviewSourceType(input.sourceType)) return { data: null, error: "Tipo de conteúdo inválido." }
    if (!input.sourceId) return { data: null, error: "Conteúdo não informado." }

    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }

    const result = await addEditalContentToReview(
      supabase,
      user.id,
      input.sourceType,
      input.sourceId,
      new Date().toISOString(),
    )
    if (result.error) return { data: null, error: result.error }
    revalidatePath(REVIEWS_PATH)
    return { data: { item: result.item, alreadyExisted: result.alreadyExisted }, error: null }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function setReviewItemFlagAction(
  itemId: string,
  action: ReviewItemFlagAction,
): Promise<{ data: boolean; error: string | null }> {
  if (isMaintenanceMode()) return { data: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: false, error: "Não autenticado." }
    const result = await setReviewItemFlag(supabase, user.id, itemId, action)
    if (!result.ok) return { data: false, error: result.error }
    revalidatePath(REVIEWS_PATH)
    return { data: true, error: null }
  } catch (err: unknown) {
    return { data: false, error: errorMessage(err) }
  }
}

// ─── Sessão ──────────────────────────────────────────────────────────────────

export async function startReviewSessionAction(
  itemId?: string | null,
): Promise<{ data: ReviewSessionState | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await startReviewSession(supabase, user.id, { itemId: itemId ?? null })
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function getActiveReviewSessionAction(): Promise<{
  data: ReviewSessionState | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }
    return await getActiveReviewSession(supabase, user.id)
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function answerReviewCardAction(input: {
  sessionId: string
  itemId: string
  grade: number
  durationSeconds: number
  clientOperationId: string
}): Promise<{
  data: { session: ReviewSessionState | null; duplicate: boolean; conflict: boolean } | null
  error: string | null
}> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    if (!isReviewGrade(input.grade)) return { data: null, error: "Nota inválida." }
    if (!input.clientOperationId) return { data: null, error: "Operação sem identificador." }

    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }

    const outcome = await answerReviewCard(supabase, user.id, {
      sessionId: input.sessionId,
      itemId: input.itemId,
      grade: input.grade,
      durationSeconds: input.durationSeconds,
      clientOperationId: input.clientOperationId,
    })
    if (outcome.error) return { data: null, error: outcome.error }
    return {
      data: { session: outcome.session, duplicate: outcome.duplicate, conflict: outcome.conflict },
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

/**
 * Encerra a sessão. finalizeSession pode gravar study_history (o tempo da
 * revisão conta como estudo), então aqui revalidamos as mesmas rotas de
 * qualquer mutação do Histórico e invalidamos o cache de Estatísticas.
 */
export async function finalizeReviewSessionAction(
  sessionId: string,
): Promise<{ data: ReviewSessionReport | null; error: string | null }> {
  if (isMaintenanceMode()) return { data: null, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: null, error: "Não autenticado." }

    const result = await finishReviewSession(supabase, user.id, sessionId)
    for (const path of HISTORY_PATHS) revalidatePath(path)
    await invalidateStatisticsCenterCache(user.id)
    revalidatePath(REVIEWS_PATH)
    return result
  } catch (err: unknown) {
    return { data: null, error: errorMessage(err) }
  }
}

export async function discardReviewSessionAction(
  sessionId: string,
): Promise<{ data: boolean; error: string | null }> {
  if (isMaintenanceMode()) return { data: false, error: "Sistema temporariamente indisponível." }
  try {
    const supabase = await createClient()
    const user = await requireUser(supabase)
    if (!user) return { data: false, error: "Não autenticado." }
    const { discarded } = await discardReviewSession(supabase, user.id, sessionId)
    revalidatePath(REVIEWS_PATH)
    return { data: discarded, error: null }
  } catch (err: unknown) {
    return { data: false, error: errorMessage(err) }
  }
}
