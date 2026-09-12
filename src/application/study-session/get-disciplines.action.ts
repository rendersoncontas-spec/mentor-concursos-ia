"use server"

import * as Sentry from "@sentry/nextjs"
import { type SupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/infrastructure/supabase/server"
import { buildCycleOverview } from "@/application/study-cycle/cycle-progress.service"

export type DisciplineOption = {
  id: string
  name: string
  area: string | null
  color_hex?: string | null
  fromPlan: boolean
}

type RawPlanItem = {
  id: string
  discipline_id: string
  day_of_week: number
  duration_minutes: number
  priority: number | null
  priority_score: number | null
  created_at: string
  disciplines:
    | {
        id: string
        name: string
        area: string | null
        color_hex: string | null
      }
    | {
        id: string
        name: string
        area: string | null
        color_hex: string | null
      }[]
    | null
}

/**
 * Função de serviço pura para buscar disciplinas pertencentes ao planejamento ATIVO do usuário.
 *
 * Regras:
 * - Apenas o plano com `user_id = userId` e `active = true` (mais recente).
 * - Retorna exclusivamente as disciplinas vinculadas aos itens (`study_plan_items`) desse plano.
 * - Preserva a ordem de prioridade / sequência do planejamento.
 * - NÃO utiliza histórico de sessões, importações avulsas, planos arquivados ou user_disciplines genérico.
 * - Deduplica por `discipline_id`.
 */
export async function fetchActivePlanDisciplines(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  hasActivePlan: boolean
  planId: string | null
  planName: string | null
  disciplines: DisciplineOption[]
}> {
  try {
    // 1. Buscar o planejamento ativo atual do usuário
    const { data: activePlan, error: planError } = await supabase
      .from("study_plans")
      .select("id, name, version, plan_type, active, status")
      .eq("user_id", userId)
      .eq("active", true)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (planError) {
      console.error("[fetchActivePlanDisciplines] Erro ao buscar plano ativo:", planError)
      Sentry.captureException(planError, {
        tags: { feature: "discipline-selector" },
        extra: { userId },
      })
      return { hasActivePlan: false, planId: null, planName: null, disciplines: [] }
    }

    if (!activePlan) {
      return { hasActivePlan: false, planId: null, planName: null, disciplines: [] }
    }

    // 2. Buscar itens do plano ativo vinculados a disciplinas reais
    const { data: planItems, error: itemsError } = await supabase
      .from("study_plan_items")
      .select(
        `
        id,
        discipline_id,
        day_of_week,
        duration_minutes,
        priority,
        priority_score,
        created_at,
        disciplines:disciplines (
          id,
          name,
          area,
          color_hex
        )
      `,
      )
      .eq("study_plan_id", activePlan.id)
      .order("day_of_week", { ascending: true })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })

    if (itemsError) {
      console.error("[fetchActivePlanDisciplines] Erro ao buscar itens do plano ativo:", itemsError)
      Sentry.captureException(itemsError, {
        tags: { feature: "discipline-selector" },
        extra: { planId: activePlan.id, userId },
      })
      return {
        hasActivePlan: true,
        planId: activePlan.id,
        planName: activePlan.name,
        disciplines: [],
      }
    }

    const rawList = (planItems ?? []) as unknown as RawPlanItem[]

    // 3. Deduplicar por discipline_id e preservar ranking/ordem do planejamento ativo
    const disciplineMap = new Map<
      string,
      {
        disc: DisciplineOption
        priorityScore: number
        firstOrderIndex: number
      }
    >()

    let orderCounter = 0
    for (const item of rawList) {
      const discData = Array.isArray(item.disciplines) ? item.disciplines[0] : item.disciplines
      if (!discData || !discData.id) continue

      const discId = discData.id
      const score =
        typeof item.priority_score === "number"
          ? item.priority_score
          : Number(item.priority_score) || 0

      if (!disciplineMap.has(discId)) {
        disciplineMap.set(discId, {
          disc: {
            id: discData.id,
            name: discData.name,
            area: discData.area ?? null,
            color_hex: discData.color_hex ?? null,
            fromPlan: true,
          },
          priorityScore: score,
          firstOrderIndex: orderCounter++,
        })
      } else {
        const existing = disciplineMap.get(discId)
        if (existing && score > existing.priorityScore) {
          existing.priorityScore = score
        }
      }
    }

    const planDisciplines = Array.from(disciplineMap.values())
      .map((entry) => entry.disc)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))

    return {
      hasActivePlan: true,
      planId: activePlan.id,
      planName: activePlan.name,
      disciplines: planDisciplines,
    }
  } catch (error: unknown) {
    console.error("[fetchActivePlanDisciplines] Exceção:", error)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { feature: "discipline-selector" },
    })
    return { hasActivePlan: false, planId: null, planName: null, disciplines: [] }
  }
}

import { getEffectiveUserId } from "@/application/admin/auth-guard"

/**
 * Server Action para buscar as disciplinas do plano ativo do usuário autenticado.
 */
