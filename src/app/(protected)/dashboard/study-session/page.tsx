import { redirect } from "next/navigation"

import { type StudyPlanItemWithDetails } from "@/domain/study-plan/study-plan.types"
import { ActiveSessionRunner } from "@/features/study-session/components/active-session-runner"
import { createClient } from "@/infrastructure/supabase/server"

export const metadata = {
  title: "Sessão de Estudo",
  description: "Registre e execute sua sessão de estudo no NomeIA.",
}

interface PageProps {
  searchParams: Promise<{ planId?: string; disciplineId?: string }>
}

export default async function StudySessionPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams
  const { planId, disciplineId } = resolvedParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
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
      .single()

    if (item) {
      const discipline = Array.isArray(item.disciplines) ? item.disciplines[0] : item.disciplines
      if (discipline) {
        planItem = {
          ...item,
          discipline,
        }
      }
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
        duration_minutes: 60, // Padrão
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
