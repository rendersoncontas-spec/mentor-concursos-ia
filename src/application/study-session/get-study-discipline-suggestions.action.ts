"use server"

import * as Sentry from "@sentry/nextjs"
import { type SupabaseClient } from "@supabase/supabase-js"

import { getEffectiveUserId } from "@/application/admin/auth-guard"
import { buildCycleOverview } from "@/application/study-cycle/cycle-progress.service"
import { fetchAllCycleSessions } from "@/application/study-cycle/cycle-sessions.reader"
import { fetchActivePlanDisciplines } from "@/application/study-session/get-disciplines.action"
import { createClient } from "@/infrastructure/supabase/server"
import type {
  StudyCycle,
  StudyCycleItemWithDetails,
  StudyCycleSession,
} from "@/domain/study-cycle/study-cycle.types"

export type DisciplineSuggestion = {
  id: string
  name: string
  area: string | null
  color_hex?: string | null | undefined
  from: "PLAN" | "CYCLE" | "HISTORY"
  metadata?: {
    plannedMinutes?: number | undefined
    studiedMinutes?: number | undefined
    difficulty?: string | undefined
    isCurrentInCycle?: boolean | undefined
    isNextInCycle?: boolean | undefined
    lastSessionAt?: string | undefined
  }
}

export type DisciplineSuggestionsResult = {
  /** "PLAN" = planejamento ativo, "CYCLE" = ciclo ativo, "HISTORY" = últimos 30 dias, "NONE" = vazio */
  source: "PLAN" | "CYCLE" | "HISTORY" | "NONE"
  suggestions: DisciplineSuggestion[]
}

/**
 * PRIORIDADE 2 — Busca o ciclo de estudos ATIVO do usuário.
 * Retorna TODAS as matérias do ciclo, com a atual em primeiro.
 */