export async function getActivePlanDisciplines(): Promise<{
  hasActivePlan: boolean
  planId: string | null
  planName: string | null
  disciplines: DisciplineOption[]
}> {
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)

    if (!effectiveUserId) {
      return { hasActivePlan: false, planId: null, planName: null, disciplines: [] }
    }

    return await fetchActivePlanDisciplines(supabase, effectiveUserId)
  } catch (error: unknown) {
    console.error("[getActivePlanDisciplines] Exceção:", error)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { feature: "discipline-selector" },
    })
    return { hasActivePlan: false, planId: null, planName: null, disciplines: [] }
  }
}

/**
 * Server Action para buscar disciplinas para o autocomplete do modal de estudo.
 * Retorna:
 * - hasActivePlan: booleano indicando se o usuário possui planejamento ativo
 * - planDisciplines: disciplinas do plano ativo do usuário (ordenadas por prioridade/ordem do plano)
 * - allDisciplines: catálogo global completo de disciplinas do banco
 */
export async function getDisciplinesForAutocomplete(): Promise<{
  hasActivePlan: boolean
  planDisciplines: DisciplineOption[]
  allDisciplines: DisciplineOption[]
}> {
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)

    if (!effectiveUserId) {
      return { hasActivePlan: false, planDisciplines: [], allDisciplines: [] }
    }

    // 1. Buscar disciplinas do plano ativo via service puro
    const planResult = await fetchActivePlanDisciplines(supabase, effectiveUserId)

    // 2. Buscar todas as disciplinas globais do catálogo do banco
    const { data: allDiscs, error: allDiscsError } = await supabase
      .from("disciplines")
      .select("id, name, area, color_hex")
      .order("name", { ascending: true })
      .limit(300)

    if (allDiscsError) {
      console.error(
        "[getDisciplinesForAutocomplete] Erro ao buscar catálogo de disciplinas:",
        allDiscsError,
      )
      Sentry.captureException(allDiscsError, {
        tags: { feature: "discipline-selector" },
      })
    }

    const allDisciplines: DisciplineOption[] = (allDiscs || []).map((d) => ({
      id: d.id,
      name: d.name,
      area: d.area ?? null,
      color_hex: d.color_hex ?? null,
      fromPlan: false,
    }))

    return {
      hasActivePlan: planResult.hasActivePlan,
      planDisciplines: planResult.disciplines,
      allDisciplines,
    }
  } catch (error: unknown) {
    console.error("[getDisciplinesForAutocomplete] Exceção:", error)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { feature: "discipline-selector" },
    })
    return { hasActivePlan: false, planDisciplines: [], allDisciplines: [] }
  }
}

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

export type StudyCenterData = {
  hasActivePlan: boolean
  planDisciplines: DisciplineOption[]
  allDisciplines: DisciplineOption[]
  suggestionsSource: "PLAN" | "CYCLE" | "HISTORY" | "NONE"
  suggestions: DisciplineSuggestion[]
}

/**
 * Server Action ÚNICA para o Centro Inteligente de Estudos.
 *
 * Substitui a chamada dupla de getDisciplinesForAutocomplete + getStudyDisciplineSuggestions
 * por uma única chamada com:
 *   - 1 Supabase client (não 2)
 *   - 1 auth check (não 2)
 *   - Queries independentes em paralelo (não sequenciais)
 *   - Sem duplicação de fetchActivePlanDisciplines
 *
 * Fluxo otimizado:
 *   1. Auth (1×)
 *   2. Paralelo: [plano + disciplinas_globais]  ← 2 queries simultâneas
 *   3. Se tem plano → sugestões = plano (sem query extra)
 *   4. Se não tem plano → paralelo: [ciclo, histórico]  ← 2 queries simultâneas
 *   5. Retorna tudo junto
 *
 * Total: 3-4 queries (vs 6-8 antes).
 */
