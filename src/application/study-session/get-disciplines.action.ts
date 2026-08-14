"use server"

import * as Sentry from "@sentry/nextjs"
import { type SupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/infrastructure/supabase/server"

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
      .sort((a, b) => {
        // Se houver scores de prioridade definidos no plano
        if (b.priorityScore !== a.priorityScore && (a.priorityScore > 0 || b.priorityScore > 0)) {
          return b.priorityScore - a.priorityScore
        }
        return a.firstOrderIndex - b.firstOrderIndex
      })
      .map((entry) => entry.disc)

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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { hasActivePlan: false, planId: null, planName: null, disciplines: [] }
    }

    return await fetchActivePlanDisciplines(supabase, user.id)
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { hasActivePlan: false, planDisciplines: [], allDisciplines: [] }
    }

    // 1. Buscar disciplinas do plano ativo via service puro
    const planResult = await fetchActivePlanDisciplines(supabase, user.id)

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