async function fetchActiveCycleDisciplines(
  supabase: SupabaseClient,
  userId: string
): Promise<DisciplineSuggestion[]> {
  const { data: cycle, error } = await supabase
    .from("study_cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !cycle) return []

  const { data: items } = await supabase
    .from("study_cycle_items")
    .select("*, discipline:disciplines(id, name, area, color_hex)")
    .eq("cycle_id", cycle.id)
    .order("order", { ascending: true })

  if (!items || items.length === 0) return []

  // Fase F.1: leitura paginada de study_cycle_sessions (antes cortada em 1.000).
  const { data: sessions } = await fetchAllCycleSessions(supabase, { cycleId: cycle.id })

  const { data: skipRows } = await supabase
    .from("study_cycle_item_skips")
    .select("cycle_item_id")
    .eq("cycle_id", cycle.id)
    .eq("round_number", cycle.current_round || 1)

  const typedCycle = cycle as unknown as StudyCycle
  const typedItems = items as unknown as StudyCycleItemWithDetails[]
  const typedSessions = (sessions || []) as unknown as StudyCycleSession[]
  const skippedItemIds = new Set((skipRows || []).map((row) => row.cycle_item_id as string))

  // Usa o serviço oficial que respeita o cursor persistido (current_item_index / current_round)
  const overview = buildCycleOverview(typedCycle, typedItems, typedSessions, skippedItemIds)

  if (!overview.items || overview.items.length === 0) return []

  const currentItem = overview.currentItem
  const currentIndex = currentItem
    ? overview.items.findIndex((it) => it.itemId === currentItem.itemId)
    : 0

  const orderedItems =
    currentIndex >= 0
      ? [
          ...overview.items.slice(currentIndex),
          ...overview.items.slice(0, currentIndex),
        ]
      : overview.items

  const seen = new Set<string>()
  const suggestions: DisciplineSuggestion[] = []

  for (const item of orderedItems) {
    if (seen.has(item.disciplineId)) continue
    seen.add(item.disciplineId)

    suggestions.push({
      id: item.disciplineId,
      name: item.disciplineName,
      area: item.disciplineArea,
      color_hex: item.disciplineColorHex,
      from: "CYCLE",
      metadata: {
        plannedMinutes: item.plannedMinutes,
        studiedMinutes: item.studiedMinutesInRound,
        difficulty: item.difficulty,
        isCurrentInCycle: item.isCurrent,
        isNextInCycle: !item.isCurrent,
      },
    })
  }

  return suggestions
}

/**
 * PRIORIDADE 3 — Busca disciplinas realmente utilizadas em sessões de estudo
 * nos últimos 30 dias (janela temporal real, não "últimas N linhas").
 * Ordena pela atividade mais recente e remove duplicatas.
 */
async function fetchRecentHistoryDisciplines(
  supabase: SupabaseClient,
  userId: string
): Promise<DisciplineSuggestion[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const { data: history, error } = await supabase
    .from("study_history")
    .select("id, discipline_id, started_at, disciplines(id, name, area, color_hex)")
    .eq("user_id", userId)
    .gte("started_at", thirtyDaysAgo.toISOString())
    .order("started_at", { ascending: false })
    .limit(200)

  if (error || !history || history.length === 0) return []

  const seen = new Set<string>()
  const suggestions: DisciplineSuggestion[] = []

  for (const row of history) {
    const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
    if (!disc?.id || !disc?.name) continue
    if (seen.has(disc.id)) continue
    seen.add(disc.id)

    suggestions.push({
      id: disc.id,
      name: disc.name,
      area: disc.area ?? null,
      color_hex: disc.color_hex ?? null,
      from: "HISTORY",
      metadata: {
        lastSessionAt: row.started_at,
      },
    })
  }

  return suggestions
}

/**
 * Função serviço pura que decide a origem das sugestões com hierarquia:
 *   1. PLANEJAMENTO ativo (se tiver disciplinas)
 *   2. CICLO de estudos ativo (matéria atual + próximas)
 *   3. HISTÓRICO dos últimos 30 dias (atividades reais)
 *   4. VAZIO (seleção manual)
 *
 * As fontes NUNCA são misturadas. Consultas seguem a prioridade:
 * se o planejamento tem disciplinas, ciclo/histórico não são consultados.
 */
export async function fetchStudyDisciplineSuggestions(
  supabase: SupabaseClient,
  userId: string
): Promise<DisciplineSuggestionsResult> {
  try {
    // PRIORIDADE 1: Planejamento ativo (service puro já existente)
    const planResult = await fetchActivePlanDisciplines(supabase, userId)
    if (planResult.hasActivePlan && planResult.disciplines.length > 0) {
      return {
        source: "PLAN",
        suggestions: planResult.disciplines.map((d) => ({
          id: d.id,
          name: d.name,
          area: d.area,
          color_hex: d.color_hex,
          from: "PLAN" as const,
        })),
      }
    }

    // PRIORIDADE 2: Ciclo de estudos ativo
    const cycleSuggestions = await fetchActiveCycleDisciplines(supabase, userId)
    if (cycleSuggestions.length > 0) {
      return { source: "CYCLE", suggestions: cycleSuggestions }
    }

    // PRIORIDADE 3: Histórico dos últimos 30 dias
    const historySuggestions = await fetchRecentHistoryDisciplines(supabase, userId)
    if (historySuggestions.length > 0) {
      return { source: "HISTORY", suggestions: historySuggestions }
    }

    // PRIORIDADE 4: Nenhuma sugestão
    return { source: "NONE", suggestions: [] }
  } catch (error) {
    console.error("[fetchStudyDisciplineSuggestions] Exceção:", error)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { feature: "study-discipline-suggestions" },
    })
    return { source: "NONE", suggestions: [] }
  }
}

/**
 * Server Action pública usada pelo Centro Inteligente de Estudos.
 */
export async function getStudyDisciplineSuggestions(): Promise<DisciplineSuggestionsResult> {
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)
    if (!effectiveUserId) return { source: "NONE", suggestions: [] }
    return await fetchStudyDisciplineSuggestions(supabase, effectiveUserId)
  } catch (error) {
    console.error("[getStudyDisciplineSuggestions] Exceção:", error)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { feature: "study-discipline-suggestions" },
    })
    return { source: "NONE", suggestions: [] }
  }
}