export async function getStudyCenterData(): Promise<StudyCenterData> {
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    const effectiveUserId = await getEffectiveUserId(supabase)

    if (!effectiveUserId) {
      return {
        hasActivePlan: false,
        planDisciplines: [],
        allDisciplines: [],
        suggestionsSource: "NONE",
        suggestions: [],
      }
    }

    // FASE 1: Paralelo — plano ativo + catálogo global (2 queries simultâneas)
    const [planResult, allDiscsResult] = await Promise.all([
      fetchActivePlanDisciplines(supabase, effectiveUserId),
      supabase
        .from("disciplines")
        .select("id, name, area, color_hex")
        .order("name", { ascending: true })
        .limit(300),
    ])

    const allDisciplines: DisciplineOption[] = (allDiscsResult.data || []).map((d) => ({
      id: d.id,
      name: d.name,
      area: d.area ?? null,
      color_hex: d.color_hex ?? null,
      fromPlan: false,
    }))

    // FASE 2: Se tem plano ativo com disciplinas → sugestões = plano (zero queries extras)
    if (planResult.hasActivePlan && planResult.disciplines.length > 0) {
      console.log(
        `[getStudyCenterData] ${Date.now() - t0}ms — plano ativo, ${planResult.disciplines.length} sugestões`,
      )
      return {
        hasActivePlan: true,
        planDisciplines: planResult.disciplines,
        allDisciplines,
        suggestionsSource: "PLAN",
        suggestions: planResult.disciplines.map((d) => ({
          id: d.id,
          name: d.name,
          area: d.area,
          color_hex: d.color_hex,
          from: "PLAN" as const,
        })),
      }
    }

    // FASE 3: Sem plano — buscar ciclo e histórico em paralelo (2 queries simultâneas)
    const [cycleSuggestions, historySuggestions] = await Promise.all([
      fetchCycleDisciplines(supabase, effectiveUserId),
      fetchHistoryDisciplines(supabase, effectiveUserId),
    ])

    let suggestionsSource: "PLAN" | "CYCLE" | "HISTORY" | "NONE" = "NONE"
    let suggestions: DisciplineSuggestion[] = []

    if (cycleSuggestions.length > 0) {
      suggestionsSource = "CYCLE"
      suggestions = cycleSuggestions
    } else if (historySuggestions.length > 0) {
      suggestionsSource = "HISTORY"
      suggestions = historySuggestions
    }

    console.log(
      `[getStudyCenterData] ${Date.now() - t0}ms — ${suggestionsSource}, ${allDisciplines.length} disciplinas`,
    )

    return {
      hasActivePlan: planResult.hasActivePlan,
      planDisciplines: planResult.disciplines,
      allDisciplines,
      suggestionsSource,
      suggestions,
    }
  } catch (error: unknown) {
    console.error("[getStudyCenterData] Exceção:", error)
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { feature: "study-center-data" },
    })
    return {
      hasActivePlan: false,
      planDisciplines: [],
      allDisciplines: [],
      suggestionsSource: "NONE",
      suggestions: [],
    }
  }
}

/**
 * Busca disciplinas do ciclo ativo (matéria atual + próximas).
 * Função interna — reutiliza lógica de get-study-discipline-suggestions.action.ts
 * mas SEM criar novo Supabase client nem nova auth.
 */
async function fetchCycleDisciplines(
  supabase: SupabaseClient,
  userId: string,
): Promise<DisciplineSuggestion[]> {
  try {
    const { data: cycle } = await supabase
      .from("study_cycles")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!cycle) return []

    const { data: items } = await supabase
      .from("study_cycle_items")
      .select("*, discipline:disciplines(id, name, area, color_hex)")
      .eq("cycle_id", cycle.id)
      .order("order", { ascending: true })

    if (!items || items.length === 0) return []

    const overview = buildCycleOverview(
      cycle as unknown as import("@/domain/study-cycle/study-cycle.types").StudyCycle,
      items as unknown as import("@/domain/study-cycle/study-cycle.types").StudyCycleItemWithDetails[],
      [],
    )

    const result: DisciplineSuggestion[] = []

    if (overview.currentItem) {
      result.push({
        id: overview.currentItem.disciplineId,
        name: overview.currentItem.disciplineName,
        area: overview.currentItem.disciplineArea,
        color_hex: overview.currentItem.disciplineColorHex,
        from: "CYCLE",
        metadata: {
          plannedMinutes: overview.currentItem.plannedMinutes,
          studiedMinutes: overview.currentItem.studiedMinutesInRound,
          difficulty: overview.currentItem.difficulty,
          isCurrentInCycle: true,
        },
      })
    }

    for (const nextItem of overview.items) {
      if (result.length >= 4) break
      if (nextItem.itemId === overview.currentItem?.itemId) continue
      if (result.some((s) => s.id === nextItem.disciplineId)) continue
      result.push({
        id: nextItem.disciplineId,
        name: nextItem.disciplineName,
        area: nextItem.disciplineArea,
        color_hex: nextItem.disciplineColorHex,
        from: "CYCLE",
        metadata: {
          plannedMinutes: nextItem.plannedMinutes,
          difficulty: nextItem.difficulty,
          isNextInCycle: true,
        },
      })
    }

    return result
  } catch {
    return []
  }
}

/**
 * Busca disciplinas dos últimos 30 dias de estudo.
 * Função interna — reutiliza lógica de get-study-discipline-suggestions.action.ts
 * mas SEM criar novo Supabase client nem nova auth.
 */
async function fetchHistoryDisciplines(
  supabase: SupabaseClient,
  userId: string,
): Promise<DisciplineSuggestion[]> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const { data: history } = await supabase
      .from("study_history")
      .select("id, discipline_id, started_at, disciplines(id, name, area, color_hex)")
      .eq("user_id", userId)
      .gte("started_at", thirtyDaysAgo.toISOString())
      .order("started_at", { ascending: false })
      .limit(200)

    if (!history || history.length === 0) return []

    const seen = new Set<string>()
    const result: DisciplineSuggestion[] = []

    for (const row of history) {
      const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
      if (!disc?.id || !disc?.name) continue
      if (seen.has(disc.id)) continue
      seen.add(disc.id)

      result.push({
        id: disc.id,
        name: disc.name,
        area: disc.area ?? null,
        color_hex: disc.color_hex ?? null,
        from: "HISTORY",
        metadata: { lastSessionAt: row.started_at },
      })
    }

    return result
  } catch {
    return []
  }
}
