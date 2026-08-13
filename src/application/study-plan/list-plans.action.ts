"use server"

import { createClient } from "@/infrastructure/supabase/server"
import type { PlanType } from "@/domain/study-plan/study-plan.types"

export interface PlanDisciplineSummary {
  id: string
  name: string
  area: string | null
  weeklyMinutes: number
  itemsCount: number
}

export interface PlanCardData {
  id: string
  version: number
  planType: PlanType | null
  active: boolean
  generatedReason: string
  generatedAt: string
  totalMinutes: number
  disciplinesCount: number
  itemsCount: number
  disciplines: PlanDisciplineSummary[]
}

export async function listPlansAction(): Promise<{ data: PlanCardData[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: "Usuário não autenticado" }

    const { data: plans, error } = await supabase
      .from("study_plans")
      .select("id, version, plan_type, total_cycle_minutes, generated_reason, active, generated_at")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })

    if (error) return { data: null, error: error.message }
    if (!plans || plans.length === 0) return { data: [], error: null }

    const cards: PlanCardData[] = []

    for (const plan of plans) {
      const { data: items } = await supabase
        .from("study_plan_items")
        .select("id, discipline_id, duration_minutes, disciplines ( id, name, area )")
        .eq("study_plan_id", plan.id)

      const rows = (items ?? []) as unknown as {
        id: string
        discipline_id: string
        duration_minutes: number
        disciplines: { id: string; name: string; area: string | null } | { id: string; name: string; area: string | null }[]
      }[]

      const byDiscipline = new Map<string, PlanDisciplineSummary>()
      let itemMinutes = 0

      for (const row of rows) {
        const disc = Array.isArray(row.disciplines) ? row.disciplines[0] : row.disciplines
        itemMinutes += row.duration_minutes
        const current = byDiscipline.get(row.discipline_id)
        if (current) {
          current.weeklyMinutes += row.duration_minutes
          current.itemsCount += 1
        } else {
          byDiscipline.set(row.discipline_id, {
            id: row.discipline_id,
            name: disc?.name ?? "Disciplina",
            area: disc?.area ?? null,
            weeklyMinutes: row.duration_minutes,
            itemsCount: 1,
          })
        }
      }

      cards.push({
        id: plan.id,
        version: plan.version,
        planType: plan.plan_type,
        active: plan.active,
        generatedReason: plan.generated_reason ?? "",
        generatedAt: plan.generated_at,
        totalMinutes:
          plan.plan_type === "CICLO_ROTATIVO" && plan.total_cycle_minutes ? plan.total_cycle_minutes : itemMinutes,
        disciplinesCount: byDiscipline.size,
        itemsCount: rows.length,
        disciplines: [...byDiscipline.values()].sort((a, b) => b.weeklyMinutes - a.weeklyMinutes),
      })
    }

    return { data: cards, error: null }
  } catch (err) {
    return { data: null, error: (err as { message?: string }).message ?? "Erro ao listar planos" }
  }
}