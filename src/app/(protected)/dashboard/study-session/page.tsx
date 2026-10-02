import { redirect } from "next/navigation"

import { type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"
import { getEffectiveSessionUser } from "@/application/admin/auth-guard"
import { ActiveSessionRunner } from "@/features/study-session/components/active-session-runner"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Sessão de Estudo",
  description: "Registre e execute sua sessão de estudo no NomeIA.",
}

interface PageProps {
  searchParams: Promise<{ planId?: string; disciplineId?: string; duration?: string }>
}

export default async function StudySessionPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams
  const { planId, disciplineId, duration } = resolvedParams
  const customDurationMinutes = duration ? parseInt(duration, 10) : undefined
  const supabase = await createClient()
  const effectiveUser = await getEffectiveSessionUser(supabase)

  if (!effectiveUser) {
    redirect("/login")
  }

  let planItem: StudyPlanItemWithDetails | undefined

  if (planId) {
    const { data: item } = await supabase
      .from("study_plan_items")
      .select(
        `
        id, study_plan_id, discipline_id, day_of_week,
        duration_minutes, priority, priority_score, recommended_sessions, created_at,
        disciplines ( id, name, area, color_hex )
      `,
      )
      .eq("id", planId)
      .maybeSingle()

    // G2.3 — a visão diária envia `task.itemId ?? task.id`: quando o bloco
    // não tem item vinculado, chega o id do bloco diário (não é um
    // study_plan_items). Resolve para o item real em vez de cair na tela
    // vazia "Nenhum estudo iniciado".
    let resolvedItem = item
    if (!resolvedItem) {
      const { data: block } = await supabase
        .from("study_plan_daily_blocks")
        .select("item_id")
        .eq("id", planId)
        .maybeSingle()
      const refId =
        block && typeof (block as { item_id?: unknown }).item_id === "string"
          ? (block as { item_id: string }).item_id
          : null
      if (refId) {
        const { data: refItem } = await supabase
          .from("study_plan_items")
          .select(
            `
            id, study_plan_id, discipline_id, day_of_week,
            duration_minutes, priority, priority_score, recommended_sessions, created_at,
            disciplines ( id, name, area, color_hex )
          `,
          )
          .eq("id", refId)
          .maybeSingle()
        resolvedItem = refItem
      }
    }

    if (resolvedItem) {
      const discipline = Array.isArray(resolvedItem.disciplines)
        ? resolvedItem.disciplines[0]
        : resolvedItem.disciplines
      if (discipline) {
        planItem = {
          ...resolvedItem,
          discipline,
          duration_minutes:
            customDurationMinutes && !isNaN(customDurationMinutes) && customDurationMinutes > 0
              ? customDurationMinutes
              : resolvedItem.duration_minutes,
        }
      }
    }

    // G2.3 — planId explícito que não resolve em nada (ex.: linha manual
    // `cb-xxx`, URL adulterada): volta ao planejamento em vez da tela vazia
    // silenciosa que parecia bug.
    if (!planItem) {
      redirect("/planejamento")
    }
  } else if (disciplineId) {
    const { data: disc } = await supabase
      .from("disciplines")
      .select("id, name, area, color_hex")
      .eq("id", disciplineId)
      .single()

    if (disc) {
      // Item de planejamento temporário por disciplina selecionada
      planItem = {
        id: "",
        study_plan_id: "",
        discipline_id: disc.id,
        day_of_week: 0,
        duration_minutes:
          customDurationMinutes && !isNaN(customDurationMinutes) && customDurationMinutes > 0
            ? customDurationMinutes
            : 60, // Padrão
        priority: 0,
        priority_score: 0,
        recommended_sessions: 0,
        created_at: "",
        discipline: disc,
      }
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-10 px-4 md:px-8">
      {planItem ? <ActiveSessionRunner planItem={planItem} /> : <ActiveSessionRunner />}
    </div>
  )
}
